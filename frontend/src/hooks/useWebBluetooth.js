import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

// ── GATT UUIDs ─────────────────────────────────────────────────────────────
const SVC  = { heartRate: 0x180d, temperature: 0x1809, spo2: 0x1822 };
const CHAR = { heartRate: 0x2a37, temperature: 0x2a1c, spo2: 0x2a5e };

// ── Parsers ────────────────────────────────────────────────────────────────
const inRange = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

const parseHeartRate = (dv) => {
  if (!dv || dv.byteLength < 2) return null;
  const flags = dv.getUint8(0);
  const v = (flags & 0x01) && dv.byteLength >= 3
    ? dv.getUint16(1, true) : dv.getUint8(1);
  return inRange(v, 30, 220) ? v : null;
};

const parseSfloat = (dv, offset) => {
  if (!dv || dv.byteLength < offset + 2) return null;
  const raw = dv.getUint16(offset, true);
  if (raw === 0x07ff || raw === 0x0800) return null;
  let m = raw & 0x0fff, e = raw >> 12;
  if (m >= 0x0800) m -= 0x1000;
  if (e >= 0x08)   e -= 0x10;
  return m * Math.pow(10, e);
};

const parseSpO2 = (dv) => {
  const v = parseSfloat(dv, 1) ?? parseSfloat(dv, 0);
  return v !== null && inRange(v, 70, 100) ? v : null;
};

const parseTemperature = (dv) => {
  if (!dv || dv.byteLength < 5) return null;
  const b0 = dv.getUint8(1), b1 = dv.getUint8(2), b2 = dv.getUint8(3);
  let m = b0 | (b1 << 8) | (b2 << 16);
  if (m >= 0x800000) m -= 0x1000000;
  const e = dv.getInt8(4);
  const v = m * Math.pow(10, e);
  return inRange(v, 30, 45) ? v : null;
};

const PARSERS = { heartRate: parseHeartRate, spo2: parseSpO2, temperature: parseTemperature };

