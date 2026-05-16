const noble = require('@abandonware/noble');
const axios = require('axios');
const config = require('./config.json');
const http = require('http');

const scanOnly = process.argv.includes('--scan');

const normalizeUuid = (value) => (value || '').replace(/-/g, '').toLowerCase();
const toNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback);

let targetName = (process.env.BLE_DEVICE_NAME || config.device.name || '').trim();
let targetId = normalizeUuid(process.env.BLE_DEVICE_ID || config.device.id);
const apiUrl = process.env.API_URL || config.backend.apiUrl;
const connectionUrl =
  process.env.CONNECTION_URL ||
  config.backend.connectionUrl ||
  apiUrl.replace(/\/api\/health\/?$/, '/api/connections');
const deviceRegistrationUrl =
  process.env.DEVICE_REGISTRATION_URL ||
  config.backend.deviceRegistrationUrl ||
  apiUrl.replace(/\/api\/health\/?$/, '/api/devices/register');
const configUserId = process.env.USER_ID || config.backend.userId;
let userId = configUserId; // overwritten by resolveUserIdFromToken() once a JWT is set
let apiToken = process.env.API_TOKEN || '';
const authMeUrl = apiUrl.replace(/\/api\/health\/?$/, '/api/auth/me');
const bridgePort = Number(process.env.BRIDGE_PORT || config.bridgePort || 7070);
const bridgeOrigin = process.env.BRIDGE_ORIGIN || config.bridgeOrigin || 'http://localhost:5173';
const reconnectDelayMs = Number(process.env.RECONNECT_DELAY_MS || config.reconnectDelayMs || 3000);
const allowDuplicates = Boolean(config.scan && config.scan.allowDuplicates);
const scanServiceUuids = (config.scan && config.scan.serviceUuids) || [];
const readIntervalMs = Number(process.env.READ_INTERVAL_MS || config.readIntervalMs || 5000);
const mappingProbeMs = Number(process.env.MAPPING_PROBE_MS || config.mappingProbeMs || 1500);

const knownCharacteristicNames = {
  '2a37': 'Heart Rate Measurement',
  '2a19': 'Battery Level',
  '2a5e': 'Pulse Oximeter Spot-Check Measurement',
  '2a1c': 'Temperature Measurement',
  '2a6e': 'Temperature',
  '2a29': 'Manufacturer Name',
  '2a24': 'Model Number',
  '2a26': 'Firmware Revision'
};

const getConfigMapping = (key) => normalizeUuid((config.mapping && config.mapping[key]) || '');

const charUuids = {
  heartRate: normalizeUuid(config.characteristics.heartRateMeasurement),
  spo2: normalizeUuid(config.characteristics.spo2Measurement),
  temperature: normalizeUuid(config.characteristics.temperatureMeasurement)
};

const defaults = {
  heartRate: Number(config.defaults.heartRate),
  spo2: Number(config.defaults.spo2),
  temperature: Number(config.defaults.temperature)
};

let mapping = {
  heartRate: getConfigMapping('heartRate') || null,
  spo2: getConfigMapping('spo2') || null,
  temperature: getConfigMapping('temperature') || null
};

// Initialize spo2/temperature to null — only set once the watch actually provides them.
// Using defaults here would cause the bridge to silently send stale placeholder values.
const lastVitals = { heartRate: null, spo2: null, temperature: null };

// Vitals buffered while userId is not yet resolved from a JWT token
const pendingVitals = [];


let activePeripheral = null;
let activeDeviceId = null;
let activeDevicePin = null;
let shuttingDown = false;
let manualScanActive = false;
let manualScanPromise = null;
let manualScanResults = new Map();
let discoveredCharacteristics = new Map();
let discoveredMeta = [];
const subscriptions = new Map();
const readIntervals = new Map();

const hasTarget = () => Boolean(targetName || targetId);

const log = (message) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': bridgeOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

const isTarget = (peripheral) => {
  if (!targetName && !targetId) return false;
  const name = (peripheral.advertisement.localName || '').toLowerCase();
  const nameMatch = targetName && name.includes(targetName.toLowerCase());
  const idMatch = targetId && normalizeUuid(peripheral.id || peripheral.uuid || peripheral.address) === targetId;
  return Boolean(nameMatch || idMatch);
};

