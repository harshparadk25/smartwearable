import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start justify-center px-6 py-10 md:items-center">
        <div className="soft-panel w-full max-w-md">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Operator sign in</p>
            <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-600">Access your real-time monitoring console.</p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs uppercase tracking-[0.25em] text-slate-500">Email</label>
              <input
                className="input mt-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operator@hospital.com"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.25em] text-slate-500">Password</label>
              <input
                className="input mt-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                required
              />
            </div>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600">
            New operator?{' '}
            <Link className="font-semibold text-slate-900" to="/register">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