// ── Hook ──────────────────────────────────────────────────────────────────
const useWebBluetooth = ({ userId }) => {
  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const [device,        setDevice]        = useState(null);
  const [connected,     setConnected]     = useState(false);
  const [connecting,    setConnecting]    = useState(false);
  const [reconnecting,  setReconnecting]  = useState(false);
  const [pin,           setPin]           = useState(null);
  const [vitals,        setVitals]        = useState({ heartRate: null, spo2: null, temperature: null });
  const [activeMetrics, setActiveMetrics] = useState(new Set());
  const [error,         setError]         = useState('');

  // Refs persist across renders and reconnects
  const deviceRef           = useRef(null);   // kept even after disconnect for auto-reconnect
  const serverRef           = useRef(null);
  const subsRef             = useRef([]);
  const vitalsRef           = useRef({ heartRate: null, spo2: null, temperature: null });
  const sendTimerRef        = useRef(null);
  const reconnectTimerRef   = useRef(null);
  const userIdRef           = useRef(userId);
  const manualDisconnectRef = useRef(false);  // true when user clicked Disconnect

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  // ── Cleanup subscriptions + send timer ───────────────────────────────────
  const cleanup = useCallback(() => {
    if (sendTimerRef.current) { clearInterval(sendTimerRef.current); sendTimerRef.current = null; }
    subsRef.current.forEach(({ char, handler, pollId }) => {
      if (pollId)  clearInterval(pollId);
      if (handler) { try { char.removeEventListener('characteristicvaluechanged', handler); } catch { } }
      try { char.stopNotifications(); } catch { }
    });
    subsRef.current = [];
  }, []);

  // ── Send only real values to backend ─────────────────────────────────────
  const sendVitals = useCallback(async () => {
    const { heartRate, spo2, temperature } = vitalsRef.current;
    if (heartRate == null && spo2 == null && temperature == null) return;
    const payload = { userId: userIdRef.current, timestamp: new Date().toISOString() };
    if (heartRate   != null) payload.heartRate   = heartRate;
    if (spo2        != null) payload.spo2        = spo2;
    if (temperature != null) payload.temperature = temperature;
    try { await apiRequest('/api/health', { method: 'POST', body: payload }); } catch { }
  }, []);

  // ── Register device → get PIN ─────────────────────────────────────────────
  const registerDevice = useCallback(async (btId, btName) => {
    try {
      const res = await apiRequest('/api/devices/register', {
        method: 'POST',
        body: { macAddress: btId, name: btName || 'Smart Watch', userId: userIdRef.current },
      });
      setPin(res.pin);
    } catch { }
  }, []);

  // ── Subscribe to a characteristic (notify + poll fallback) ───────────────
  const subscribe = useCallback(async (char, metric) => {
    const parser = PARSERS[metric];

    const applyValue = (dv) => {
      const v = parser(dv);
      if (v !== null) {
        vitalsRef.current = { ...vitalsRef.current, [metric]: v };
        setVitals((p) => ({ ...p, [metric]: v }));
        setActiveMetrics((prev) => { const s = new Set(prev); s.add(metric); return s; });
      }
    };

    const handler  = (e) => applyValue(e.target.value);
    const readNow  = async () => { try { applyValue(await char.readValue()); } catch { } };

    try {
      char.addEventListener('characteristicvaluechanged', handler);
      await char.startNotifications();
      await readNow();                                    // immediate read — don't wait for a change
      const pollId = setInterval(readNow, 10_000);       // poll alongside notify for slow/stingy watches
      subsRef.current.push({ char, handler, pollId });
    } catch {
      try { char.removeEventListener('characteristicvaluechanged', handler); } catch { }
      await readNow();
      const pollId = setInterval(readNow, 5_000);        // pure-poll fallback
      subsRef.current.push({ char, handler: null, pollId });
    }
  }, []);

  // ── Discover services on a connected server ───────────────────────────────
  const discoverAndSubscribe = useCallback(async (server) => {
    for (const [metric, svcUuid] of Object.entries(SVC)) {
      try {
        const svc  = await server.getPrimaryService(svcUuid);
        const char = await svc.getCharacteristic(CHAR[metric]);
        await subscribe(char, metric);
      } catch { /* watch doesn't expose this standard service */ }
    }
  }, [subscribe]);

  // ── Auto-reconnect ────────────────────────────────────────────────────────
  const attemptReconnect = useCallback(async () => {
    const btDevice = deviceRef.current;
    if (!btDevice || manualDisconnectRef.current) return;

    setReconnecting(true);
    try {
      const server = await btDevice.gatt.connect();
      serverRef.current = server;
      await discoverAndSubscribe(server);

      if (server.connected) {
        setConnected(true);
        if (!sendTimerRef.current) {
          sendTimerRef.current = setInterval(sendVitals, 5_000);
        }
      }
    } catch {
      // Retry in 5 s — keeps trying until manual disconnect or success
      if (!manualDisconnectRef.current) {
        reconnectTimerRef.current = setTimeout(attemptReconnect, 5_000);
      }
    } finally {
      setReconnecting(false);
    }
  }, [discoverAndSubscribe, sendVitals]);

  // ── Device disconnect handler (called by the BLE event) ──────────────────
  const onDeviceDisconnect = useCallback(() => {
    cleanup();
    setConnected(false);
    setVitals({ heartRate: null, spo2: null, temperature: null });
    // Keep deviceRef and activeMetrics — they're reused on reconnect
    if (!manualDisconnectRef.current) {
      reconnectTimerRef.current = setTimeout(attemptReconnect, 2_000);
    }
  }, [cleanup, attemptReconnect]);

  // ── Page Visibility: reconnect when tab comes back into focus ─────────────
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        deviceRef.current &&
        !serverRef.current?.connected &&
        !manualDisconnectRef.current
      ) {
        clearReconnectTimer();
        attemptReconnect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [attemptReconnect]);

  // ── User-initiated connect ────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Web Bluetooth is not supported. Use Chrome or Edge on Android/Windows/Mac.');
      return;
    }
    setError('');
    manualDisconnectRef.current = false;
    setConnecting(true);

    try {
      const btDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SVC.heartRate, SVC.temperature, SVC.spo2],
      });

      deviceRef.current = btDevice;    // persist for auto-reconnect
      setDevice(btDevice);

      btDevice.addEventListener('gattserverdisconnected', onDeviceDisconnect);

      const server = await btDevice.gatt.connect();
      serverRef.current = server;

      registerDevice(btDevice.id, btDevice.name);
      await discoverAndSubscribe(server);

      if (!server.connected) return;

      setConnected(true);
      sendTimerRef.current = setInterval(sendVitals, 5_000);

    } catch (err) {
      if (err.name !== 'NotFoundError') setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [isSupported, onDeviceDisconnect, registerDevice, discoverAndSubscribe, sendVitals]);

  // ── User-initiated disconnect ─────────────────────────────────────────────
  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    cleanup();
    try { serverRef.current?.disconnect(); } catch { }
    deviceRef.current = null;
    setConnected(false);
    setReconnecting(false);
    setDevice(null);
    setVitals({ heartRate: null, spo2: null, temperature: null });
    setActiveMetrics(new Set());
    setPin(null);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => () => { clearReconnectTimer(); cleanup(); }, [cleanup]);

  return {
    isSupported,
    connected,
    connecting,
    reconnecting,   // true while auto-reconnect is in progress
    device,
    vitals,
    activeMetrics,
    pin,
    error,
    connect,
    disconnect,
  };
};

export default useWebBluetooth;
