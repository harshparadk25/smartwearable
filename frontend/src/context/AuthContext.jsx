import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!token) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const me = await apiRequest('/api/auth/me', { token });
        if (active) {
          setUser(me);
        }
      } catch {
        if (active) {
          setUser(null);
          setStoredToken(null);
          setToken(null);
        }
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
  }, [token]);

  const login = async (email, password) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { name, email, password }
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
      isAuthenticated: Boolean(token)
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
