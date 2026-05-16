import { useNavigate } from 'react-router-dom';

const fmt = (v) => (v == null ? '--' : Number(v).toFixed(1));

const LIVE_THRESHOLD_MS  = 3 * 60 * 1000;   // 3 min  → Live
const STALE_THRESHOLD_MS = 30 * 60 * 1000;  // 30 min → show "last seen X ago"

const getStatus = (timestamp) => {
  if (!timestamp) return 'no-data';
  const age = Date.now() - new Date(timestamp).getTime();
  if (age < LIVE_THRESHOLD_MS)  return 'live';
  if (age < STALE_THRESHOLD_MS) return 'recent';
  return 'offline';
};

const relativeTime = (timestamp) => {
  if (!timestamp) return null;
  const secs = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};

const alertSeverityColor = (alerts = []) => {
  if (alerts.some((a) => a.severity === 'HIGH')) return 'text-rose-600';
  if (alerts.some((a) => a.severity === 'MEDIUM')) return 'text-amber-600';
  return null;
};

const statusConfig = {
  'live':    { dot: 'bg-emerald-400', label: 'Live',    text: 'text-emerald-600' },
  'recent':  { dot: 'bg-amber-400',   label: 'Recent',  text: 'text-amber-600'   },
  'offline': { dot: 'bg-slate-300',   label: 'Offline', text: 'text-slate-400'   },
  'no-data': { dot: 'bg-slate-200',   label: 'No data', text: 'text-slate-400'   },
};

const MemberCard = ({ member, recentAlerts = [], isCurrentUser = false }) => {
  const navigate = useNavigate();
  const { userId, name, role, latestVitals, devices = [] } = member;

  const status      = getStatus(latestVitals?.timestamp);
  const statusCfg   = statusConfig[status];
  const alertColor  = alertSeverityColor(recentAlerts);
  const pin         = devices[0]?.pin;
  const hasVitals   = latestVitals != null;
  const lastSeen    = relativeTime(latestVitals?.timestamp);

  return (
    <div className={`card flex flex-col gap-4 ${alertColor ? 'ring-2 ring-rose-200' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{name}</span>
            {isCurrentUser && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">You</span>
            )}
          </div>
          <span className={`mt-0.5 inline-block text-xs font-medium uppercase tracking-wide ${
            role === 'admin' ? 'text-indigo-500' : 'text-slate-400'
          }`}>
            {role}
          </span>
        </div>

        {/* Status */}
        <div className="flex flex-col items-end gap-0.5 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${statusCfg.dot} ${status === 'live' ? 'animate-pulse' : ''}`} />
            <span className={`text-xs font-medium ${statusCfg.text}`}>{statusCfg.label}</span>
          </div>
          {lastSeen && status !== 'live' && (
            <span className="text-[10px] text-slate-400">{lastSeen}</span>
          )}
        </div>
      </div>

      {/* Vitals grid */}
      {hasVitals ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Heart Rate', value: latestVitals?.heartRate, unit: 'bpm' },
            { label: 'SpO₂',       value: latestVitals?.spo2,       unit: '%'   },
            { label: 'Temp',       value: latestVitals?.temperature, unit: '°C' }
          ].map(({ label, value, unit }) => (
            <div key={label} className={`rounded-xl p-2 text-center ${
              status === 'live' ? 'bg-slate-50/80' : 'bg-slate-50/50'
            }`}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className={`mt-0.5 text-lg font-semibold ${status === 'live' ? 'text-slate-900' : 'text-slate-400'}`}>
                {fmt(value)}
              </p>
              <p className="text-[10px] text-slate-400">{unit}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-4 text-center">
          <p className="text-xs font-medium text-slate-500">No readings yet</p>
          <p className="text-[10px] text-slate-400 leading-relaxed px-2">
            {isCurrentUser
              ? 'Connect your watch from the Dashboard'
              : 'This member needs to open the app and connect their watch'}
          </p>
        </div>
      )}

      {/* PIN badge */}
      {pin && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Device PIN</span>
          <span className="rounded-lg bg-indigo-50 px-2 py-0.5 font-mono text-sm font-semibold text-indigo-700 tracking-widest">
            {pin}
          </span>
        </div>
      )}

      {/* Alert badge */}
      {recentAlerts.length > 0 && (
        <div className={`text-xs font-medium ${alertColor}`}>
          ⚠ {recentAlerts[0].message}
        </div>
      )}

      {/* Action */}
      <button
        className="btn btn-outline w-full text-xs"
        type="button"
        onClick={() => navigate(`/analysis/${userId}`)}
      >
        View Analysis
      </button>
    </div>
  );
};

export default MemberCard;
