import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-lg backdrop-blur text-xs">
      <p className="text-slate-500">{formatTime(label)}</p>
      <p className="font-semibold text-slate-900">
        {payload[0]?.value?.toFixed(1)} {unit}
      </p>
    </div>
  );
};

const VitalsChart = ({ data = [], dataKey, label, unit, color = '#6366f1', domain }) => {
  if (!data.length) {
    return (
      <div className="card flex h-40 items-center justify-center text-sm text-slate-400">
        No data for {label}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
          <XAxis
            dataKey="t"
            tickFormatter={formatTime}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain || ['auto', 'auto']}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VitalsChart;
