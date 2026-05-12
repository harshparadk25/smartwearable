import { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import { apiRequest } from '../api/client';
import VitalsCard from '../components/VitalsCard';
import AlertsList from '../components/AlertsList';
import StatusIndicator from '../components/StatusIndicator';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:7070';

const getStatus = (vitals) => {
  if (!vitals || vitals.heartRate == null) {
    return { label: 'NORMAL', severity: 'NORMAL', detail: 'Awaiting data' };
  }

  if (vitals.heartRate > 120 || vitals.spo2 < 90) {
    return { label: 'ALERT', severity: 'HIGH', detail: 'Critical thresholds breached' };
  }

  if (vitals.temperature > 38) {
    return { label: 'ALERT', severity: 'MEDIUM', detail: 'Temperature elevated' };
  }

  return { label: 'NORMAL', severity: 'NORMAL', detail: 'Vitals in range' };
};

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleTimeString();
};

const Dashboard = () => {
  const [vitals, setVitals] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [scanResults, setScanResults] = useState([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [connectingId, setConnectingId] = useState('');
  const [scanDurationMs, setScanDurationMs] = useState(12000);
  const [gattInfo, setGattInfo] = useState({ characteristics: [], mapping: {} });
  const [gattLoading, setGattLoading] = useState(true);
  const [gattError, setGattError] = useState('');
  const [mappingState, setMappingState] = useState({
    heartRate: '',
    spo2: '',
    temperature: ''
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState({ connected: false, state: 'unknown' });
  const [bridgeLoading, setBridgeLoading] = useState(true);
  const [bridgeError, setBridgeError] = useState('');

  const { token } = useAuth();

  const lastSeenAt = vitals?.timestamp ? new Date(vitals.timestamp) : null;
  const isFresh = lastSeenAt && Date.now() - lastSeenAt.getTime() < 15000;
  const isConnected = Boolean(bridgeStatus.connected || isFresh);
  const status = useMemo(() => getStatus(isConnected ? vitals : null), [vitals, isConnected]);

  const connectionTone = isConnected
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';

  const showHeartRate = Boolean(mappingState.heartRate);
  const showSpo2 = Boolean(mappingState.spo2);
  const showTemperature = Boolean(mappingState.temperature);
  const mappedCount = [showHeartRate, showSpo2, showTemperature].filter(Boolean).length;
  const characteristicOptions = Array.isArray(gattInfo.characteristics)
    ? gattInfo.characteristics
    : [];

  const loadBridgeStatus = async () => {
    setBridgeError('');
    try {
      const response = await fetch(`${BRIDGE_URL}/status`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Bridge status unavailable');
      }
      setBridgeStatus({
        connected: Boolean(data.connected),
        state: data.state || 'unknown',
        target: data.target || null,
        activeDeviceId: data.activeDeviceId || null
      });
    } catch (err) {
      setBridgeError(err.message || 'Bridge status unavailable');
    } finally {
      setBridgeLoading(false);
    }
  };

  const loadGattInfo = async () => {
    setGattError('');
    setGattLoading(true);
    try {
      const response = await fetch(`${BRIDGE_URL}/gatt`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load characteristics');
      }
      setGattInfo(data);
      const mapping = data?.mapping || {};
      setMappingState({
        heartRate: mapping.heartRate || '',
        spo2: mapping.spo2 || '',
        temperature: mapping.temperature || ''
      });
      const emptyMapping =
        !mapping.heartRate && !mapping.spo2 && !mapping.temperature && data?.connected;
      if (emptyMapping) {
        autoMap();
      }
    } catch (err) {
      setGattError(err.message || 'Failed to load characteristics');
    } finally {
      setGattLoading(false);
    }
  };

  const saveMapping = async () => {
    setMappingSaving(true);
    setGattError('');
    try {
      const response = await fetch(`${BRIDGE_URL}/mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heartRate: mappingState.heartRate || null,
          spo2: mappingState.spo2 || null,
          temperature: mappingState.temperature || null
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to save mapping');
      }
      const mapping = data?.mapping || {};
      setMappingState({
        heartRate: mapping.heartRate || '',
        spo2: mapping.spo2 || '',
        temperature: mapping.temperature || ''
      });
    } catch (err) {
      setGattError(err.message || 'Failed to save mapping');
    } finally {
      setMappingSaving(false);
    }
  };

  const autoMap = async () => {
    setAutoMapping(true);
    setGattError('');
    try {
      const response = await fetch(`${BRIDGE_URL}/auto-map`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Auto map failed');
      }
      const mapping = data?.mapping || {};
      setMappingState({
        heartRate: mapping.heartRate || '',
        spo2: mapping.spo2 || '',
        temperature: mapping.temperature || ''
      });
    } catch (err) {
      setGattError(err.message || 'Auto map failed');
    } finally {
      setAutoMapping(false);
    }
  };

  const sendBridgeAuth = async (tokenValue) => {
    if (!tokenValue) return;
    try {
      await fetch(`${BRIDGE_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue })
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [latest, alertList, connectionList] = await Promise.all([
          apiRequest('/api/health/latest'),
          apiRequest('/api/alerts'),
          apiRequest('/api/connections')
        ]);
        if (!active) return;
        setVitals(latest);
        setAlerts(Array.isArray(alertList) ? alertList : []);
        setConnections(Array.isArray(connectionList) ? connectionList : []);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) {
          setLoading(false);
          setConnectionLoading(false);
        }
      }
    };

    load();
    loadGattInfo();
    loadBridgeStatus();

    const statusTimer = setInterval(loadBridgeStatus, 5000);

    const socket = io(API_URL, { transports: ['websocket'] });

    socket.on('healthData', (data) => {
      setVitals(data);
      setLoading(false);
    });

    socket.on('connectionEvent', (event) => {
      setConnections((prev) => [event, ...prev].slice(0, 50));
      setConnectionLoading(false);
    });

    socket.on('alert', (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });

    return () => {
      active = false;
      clearInterval(statusTimer);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    sendBridgeAuth(token);
  }, [token]);

  const scanForDevices = async () => {
    setScanError('');
    setScanLoading(true);
    try {
      const response = await fetch(`${BRIDGE_URL}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs: scanDurationMs })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Scan failed');
      }
      setScanResults(Array.isArray(data.devices) ? data.devices : []);
    } catch (err) {
      setScanError(err.message || 'Scan failed');
    } finally {
      setScanLoading(false);
    }
  };

  const connectToDevice = async (device) => {
    const key = device.id || device.name || '';
    setConnectingId(key);
    setScanError('');
    try {
      const response = await fetch(`${BRIDGE_URL}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: device.id, name: device.name })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Connect failed');
      }
      await loadGattInfo();
    } catch (err) {
      setScanError(err.message || 'Connect failed');
    } finally {
      setConnectingId('');
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Operations</p>
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Live Dashboard</h1>
          <p className="text-sm text-slate-600">
            Real-time vitals and instant alerts streamed from the monitoring engine.
          </p>
        </div>
        <StatusIndicator status={status} />
      </header>

      <section className="mt-6">
        {connectionLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="soft-panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Device status</p>
              <p className="text-lg font-semibold text-slate-900">
                {isConnected ? 'Watch connected' : 'Watch not connected'}
              </p>
              <p className="text-sm text-slate-600">
                {isConnected
                  ? 'Receiving live telemetry.'
                  : 'Connect your watch and start the BLE bridge to stream data.'}
              </p>
              <p className="text-xs text-slate-500">
                Last data: {lastSeenAt ? formatTime(lastSeenAt) : 'No data yet'}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${connectionTone}`}>
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="soft-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Watch scanner</p>
              <p className="text-lg font-semibold text-slate-900">Find nearby watches</p>
              <p className="text-sm text-slate-600">
                Make sure the BLE bridge is running on this machine.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-[0.25em] text-slate-500">Duration</span>
                <select
                  className="input h-10 w-28"
                  value={scanDurationMs}
                  onChange={(event) => setScanDurationMs(Number(event.target.value))}
                >
                  <option value={8000}>8s</option>
                  <option value={12000}>12s</option>
                  <option value={20000}>20s</option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={scanForDevices}
                disabled={scanLoading}
              >
                {scanLoading ? 'Scanning...' : 'Scan for watches'}
              </button>
            </div>
          </div>

          {scanError ? <p className="mt-3 text-sm text-rose-600">{scanError}</p> : null}

          <div className="mt-4 space-y-3">
            {scanLoading ? (
              [...Array(3)].map((_, index) => <Skeleton key={index} className="h-16" />)
            ) : scanResults.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                No watches found. Run scan again or move closer.
              </div>
            ) : (
              scanResults.map((device) => (
                <div
                  key={device.id || device.name}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{device.name || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">ID: {device.id || 'n/a'}</p>
                    <p className="text-xs text-slate-400">RSSI: {device.rssi ?? 'n/a'}</p>
                  </div>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => connectToDevice(device)}
                    disabled={connectingId === (device.id || device.name)}
                  >
                    {connectingId === (device.id || device.name) ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="soft-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Dynamic mapping</p>
              <p className="text-lg font-semibold text-slate-900">Map watch data</p>
              <p className="text-sm text-slate-600">
                Choose which characteristics should drive the live vitals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-outline"
                type="button"
                onClick={loadGattInfo}
                disabled={gattLoading}
              >
                {gattLoading ? 'Refreshing...' : 'Refresh list'}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={autoMap}
                disabled={autoMapping || gattLoading}
              >
                {autoMapping ? 'Auto-mapping...' : 'Auto map'}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={saveMapping}
                disabled={mappingSaving || gattLoading}
              >
                {mappingSaving ? 'Saving...' : 'Save mapping'}
              </button>
            </div>
          </div>

          {gattError ? <p className="mt-3 text-sm text-rose-600">{gattError}</p> : null}

          {gattLoading ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : characteristicOptions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
              No characteristics discovered. Connect a watch and refresh.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-slate-500">Heart Rate</label>
                <select
                  className="input mt-2"
                  value={mappingState.heartRate}
                  onChange={(event) =>
                    setMappingState((prev) => ({ ...prev, heartRate: event.target.value }))
                  }
                >
                  <option value="">Not mapped</option>
                  {characteristicOptions.map((option) => (
                    <option key={`hr-${option.uuid}`} value={option.uuid}>
                      {(option.name || 'Unknown') + ' (' + option.uuid + ')'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-slate-500">SpO2</label>
                <select
                  className="input mt-2"
                  value={mappingState.spo2}
                  onChange={(event) => setMappingState((prev) => ({ ...prev, spo2: event.target.value }))}
                >
                  <option value="">Not mapped</option>
                  {characteristicOptions.map((option) => (
                    <option key={`spo2-${option.uuid}`} value={option.uuid}>
                      {(option.name || 'Unknown') + ' (' + option.uuid + ')'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-slate-500">Temperature</label>
                <select
                  className="input mt-2"
                  value={mappingState.temperature}
                  onChange={(event) =>
                    setMappingState((prev) => ({ ...prev, temperature: event.target.value }))
                  }
                >
                  <option value="">Not mapped</option>
                  {characteristicOptions.map((option) => (
                    <option key={`temp-${option.uuid}`} value={option.uuid}>
                      {(option.name || 'Unknown') + ' (' + option.uuid + ')'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Detected {characteristicOptions.length} characteristics.
          </p>
        </div>
      </section>

      {loading ? (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </section>
      ) : mappedCount === 0 ? (
        <section className="mt-8">
          <div className="soft-panel text-sm text-slate-600">
            No vitals are mapped yet. Use Dynamic Mapping to select characteristics.
          </div>
        </section>
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {showHeartRate ? (
            <VitalsCard
              label="Heart Rate"
              value={isConnected ? vitals?.heartRate : null}
              unit="bpm"
              accent="from-rose-500/10 via-transparent to-rose-500/20"
            />
          ) : null}
          {showSpo2 ? (
            <VitalsCard
              label="SpO2"
              value={isConnected ? vitals?.spo2 : null}
              unit="%"
              accent="from-emerald-500/10 via-transparent to-emerald-500/20"
            />
          ) : null}
          {showTemperature ? (
            <VitalsCard
              label="Temperature"
              value={isConnected ? vitals?.temperature : null}
              unit="C"
              accent="from-amber-500/10 via-transparent to-amber-500/20"
            />
          ) : null}
        </section>
      )}

      <section className="mt-10">
        {loading ? (
          <div className="soft-panel space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : (
          <AlertsList alerts={alerts} />
        )}
      </section>

      <section className="mt-10">
        <div className="soft-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Connection history</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest First</span>
          </div>
          <div className="mt-5 space-y-3">
            {connectionLoading ? (
              [...Array(4)].map((_, index) => <Skeleton key={index} className="h-14" />)
            ) : connections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                No connection events yet.
              </div>
            ) : (
              connections.map((event) => {
                const badgeTone =
                  event.status === 'CONNECTED'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : event.status === 'DISCONNECTED'
                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-amber-100 text-amber-700 border-amber-200';

                return (
                  <div
                    key={event._id || `${event.status}-${event.timestamp}`}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {event.status || 'UNKNOWN'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {event.deviceId || 'unknown'} | {formatTime(event.timestamp)}
                      </p>
                      {event.reason ? (
                        <p className="text-xs text-slate-400">{event.reason}</p>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone}`}>
                      {event.status || 'UNKNOWN'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
