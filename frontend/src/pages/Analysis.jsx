import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import VitalsChart from '../components/VitalsChart';

// ── Sub-components ────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, accent = 'text-slate-900' }) => (
  <div className="rounded-xl bg-white/70 p-3 text-center shadow-sm">
    <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value ?? '--'}</p>
    {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
  </div>
);

const TrendBadge = ({ trend }) => {
  if (trend == null) return null;
  const abs = Math.abs(trend);
  if (abs < 0.3) return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
      Stable
    </span>
  );
  const up = trend > 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-rose-500' : 'text-emerald-500'}`}>
      {up ? '▲' : '▼'} {abs.toFixed(1)}
    </span>
  );
};

const severityClass = {
  HIGH:   'text-rose-600 bg-rose-50 border-rose-100',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-100',
};

const EmptySection = ({ label }) => (
  <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/40">
    <p className="text-sm text-slate-400">No {label} data recorded yet</p>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────
const Analysis = () => {
  const { userId: paramUserId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const targetUserId = paramUserId || user?._id;
  const isOwn        = targetUserId === user?._id;

  const [data,       setData]       = useState(null);
  const [memberName, setMemberName] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!targetUserId) return;
    setLoading(true);
    setError('');
    setData(null);

    apiRequest(`/api/analysis/member/${targetUserId}?limit=200`)
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load analysis'))
      .finally(() => setLoading(false));

    if (!isOwn) {
      apiRequest('/api/family')
        .then((group) => {
          const m = group?.members?.find((m) => m.userId === targetUserId);
          if (m) setMemberName(m.name);
        })
        .catch(() => {});
    }
  }, [targetUserId]);

  const displayName = isOwn ? (user?.name || 'Your') : (memberName || 'Member');

  if (loading) return (
    <div className="space-y-4">
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="skeleton h-52 rounded-2xl" />
    </div>
  );

  if (error) return (
    <div className="soft-panel space-y-3">
      <p className="font-semibold text-slate-900">Unable to load analysis</p>
      <p className="text-sm text-rose-600">{error}</p>
      <button className="btn btn-outline" type="button" onClick={() => navigate(-1)}>← Back</button>
    </div>
  );

  const { stats, chartData = [], alerts = [], dataPoints = 0 } = data || {};
  const hasData = dataPoints > 0;
  const hrStats   = stats?.heartRate   ?? null;
  const spo2Stats = stats?.spo2        ?? null;
  const tempStats = stats?.temperature ?? null;

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Analysis</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isOwn ? 'Your Health' : `${displayName}'s Health`}
          </h1>
          <p className="text-sm text-slate-500">
            {hasData
              ? `${dataPoints} reading${dataPoints !== 1 ? 's' : ''}`
              : 'No readings yet — connect a watch to start recording'}
          </p>
        </div>
        {!isOwn && (
          <button className="btn btn-outline text-xs" type="button" onClick={() => navigate(-1)}>
            ← Back
          </button>
        )}
      </div>

      {!hasData && (
        <div className="soft-panel flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-4xl">⌚</p>
          <p className="font-semibold text-slate-800">No health data recorded yet</p>
          <p className="max-w-xs text-sm text-slate-500">
            Connect your smart watch from the Dashboard and wear it for a few minutes —
            readings will appear here automatically.
          </p>
          {isOwn && (
            <button className="btn btn-outline mt-2 text-xs" type="button" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          )}
        </div>
      )}

      {hasData && (
        <>
          {/* ── Heart Rate ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Heart Rate</h2>
              <TrendBadge trend={hrStats?.trend} />
            </div>
            {hrStats ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Avg"    value={hrStats.avg}    sub="bpm" />
                  <StatCard label="Min"    value={hrStats.min}    sub="bpm" accent="text-emerald-600" />
                  <StatCard label="Max"    value={hrStats.max}    sub="bpm" accent={hrStats.max > 100 ? 'text-rose-600' : 'text-slate-900'} />
                  <StatCard label="Latest" value={hrStats.latest} sub="bpm" />
                </div>
                <VitalsChart data={chartData} dataKey="hr"   label="Heart Rate (bpm)" unit="bpm" color="#6366f1" domain={[40, 160]} />
              </>
            ) : <EmptySection label="heart rate" />}
          </section>

          {/* ── SpO₂ ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Blood Oxygen (SpO₂)</h2>
              <TrendBadge trend={spo2Stats?.trend} />
            </div>
            {spo2Stats ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Avg"    value={spo2Stats.avg}    sub="%" />
                  <StatCard label="Min"    value={spo2Stats.min}    sub="%" accent={spo2Stats.min < 95 ? 'text-rose-600' : 'text-emerald-600'} />
                  <StatCard label="Max"    value={spo2Stats.max}    sub="%" />
                  <StatCard label="Latest" value={spo2Stats.latest} sub="%" />
                </div>
                <VitalsChart data={chartData} dataKey="spo2" label="SpO₂ (%)" unit="%" color="#10b981" domain={[93, 100]} />
              </>
            ) : <EmptySection label="SpO₂" />}
          </section>

          {/* ── Temperature ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Temperature</h2>
              <TrendBadge trend={tempStats?.trend} />
            </div>
            {tempStats ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Avg"    value={tempStats.avg}    sub="°C" />
                  <StatCard label="Min"    value={tempStats.min}    sub="°C" accent="text-emerald-600" />
                  <StatCard label="Max"    value={tempStats.max}    sub="°C" accent={tempStats.max > 37.5 ? 'text-rose-600' : 'text-slate-900'} />
                  <StatCard label="Latest" value={tempStats.latest} sub="°C" />
                </div>
                <VitalsChart data={chartData} dataKey="temp" label="Temperature (°C)" unit="°C" color="#f59e0b" domain={[35.5, 38.5]} />
              </>
            ) : <EmptySection label="temperature" />}
          </section>

          {/* ── Alerts ── */}
          {alerts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Recent Alerts ({alerts.length})
              </h2>
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a._id}
                    className={`flex items-start justify-between rounded-xl border px-4 py-3 ${
                      severityClass[a.severity] || 'text-slate-600 bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{a.message}</p>
                      <p className="text-xs opacity-60">{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {a.severity}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

    </div>
  );
};

export default Analysis;
