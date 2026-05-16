import { useCallback, useEffect, useRef, useState } from 'react';
import { io as socketIo } from 'socket.io-client';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import MemberCard from '../components/MemberCard';

const FamilyDashboard = () => {
  const { user } = useAuth();
  const [group,   setGroup]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [vitals,  setVitals]  = useState({});   // { [userId]: latestHealthData }
  const [alerts,  setAlerts]  = useState({});   // { [userId]: Alert[] }

  const socketRef    = useRef(null);
  const memberIdsRef = useRef(new Set());
  const loadingRef   = useRef(false);  // prevent concurrent fetches

  // ── Load family data ───────────────────────────────────────────────────
  const loadFamily = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError('');

    try {
      const data = await apiRequest('/api/family');

      if (!data) {
        setGroup(null);
        setLoading(false);
        return;
      }

      setGroup(data);

      const nextVitals = {};
      const nextAlerts = {};
      const ids = new Set();

      data.members.forEach((m) => {
        ids.add(m.userId);
        if (m.latestVitals) nextVitals[m.userId] = m.latestVitals;
        nextAlerts[m.userId] = [];
      });

      memberIdsRef.current = ids;
      setVitals((prev) => ({ ...prev, ...nextVitals }));   // keep live socket data
      setAlerts(nextAlerts);

      // Load recent alerts for every member in parallel
      await Promise.all(
        data.members.map(async (m) => {
          try {
            const analysis = await apiRequest(`/api/analysis/member/${m.userId}?limit=20`);
            setAlerts((prev) => ({ ...prev, [m.userId]: analysis.alerts?.slice(0, 3) || [] }));
          } catch { }
        })
      );
    } catch (err) {
      setError(err.message || 'Could not load family data');
      setGroup(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // ── Socket.io: live vitals + alerts ───────────────────────────────────
  useEffect(() => {
    const socket = socketIo({ path: '/socket.io', reconnection: true, reconnectionDelay: 2000 });
    socketRef.current = socket;

    socket.on('healthData', (data) => {
      setVitals((prev) => {
        if (!memberIdsRef.current.size || memberIdsRef.current.has(data.userId)) {
          return { ...prev, [data.userId]: data };
        }
        return prev;
      });
    });

    socket.on('alert', (alert) => {
      if (memberIdsRef.current.has(alert.userId)) {
        setAlerts((prev) => ({
          ...prev,
          [alert.userId]: [alert, ...(prev[alert.userId] || [])].slice(0, 3),
        }));
      }
    });

    return () => socket.disconnect();
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => { loadFamily(); }, [loadFamily]);

  // ── Refresh when tab becomes visible ──────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadFamily();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadFamily]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
    </div>
  );

  if (error) return (
    <div className="soft-panel space-y-3 text-center">
      <p className="font-semibold text-rose-600">Failed to load family data</p>
      <p className="text-sm text-slate-500">{error}</p>
      <button className="btn btn-outline" type="button" onClick={loadFamily}>Retry</button>
    </div>
  );

  if (!group) return (
    <div className="soft-panel space-y-3 text-center">
      <p className="font-semibold text-slate-900">No family group yet</p>
      <p className="text-sm text-slate-600">Set up a family group first to see everyone's vitals here.</p>
      <a className="btn btn-primary inline-flex" href="/family">Set up Family</a>
    </div>
  );

  // Merge socket live data on top of API data
  const membersWithLive = group.members.map((m) => ({
    ...m,
    latestVitals: vitals[m.userId] || m.latestVitals || null,
  }));

  const liveCount = membersWithLive.filter((m) => {
    const ts = m.latestVitals?.timestamp;
    return ts && Date.now() - new Date(ts).getTime() < 3 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Family Dashboard</p>
          <h1 className="text-2xl font-semibold text-slate-900">{group.name}</h1>
          <p className="text-sm text-slate-500">{group.members.length} members</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 shadow-sm">
            <span className={`h-2 w-2 rounded-full ${liveCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-sm text-slate-700">{liveCount} / {group.members.length} live</span>
          </div>
          <button
            className="btn btn-outline text-xs"
            type="button"
            onClick={loadFamily}
            disabled={loadingRef.current}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Member grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {membersWithLive.map((m) => (
          <MemberCard
            key={m.userId}
            member={m}
            recentAlerts={alerts[m.userId] || []}
            isCurrentUser={m.userId === user?._id}
          />
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        Vitals update in real-time · page refreshes automatically when you return to this tab
      </p>
    </div>
  );
};

export default FamilyDashboard;