const resolveDeviceId = (peripheral) => {
  const id = normalizeUuid(peripheral?.id || peripheral?.uuid || peripheral?.address);
  return id || targetId || targetName || 'unknown';
};

const collectScanResult = (peripheral) => {
  const id = resolveDeviceId(peripheral);
  if (!id) return;
  const name = peripheral.advertisement.localName || 'unknown';
  const services = peripheral.advertisement.serviceUuids || [];
  manualScanResults.set(id, {
    id,
    name,
    rssi: peripheral.rssi,
    services
  });
};

const parseHeartRate = (buffer) => {
  if (!buffer || buffer.length < 2) return null;
  const flags = buffer.readUInt8(0);
  const isUint16 = flags & 0x01;
  if (isUint16 && buffer.length >= 3) {
    return buffer.readUInt16LE(1);
  }
  return buffer.readUInt8(1);
};

const parseSfloat = (buffer, offset) => {
  if (buffer.length < offset + 2) return null;
  const raw = buffer.readUInt16LE(offset);
  if (raw === 0x07ff) return null;
  let mantissa = raw & 0x0fff;
  let exponent = raw >> 12;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  if (exponent >= 0x08) exponent -= 0x10;
  return mantissa * Math.pow(10, exponent);
};

const parseFloat11073 = (buffer, offset) => {
  if (buffer.length < offset + 4) return null;
  const mantissa = buffer.readIntLE(offset, 3);
  const exponent = buffer.readInt8(offset + 3);
  return mantissa * Math.pow(10, exponent);
};

const parseSpo2 = (buffer) => {
  const primary = parseSfloat(buffer, 1);
  if (primary != null) return primary;
  return parseSfloat(buffer, 0);
};

const parseTemperatureValue = (buffer) => {
  const primary = parseFloat11073(buffer, 1);
  if (primary != null) return primary;
  return parseFloat11073(buffer, 0);
};

const metricConfig = {
  heartRate: {
    field: 'heartRate',
    parser: parseHeartRate,
    format: (value) => Math.round(value)
  },
  spo2: {
    field: 'spo2',
    parser: parseSpo2,
    format: (value) => Number(value.toFixed(1))
  },
  temperature: {
    field: 'temperature',
    parser: parseTemperatureValue,
    format: (value) => Number(value.toFixed(1))
  }
};


const metricRanges = {
  heartRate: { min: 30, max: 220 },
  spo2: { min: 70, max: 100 },
  temperature: { min: 30, max: 45 }
};

const isPlausible = (metric, value) => {
  if (!Number.isFinite(value)) return false;
  const range = metricRanges[metric];
  if (!range) return true;
  return value >= range.min && value <= range.max;
};

const normalizeMappingValue = (value) => {
  const normalized = normalizeUuid(value || '');
  return normalized || null;
};

const describeCharacteristic = (characteristic) => {
  const uuid = normalizeUuid(characteristic.uuid);
  const serviceUuid = normalizeUuid(characteristic._serviceUuid || characteristic.serviceUuid || '');
  const properties = Array.isArray(characteristic.properties) ? characteristic.properties : [];
  const name = knownCharacteristicNames[uuid] || 'Unknown';
  return { uuid, serviceUuid, properties, name };
};

const handleMetricData = (metric, data) => {
  const config = metricConfig[metric];
  if (!config) return;
  const parsed = config.parser(data);
  if (parsed == null) return;
  const value = config.format(parsed);
  const label = metric === 'heartRate' ? 'heart rate' : metric;
  log(`Receiving ${label}: ${value}`);
  sendVitals({ [config.field]: value });
};

const unsubscribeAsync = (characteristic) =>
  new Promise((resolve, reject) => {
    characteristic.unsubscribe((err) => (err ? reject(err) : resolve()));
  });

const readOnce = (characteristic) =>
  new Promise((resolve) => {
    characteristic.read((err, data) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(data || null);
    });
  });

const notifyOnce = (characteristic, timeoutMs) =>
  new Promise((resolve) => {
    let settled = false;
    let subscribed = false;

    const cleanup = async () => {
      characteristic.removeListener('data', handler);
      clearTimeout(timer);
      if (subscribed) {
        try {
          await unsubscribeAsync(characteristic);
        } catch {
          // ignore
        }
      }
    };

    const handler = (data) => {
      if (settled) return;
      settled = true;
      cleanup().then(() => resolve(data || null));
    };

    characteristic.on('data', handler);
    characteristic.subscribe((err) => {
      if (err) {
        settled = true;
        cleanup().then(() => resolve(null));
        return;
      }
      subscribed = true;
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup().then(() => resolve(null));
    }, timeoutMs);
  });

