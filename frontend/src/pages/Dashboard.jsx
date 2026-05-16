import { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import { apiRequest } from '../api/client';
import useWebBluetooth from '../hooks/useWebBluetooth';
import VitalsCard from '../components/VitalsCard';
import AlertsList from '../components/AlertsList';
import StatusIndicator from '../components/StatusIndicator';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';

const BRIDGE_URL = '/bridge';

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
  const [vitals, setVitals]         = useState(null);
  const [alerts, setAlerts]         = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState({ connected: false, state: 'unknown' });

  const { user, token } = useAuth();
  const wbt = useWebBluetooth({ userId: user?._id });

  const lastSeenAt  = vitals?.timestamp ? new Date(vitals.timestamp) : null;
  const isFresh     = lastSeenAt && Date.now() - lastSeenAt.getTime() < 15000;
  const isConnected = Boolean(wbt.connected || bridgeStatus.connected || isFresh);
  const status      = useMemo(() => getStatus(isConnected ? vitals : null), [vitals, isConnected]);
  const devicePin   = wbt.pin || bridgeStatus.devicePin;

  const connectionTone = isConnected
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';

  // Poll bridge for PIN + connected state
  const loadBridgeStatus = async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setBridgeStatus({
        connected:      Boolean(data.connected),
        state:          data.state || 'unknown',
        target:         data.target || null,
        activeDeviceId: data.activeDeviceId || null,
        devicePin:      data.devicePin || null
      });
    } catch { /* bridge not running — ignore */ }
  };

  // Send JWT to bridge so it can resolve the correct userId
  const sendBridgeAuth = async (t) => {
    if (!t) return;
    try {
      await fetch(`${BRIDGE_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t })
      });
    } catch { /* bridge not running — ignore */ }
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
      } catch { /* ignore */ }
      finally { if (active) setLoading(false); }
    };

    load();
    loadBridgeStatus();
    const statusTimer = setInterval(loadBridgeStatus, 5000);

    const socket = io({ path: '/socket.io' });
    socket.on('healthData',     (d) => { setVitals(d); setLoading(false); });
    socket.on('connectionEvent',(e) => setConnections((p) => [e, ...p].slice(0, 50)));
    socket.on('alert',          (a) => setAlerts((p) => [a, ...p].slice(0, 50)));

    return () => { active = false; clearInterval(statusTimer); socket.disconnect(); };
  }, []);

  useEffect(() => { sendBridgeAuth(token); }, [token]);

  // Only show values actually received from the watch — no placeholders.
  const displayVitals = isConnected ? {
    heartRate:   vitals?.heartRate   ?? null,
    spo2:        vitals?.spo2        ?? null,
    temperature: vitals?.temperature ?? null,
  } : { heartRate: null, spo2: null, temperature: null };

  // Metrics the browser Bluetooth hook confirmed are live on this watch
  const liveMetrics = wbt.activeMetrics;

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Operations</p>
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Live Dashboard</h1>
          <p className="text-sm text-slate-600">
            Real-time vitals streamed from your connected watch.
          </p>
        </div>
        <StatusIndicator status={status} />
      </header>

      {/* ── Device status ────────────────────────────────────────────── */}
      <div className="soft-panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Device status</p>
          <p className="text-lg font-semibold text-slate-900">
            {isConnected ? (wbt.device?.name || bridgeStatus.target?.name || 'Watch connected') : 'Watch not connected'}
          </p>
          <p className="text-sm text-slate-600">
            {isConnected ? 'Receiving live telemetry.' : 'Use the button below to connect your watch.'}
          </p>
          <p className="text-xs text-slate-500">
            Last data: {lastSeenAt ? formatTime(lastSeenAt) : 'No data yet'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${connectionTone}`}>
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          {devicePin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Device PIN</span>
              <span className="rounded-lg bg-indigo-50 px-3 py-1 font-mono text-base font-bold tracking-[0.3em] text-indigo-700">
                {devicePin}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Browser Bluetooth ────────────────────────────────────────── */}
      <div className="soft-panel space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Browser Bluetooth</p>
            <p className="text-lg font-semibold text-slate-900">
              {wbt.connected ? wbt.device?.name || 'Watch connected' : 'Connect your watch directly'}
            </p>
            <p className="text-sm text-slate-600">
              {wbt.isSupported
                ? wbt.connected
                  ? `Device ID: ${wbt.device?.id?.slice(0, 16) || 'n/a'}`
                  : 'Works on any phone, tablet or laptop with Chrome / Edge.'
                : 'Web Bluetooth is not supported. Use Chrome or Edge.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {wbt.connected ? (
              <>
                {wbt.pin && (
                  <span className="rounded-lg bg-indigo-50 px-3 py-1 font-mono text-sm font-bold tracking-[0.3em] text-indigo-700">
                    {wbt.pin}
                  </span>
                )}
                <button className="btn btn-outline text-xs text-rose-600" type="button" onClick={wbt.disconnect}>
                  Disconnect
                </button>
              </>
            ) : wbt.reconnecting ? (
              <span className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Reconnecting…
              </span>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                onClick={wbt.connect}
                disabled={!wbt.isSupported || wbt.connecting}
              >
                {wbt.connecting ? 'Connecting…' : 'Connect Watch'}
              </button>
            )}
          </div>
        </div>
        {wbt.error && <p className="text-sm text-rose-600">{wbt.error}</p>}
      </div>

      {/* ── Live Vitals ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <VitalsCard
              label="Heart Rate"
              value={displayVitals.heartRate}
              unit="bpm"
              accent="from-rose-500/10 via-transparent to-rose-500/20"
            />
            <VitalsCard
              label="SpO₂"
              value={displayVitals.spo2}
              unit="%"
              accent="from-emerald-500/10 via-transparent to-emerald-500/20"
            />
            <VitalsCard
              label="Temperature"
              value={displayVitals.temperature}
              unit="°C"
              accent="from-amber-500/10 via-transparent to-amber-500/20"
            />
          </div>
          {/* Show which metrics this watch doesn't expose via standard GATT */}
          {wbt.connected && liveMetrics.size > 0 && liveMetrics.size < 3 && (
            <p className="text-xs text-slate-400">
              Live from watch:{' '}
              <span className="font-medium text-slate-600">
                {['heartRate', 'spo2', 'temperature']
                  .filter((m) => liveMetrics.has(m))
                  .map((m) => ({ heartRate: 'Heart Rate', spo2: 'SpO₂', temperature: 'Temp' }[m]))
                  .join(', ')}
              </span>
              {' '}· Other metrics not available on this watch model.
            </p>
          )}
          {wbt.connected && liveMetrics.size === 0 && (
            <p className="text-xs text-amber-600">
              Watch connected but no standard GATT metrics found yet. Data will appear once the watch sends a reading.
            </p>
          )}
        </>
      )}

      {/* ── Alerts ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="soft-panel space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (
        <AlertsList alerts={alerts} />
      )}

      {/* ── Connection history ───────────────────────────────────────── */}
      <div className="soft-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Connection history</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest first</span>
        </div>
        <div className="mt-5 space-y-3">
          {connections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
              No connection events yet.
            </div>
          ) : (
            connections.map((event) => {
              const tone =
                event.status === 'CONNECTED'   ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                event.status === 'DISCONNECTED' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                                                  'bg-amber-100 text-amber-700 border-amber-200';
              return (
                <div
                  key={event._id || `${event.status}-${event.timestamp}`}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{event.status || 'UNKNOWN'}</p>
                    <p className="text-xs text-slate-500">
                      {event.deviceId || 'unknown'} · {formatTime(event.timestamp)}
                    </p>
                    {event.reason && <p className="text-xs text-slate-400">{event.reason}</p>}
                  </div>
                  <span className={`self-start rounded-full border px-3 py-1 text-xs font-semibold md:self-auto ${tone}`}>
                    {event.status || 'UNKNOWN'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
