import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import AlertsList from '../components/AlertsList';
import Skeleton from '../components/Skeleton';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const alertList = await apiRequest('/api/alerts');
        if (!active) return;
        setAlerts(Array.isArray(alertList) ? alertList : []);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Alert center</p>
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Alerts feed</h1>
        </div>
        <div className="text-sm text-slate-600">
          {loading ? 'Loading alerts...' : `${alerts.length} alerts tracked`}
        </div>
      </header>

      <section className="mt-8">
        {loading ? (
          <div className="soft-panel space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : (
          <AlertsList alerts={alerts} title="All Alerts" subtitle="Latest First" />
        )}
      </section>
    </div>
  );
};

export default Alerts;