const probeCharacteristic = async (metric, characteristic) => {
  const properties = Array.isArray(characteristic.properties) ? characteristic.properties : [];
  let data = null;

  if (properties.includes('notify') || properties.includes('indicate')) {
    data = await notifyOnce(characteristic, mappingProbeMs);
  } else if (properties.includes('read')) {
    data = await readOnce(characteristic);
  }

  if (!data) return null;
  const config = metricConfig[metric];
  if (!config) return null;
  const parsed = config.parser(data);
  if (parsed == null) return null;
  const value = config.format(parsed);
  return isPlausible(metric, value) ? value : null;
};

const autoMapDynamic = async () => {
  if (!discoveredCharacteristics.size) return;

  const used = new Set(Object.values(mapping).filter(Boolean));
  const candidates = Array.from(discoveredCharacteristics.entries())
    .filter(([, characteristic]) => {
      const properties = Array.isArray(characteristic.properties) ? characteristic.properties : [];
      return properties.includes('notify') || properties.includes('indicate') || properties.includes('read');
    })
    .sort(([a], [b]) => a.localeCompare(b));

  for (const metric of Object.keys(metricConfig)) {
    if (mapping[metric]) continue;
    for (const [uuid, characteristic] of candidates) {
      if (used.has(uuid)) continue;
      const value = await probeCharacteristic(metric, characteristic);
      if (value != null) {
        mapping[metric] = uuid;
        used.add(uuid);
        log(`[mapping] auto ${metric} -> ${uuid} (${value})`);
        break;
      }
    }
  }
};

const clearMetricSubscription = async (metric) => {
  const subscription = subscriptions.get(metric);
  if (subscription) {
    subscription.characteristic.removeListener('data', subscription.listener);
    if (subscription.subscribed) {
      try {
        await unsubscribeAsync(subscription.characteristic);
      } catch {
        // ignore
      }
    }
    subscriptions.delete(metric);
  }

  const intervalId = readIntervals.get(metric);
  if (intervalId) {
    clearInterval(intervalId);
    readIntervals.delete(metric);
  }
};

const clearAllSubscriptions = async () => {
  await Promise.all(Object.keys(metricConfig).map((metric) => clearMetricSubscription(metric)));
};

const subscribeMetric = async (metric, characteristic) => {
  const properties = Array.isArray(characteristic.properties) ? characteristic.properties : [];
  const listener = (data) => handleMetricData(metric, data);

  if (properties.includes('notify') || properties.includes('indicate')) {
    characteristic.on('data', listener);
    await subscribeAsync(characteristic);
    subscriptions.set(metric, { characteristic, listener, subscribed: true });
    log(`[mapping] subscribed ${metric} -> ${characteristic.uuid}`);
    return;
  }

  if (properties.includes('read')) {
    const intervalId = setInterval(() => {
      characteristic.read((err, data) => {
        if (!err && data) {
          handleMetricData(metric, data);
        }
      });
    }, readIntervalMs);
    readIntervals.set(metric, intervalId);
    subscriptions.set(metric, { characteristic, listener, subscribed: false });
    log(`[mapping] polling ${metric} -> ${characteristic.uuid}`);
    return;
  }

  log(`[mapping] ${metric} -> ${characteristic.uuid} has no notify/read`);
};

const autoMapStandard = () => {
  const hrUuid = charUuids.heartRate || '2a37';
  if (!mapping.heartRate && hrUuid && discoveredCharacteristics.has(hrUuid)) {
    mapping.heartRate = hrUuid;
  }

  // Standard SpO2: Pulse Oximeter Spot-Check (2a5e) or Continuous (2a5f)
  const spo2Candidates = [charUuids.spo2, '2a5e', '2a5f'].filter(Boolean);
  if (!mapping.spo2) {
    for (const uuid of spo2Candidates) {
      if (discoveredCharacteristics.has(uuid)) { mapping.spo2 = uuid; break; }
    }
  }

  // Standard temperature: Temperature Measurement (2a1c) or Temperature (2a6e)
  const tempCandidates = [charUuids.temperature, '2a1c', '2a6e'].filter(Boolean);
  if (!mapping.temperature) {
    for (const uuid of tempCandidates) {
      if (discoveredCharacteristics.has(uuid)) { mapping.temperature = uuid; break; }
    }
  }
};

