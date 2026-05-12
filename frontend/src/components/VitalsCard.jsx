const formatValue = (value) => {
  if (value == null) {
    return '--';
  }
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(1) : '--';
};

const VitalsCard = ({ label, value, unit, accent }) => {
  return (
    <div className={`card animate-fade-in bg-gradient-to-br ${accent}`}>
      <div className="text-sm uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-semibold text-slate-900">{formatValue(value)}</span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
    </div>
  );
};

export default VitalsCard;
