const toneMap = {
  HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700'
};

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleTimeString();
};

const AlertsList = ({ alerts, title = 'Alerts', subtitle = 'Latest First' }) => {
  return (
    <div className="soft-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">{subtitle}</span>
      </div>

      <div className="mt-5 space-y-3">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
            No alerts yet.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert._id || `${alert.type}-${alert.timestamp}`}
              className={`flex flex-col gap-2 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between ${toneMap[alert.severity]}`}
            >
              <div>
                <p className="text-sm font-semibold">
                  {alert.message} ({alert.type})
                </p>
                <p className="text-xs text-slate-500">
                  {alert.userId} | {formatTime(alert.timestamp)}
                </p>
              </div>
              <div className="text-sm font-semibold">
                {alert.value}
                {alert.type === 'TEMPERATURE' ? ' C' : alert.type === 'SPO2' ? ' %' : ' bpm'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsList;