const applyMapping = async () => {
  await clearAllSubscriptions();
  if (!activePeripheral) return;

  for (const metric of Object.keys(metricConfig)) {
    const uuid = mapping[metric];
    if (!uuid) continue;
    const characteristic = discoveredCharacteristics.get(uuid);
    if (!characteristic) {
      log(`[mapping] ${metric} -> ${uuid} not found`);
      continue;
    }
    await subscribeMetric(metric, characteristic);
  }
};

const sendVitals = async (patch) => {
  Object.assign(lastVitals, patch);

  // Only include fields that have been genuinely received from the watch.
  // HR falls back to default so we always have at least one metric to send.
  const payload = {
    heartRate: toNumber(lastVitals.heartRate, defaults.heartRate),
    timestamp: new Date().toISOString(),
    ...(lastVitals.spo2        != null ? { spo2:        lastVitals.spo2        } : {}),
    ...(lastVitals.temperature != null ? { temperature: lastVitals.temperature } : {}),
    ...(activeDevicePin ? { devicePin: activeDevicePin } : {}),
  };

  // Buffer data until the real userId is resolved from the JWT token
  if (!userId) {
    pendingVitals.push(payload);
    if (pendingVitals.length > 20) pendingVitals.shift(); // keep last 20 max
    log('[vitals] buffered — waiting for user to log in on the Dashboard');
    return;
  }

  try {
    const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined;
    await axios.post(apiUrl, { ...payload, userId }, { timeout: 5000, headers });
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    log(`Send failed: ${status || 'n/a'} ${message}`);
  }
};

// Resolve the real userId from the JWT token so each user's bridge sends data
// under their own account — not the hardcoded config userId
const flushPendingVitals = async () => {
  if (!pendingVitals.length) return;
  log(`[auth] flushing ${pendingVitals.length} buffered vitals readings`);
  const toSend = pendingVitals.splice(0, pendingVitals.length);
  for (const payload of toSend) {
    try {
      const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined;
      await axios.post(apiUrl, { ...payload, userId }, { timeout: 5000, headers });
    } catch { /* ignore flush errors */ }
  }
};

const resolveUserIdFromToken = async () => {
  if (!apiToken) return;
  try {
    const response = await axios.get(authMeUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: 5000
    });
    if (response.data?._id) {
      userId = response.data._id;
      log(`[auth] userId resolved: ${userId} (${response.data.name || ''})`);
      // Send any vitals that arrived before we knew the userId
      flushPendingVitals().catch(() => {});
    }
  } catch (err) {
    const status = err.response?.status;
    log(`[auth] could not resolve userId: ${status || err.message}`);
  }
};

const registerDevice = async () => {
  if (!userId) return; // wait until userId is known
  const payload = {
    macAddress: activeDeviceId || '',
    name: targetName || 'Smart Watch',
    userId
  };
  try {
    const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined;
    const response = await axios.post(deviceRegistrationUrl, payload, { timeout: 5000, headers });
    activeDevicePin = String(response.data.pin || '');
    log(`[device] registered — PIN: ${activeDevicePin}`);
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    log(`Device registration failed: ${status || 'n/a'} ${message}`);
  }
};

const sendConnectionEvent = async (status, reason) => {
  if (!userId) return; // wait until userId is known
  const payload = {
    deviceId: activeDeviceId || targetId || targetName || 'unknown',
    status,
    reason: reason || null,
    userId,
    timestamp: new Date().toISOString()
  };

  try {
    const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined;
    await axios.post(connectionUrl, payload, { timeout: 5000, headers });
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    log(`Connection event failed: ${status || 'n/a'} ${message}`);
  }
};

const connectAsync = (peripheral) =>
  new Promise((resolve, reject) => {
    peripheral.connect((err) => (err ? reject(err) : resolve()));
  });

const discoverAllAsync = (peripheral) =>
  new Promise((resolve, reject) => {
    peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) =>
      err ? reject(err) : resolve({ services, characteristics })
    );
  });

const subscribeAsync = (characteristic) =>
  new Promise((resolve, reject) => {
    characteristic.subscribe((err) => (err ? reject(err) : resolve()));
  });

