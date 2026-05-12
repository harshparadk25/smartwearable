import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import PageTransition from './PageTransition';

const navLinkClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
  }`;

const AppShell = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">EHMS</p>
            <p className="text-lg font-semibold text-slate-900">Operations Console</p>
          </div>
          <nav className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/alerts" className={navLinkClass}>
              Alerts
            </NavLink>
          </nav>
          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
            <div className="text-left md:text-right">
              <p className="text-sm font-semibold text-slate-900">{user?.name || 'Operator'}</p>
              <p className="max-w-[200px] truncate text-xs text-slate-500">
                {user?.email || 'signed in'}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={handleLogout} type="button">
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default AppShell;
