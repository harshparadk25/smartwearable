const statusConfig = {
  NORMAL: {
    label: 'NORMAL',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    description: 'System stable'
  },
  MEDIUM: {
    label: 'ALERT',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    description: 'Medium alert'
  },
  HIGH: {
    label: 'ALERT',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    description: 'High alert'
  }
};

const StatusIndicator = ({ status }) => {
  const config = statusConfig[status.severity] || statusConfig.NORMAL;

  return (
    <div className="soft-panel w-full max-w-xs space-y-3 md:w-72">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Status</span>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${config.badge}`}>
          {config.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${config.dot} shadow-lg`} />
        <div>
          <p className="text-sm font-semibold text-slate-900">{status.detail}</p>
          <p className="text-xs text-slate-500">{config.description}</p>
        </div>
      </div>
    </div>
  );
};

export default StatusIndicator;