const startScanning = () => {
  if (shuttingDown) return;
  if (!scanOnly && !hasTarget()) return;
  try {
    noble.startScanning(scanServiceUuids, allowDuplicates, (err) => {
      if (err) {
        log(`Scan start error: ${err.message}`);
      } else {
        log('Scanning for BLE devices...');
      }
    });
  } catch (err) {
    log(`Scan start exception: ${err.message}`);
  }
};

const performManualScan = async (durationMs = 8000) => {
  if (manualScanActive) {
    return manualScanPromise;
  }

  if (noble.state !== 'poweredOn') {
    throw new Error(`BLE state: ${noble.state}`);
  }

  manualScanActive = true;
  manualScanResults = new Map();

  manualScanPromise = new Promise((resolve, reject) => {
    noble.stopScanning();
    noble.startScanning(scanServiceUuids, true, (err) => {
      if (err) {
        manualScanActive = false;
        reject(err);
        return;
      }

      setTimeout(() => {
        noble.stopScanning();
        manualScanActive = false;
        const devices = Array.from(manualScanResults.values()).sort(
          (a, b) => (b.rssi || -999) - (a.rssi || -999)
        );
        log(`[scan] devices ${JSON.stringify(devices)}`);
        resolve(devices);

        if (!scanOnly && !activePeripheral && hasTarget()) {
          startScanning();
        }
      }, durationMs);
    });
  });

  return manualScanPromise;
};

const scheduleReconnect = () => {
  if (shuttingDown) return;
  setTimeout(() => {
    if (!activePeripheral && hasTarget()) startScanning();
  }, reconnectDelayMs);
};

const onDisconnect = () => {
  log('Device disconnected. Reconnecting...');
  sendConnectionEvent('DISCONNECTED', 'disconnect');
  activePeripheral = null;
  activeDeviceId = null;
  activeDevicePin = null;
  clearAllSubscriptions().catch(() => {});
  scheduleReconnect();
};

const handleDiscover = async (peripheral) => {
  if (manualScanActive) {
    collectScanResult(peripheral);
    return;
  }

  if (scanOnly) {
    const name = peripheral.advertisement.localName || 'unknown';
    const services = (peripheral.advertisement.serviceUuids || []).join(',');
    log(`Found: name="${name}" id=${peripheral.id} uuid=${peripheral.uuid} rssi=${peripheral.rssi} services=[${services}]`);
    return;
  }

  if (!hasTarget() || activePeripheral || !isTarget(peripheral)) return;

  activePeripheral = peripheral;
  activeDeviceId = resolveDeviceId(peripheral);
  noble.stopScanning();

  try {
    await connectAsync(peripheral);
    log('Connected to device');
    sendConnectionEvent('CONNECTED', 'connected');
    registerDevice().catch(() => {});

    peripheral.on('disconnect', onDisconnect);

    const { characteristics } = await discoverAllAsync(peripheral);

    discoveredCharacteristics = new Map();
    discoveredMeta = characteristics
      .map((characteristic) => {
        const meta = describeCharacteristic(characteristic);
        if (meta.uuid) {
          discoveredCharacteristics.set(meta.uuid, characteristic);
        }
        return meta;
      })
      .filter((meta) => meta.uuid);

    log(`[gatt] discovered ${discoveredMeta.length} characteristics`);

    if (charUuids.spo2 && !discoveredCharacteristics.has(charUuids.spo2)) {
      log('SpO2 characteristic not found');
    }

    if (charUuids.temperature && !discoveredCharacteristics.has(charUuids.temperature)) {
      log('Temperature characteristic not found');
    }

    autoMapStandard();
    await autoMapDynamic();
    log(`[mapping] active ${JSON.stringify(mapping)}`);
    await applyMapping();
  } catch (err) {
    log(`Connection flow error: ${err.message}`);
    sendConnectionEvent('ERROR', err.message);
    try {
      peripheral.disconnect();
    } catch {
      // ignore
    }
    activePeripheral = null;
    discoveredMeta = [];
    discoveredCharacteristics = new Map();
    clearAllSubscriptions().catch(() => {});
    scheduleReconnect();
  }
};

// If a token was provided via env var, resolve the userId immediately
if (apiToken) resolveUserIdFromToken().catch(() => {});

if (!scanOnly && !targetName && !targetId) {
  log('No target device selected. Use scan to pick a watch.');
}

