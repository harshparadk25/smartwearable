import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import AppShell from './components/AppShell';
import PageTransition from './components/PageTransition';
import ProtectedRoute from './components/ProtectedRoute';
import Alerts from './pages/Alerts';
import Analysis from './pages/Analysis';
import Dashboard from './pages/Dashboard';
import Family from './pages/Family';
import FamilyDashboard from './pages/FamilyDashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

const App = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageTransition>
              <Landing />
            </PageTransition>
          }
        />
        <Route
          path="/login"
          element={
            <PageTransition>
              <Login />
            </PageTransition>
          }
        />
        <Route
          path="/register"
          element={
            <PageTransition>
              <Register />
            </PageTransition>
          }
        />
        <Route element={<AppShell />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <Alerts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/family"
            element={
              <ProtectedRoute>
                <Family />
              </ProtectedRoute>
            }
          />
          <Route
            path="/family-dashboard"
            element={
              <ProtectedRoute>
                <FamilyDashboard />
              </ProtectedRoute>
            }
          />
          {/* /analysis shows your own; /analysis/:userId shows a member */}
          <Route
            path="/analysis/:userId?"
            element={
              <ProtectedRoute>
                <Analysis />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

export default App;
