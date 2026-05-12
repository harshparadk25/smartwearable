import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Live Telemetry',
    description: 'Stream heart rate, SpO2, and temperature in real-time.'
  },
  {
    title: 'Instant Alerts',
    description: 'Critical thresholds trigger immediate alerts to operators.'
  },
  {
    title: 'Operational Control',
    description: 'Single console for monitoring, triage, and escalation.'
  }
];

const Landing = () => {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">EHMS</p>
            <h1 className="text-2xl font-semibold text-slate-900">Emergency Health Monitoring</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link className="btn btn-ghost" to="/login">
              Sign in
            </Link>
            <Link className="btn btn-primary" to="/register">
              Get started
            </Link>
          </div>
        </header>

        <section className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Real-time operations</p>
            <h2 className="text-4xl font-semibold text-slate-900 md:text-5xl">
              Always-on monitoring for critical health events.
            </h2>
            <p className="text-sm text-slate-600">
              EHMS keeps frontline teams in sync with real-time biometrics, prioritized alerts, and
              clinical-grade visibility.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn btn-primary" to="/register">
                Create operator account
              </Link>
              <Link className="btn btn-outline" to="/dashboard">
                View live console
              </Link>
            </div>
          </div>
          <div className="soft-panel animate-fade-in">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Device status</p>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                DISCONNECTED
              </span>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-sm text-slate-600">
                Connect your smartwatch to start streaming real vitals.
              </div>
              <div className="card">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Step 1</p>
                <p className="mt-2 text-sm text-slate-700">Enable Bluetooth on your PC.</p>
              </div>
              <div className="card">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Step 2</p>
                <p className="mt-2 text-sm text-slate-700">Run the BLE bridge service.</p>
              </div>
              <div className="card">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Step 3</p>
                <p className="mt-2 text-sm text-slate-700">Keep the watch nearby and unpaired.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="card">
              <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
            </div>
          ))}
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>Operational readiness for distributed care teams.</p>
          <p>EHMS 2026</p>
        </footer>
      </div>
    </div>
  );
};

export default Landing;