noble.on('stateChange', (state) => {
  if (state === 'poweredOn') {
    if (scanOnly || hasTarget()) {
      startScanning();
    }
  } else {
    const hint = state === 'poweredOff'
      ? 'BLE state: poweredOff — enable Bluetooth in your system settings, then restart.'
      : `BLE state: ${state}`;
    log(hint);
    noble.stopScanning();
  }
});

noble.on('discover', handleDiscover);

noble.on('scanStop', () => {
  if (!activePeripheral && !scanOnly) {
    log('Scan stopped, waiting to restart...');
  }
});

process.on('SIGINT', async () => {
  shuttingDown = true;
  log('Shutting down...');
  noble.stopScanning();
  if (activePeripheral) {
    activePeripheral.disconnect();
  }
  setTimeout(() => process.exit(0), 500);
});

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (pathname === '/scan' && req.method === 'POST') {
    const body = await readBody(req);
    const durationMs = Number(body.durationMs) || 8000;
    try {
      const devices = await performManualScan(durationMs);
      sendJson(res, 200, { devices });
    } catch (err) {
      sendJson(res, 500, { message: err.message || 'Scan failed' });
    }
    return;
  }

  if (pathname === '/auth' && req.method === 'POST') {
    const body = await readBody(req);
    const nextToken = String(body.token || '').trim();
    if (!nextToken) {
      sendJson(res, 400, { message: 'Token is required' });
      return;
    }
    apiToken = nextToken;
    // Resolve the real userId for this token immediately
    resolveUserIdFromToken().catch(() => {});
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/connect' && req.method === 'POST') {
    const body = await readBody(req);
    const nextId = normalizeUuid(body.id);
    const nextName = String(body.name || '').trim();

    if (!nextId && !nextName) {
      sendJson(res, 400, { message: 'Device id or name is required' });
      return;
    }

    targetId = nextId;
    targetName = nextName;

    if (activePeripheral) {
      try {
        activePeripheral.disconnect();
      } catch {
        // ignore
      }
    }

    activePeripheral = null;
    activeDeviceId = nextId || nextName || activeDeviceId;

    if (noble.state === 'poweredOn') {
      startScanning();
    }

    sendJson(res, 200, { ok: true, target: { id: targetId, name: targetName } });
    return;
  }

  if (pathname === '/auto-map' && req.method === 'POST') {
    try {
      await autoMapDynamic();
      await applyMapping();
      sendJson(res, 200, { ok: true, mapping });
    } catch (err) {
      sendJson(res, 500, { message: err.message || 'Auto map failed' });
    }
    return;
  }

  if (pathname === '/gatt' && req.method === 'GET') {
    sendJson(res, 200, {
      connected: Boolean(activePeripheral),
      target: { id: targetId || null, name: targetName || null },
      mapping,
      characteristics: discoveredMeta
    });
    return;
  }

  if (pathname === '/mapping' && req.method === 'POST') {
    const body = await readBody(req);
    const nextMapping = { ...mapping };

    if (Object.prototype.hasOwnProperty.call(body, 'heartRate')) {
      nextMapping.heartRate = normalizeMappingValue(body.heartRate);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'spo2')) {
      nextMapping.spo2 = normalizeMappingValue(body.spo2);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'temperature')) {
      nextMapping.temperature = normalizeMappingValue(body.temperature);
    }

    mapping = nextMapping;
    log(`[mapping] updated ${JSON.stringify(mapping)}`);

    if (activePeripheral) {
      applyMapping().catch((err) => log(`[mapping] apply failed: ${err.message}`));
    }

    sendJson(res, 200, { ok: true, mapping });
    return;
  }

  if (pathname === '/pin' && req.method === 'GET') {
    sendJson(res, 200, {
      pin: activeDevicePin || null,
      connected: Boolean(activePeripheral)
    });
    return;
  }

  if (pathname === '/status' && req.method === 'GET') {
    sendJson(res, 200, {
      target: { id: targetId || null, name: targetName || null },
      connected: Boolean(activePeripheral),
      activeDeviceId: activeDeviceId || null,
      devicePin: activeDevicePin || null,
      userId: userId || null,
      ready: Boolean(userId),
      buffered: pendingVitals.length,
      state: noble.state
    });
    return;
  }

  sendJson(res, 404, { message: 'Not found' });
});

server.listen(bridgePort, () => {
  log(`Bridge control server listening on ${bridgePort}`);
});
