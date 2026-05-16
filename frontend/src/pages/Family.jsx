import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className="btn btn-outline text-xs" type="button" onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

const Family = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(undefined); // undefined = loading
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Create-group form
  const [groupName, setGroupName] = useState('');

  // Join-group form
  const [inviteCode, setInviteCode] = useState('');

  // Link-member-by-PIN form
  const [linkPin, setLinkPin] = useState('');
  const [linkMsg, setLinkMsg] = useState('');

  const loadFamily = async () => {
    try {
      const data = await apiRequest('/api/family');
      setGroup(data);
    } catch {
      setGroup(null);
    }
  };

  useEffect(() => {
    loadFamily();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/family/create', {
        method: 'POST',
        body: { name: groupName || 'My Family' }
      });
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/family/join', {
        method: 'POST',
        body: { inviteCode: inviteCode.trim().toUpperCase() }
      });
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLinkPin = async (e) => {
    e.preventDefault();
    setLinkMsg('');
    setError('');
    setBusy(true);
    try {
      const result = await apiRequest('/api/family/link-member', {
        method: 'POST',
        body: { pin: linkPin.trim() }
      });
      setLinkMsg(`Linked: ${result.member?.name || 'member'}`);
      setLinkPin('');
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    const confirmed = window.confirm(
      group?.adminUserId === user?._id
        ? 'This will disband the group and remove all members. Continue?'
        : 'Leave this family group?'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await apiRequest('/api/family/leave', { method: 'DELETE' });
      setGroup(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from the group?`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/family/members/${memberId}`, { method: 'DELETE' });
      await loadFamily();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (group === undefined) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  // ── Already in a group ──────────────────────────────────────────────────
  if (group) {
    const isAdmin = group.adminUserId === user?._id;

    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Family</p>
          <h1 className="text-2xl font-semibold text-slate-900">{group.name}</h1>
        </div>

        {/* Invite code */}
        <div className="soft-panel space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Invite Code</p>
          <p className="text-sm text-slate-600">
            Share this code with family members so they can join using the <em>Join Family</em>{' '}
            option on their account.
          </p>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-50 px-4 py-2 font-mono text-xl font-bold tracking-[0.3em] text-indigo-700">
              {group.inviteCode}
            </span>
            <CopyButton text={group.inviteCode} />
          </div>
        </div>

        {/* Link by PIN — admin only */}
        {isAdmin && (
          <div className="soft-panel space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Link Member by Device PIN</p>
            <p className="text-sm text-slate-600">
              Enter the 6-digit device PIN shown on a family member's dashboard to add them directly.
            </p>
            <form className="flex gap-2" onSubmit={handleLinkPin}>
              <input
                className="input w-40 font-mono tracking-widest"
                placeholder="123456"
                maxLength={7}
                value={linkPin}
                onChange={(e) => setLinkPin(e.target.value)}
                required
              />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Link
              </button>
            </form>
            {linkMsg && <p className="text-sm text-emerald-600">{linkMsg}</p>}
          </div>
        )}

        {/* Members */}
        <div className="soft-panel space-y-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
            Members ({group.members.length})
          </p>
          <div className="divide-y divide-slate-100">
            {group.members.map((m) => {
              const isMe = m.userId === user?._id;
              const device = m.devices?.[0];
              return (
                <div key={m.userId} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{m.name}</span>
                      {isMe && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          You
                        </span>
                      )}
                      <span
                        className={`text-xs font-medium uppercase tracking-wide ${
                          m.role === 'admin' ? 'text-indigo-500' : 'text-slate-400'
                        }`}
                      >
                        {m.role}
                      </span>
                    </div>
                    {device && (
                      <span className="mt-0.5 block text-xs text-slate-400">
                        Device PIN:{' '}
                        <span className="font-mono font-semibold text-slate-600">
                          {device.pin}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-ghost text-xs"
                      type="button"
                      onClick={() => navigate(`/analysis/${m.userId}`)}
                    >
                      Analysis
                    </button>
                    {isAdmin && !isMe && (
                      <button
                        className="btn btn-ghost text-xs text-rose-500 hover:text-rose-700"
                        type="button"
                        onClick={() => handleRemoveMember(m.userId, m.name)}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          className="btn btn-outline text-rose-600 hover:border-rose-300 hover:text-rose-700"
          type="button"
          onClick={handleLeave}
          disabled={busy}
        >
          {group.adminUserId === user?._id ? 'Disband Group' : 'Leave Group'}
        </button>
      </div>
    );
  }

  // ── Not in any group ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Family</p>
        <h1 className="text-2xl font-semibold text-slate-900">Set up family monitoring</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a group and link family members' watches, or join an existing group with an invite code.
        </p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create */}
        <div className="soft-panel space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Create a family group</p>
            <p className="mt-1 text-sm text-slate-600">
              You become the admin and get an invite code to share.
            </p>
          </div>
          <form className="space-y-3" onSubmit={handleCreate}>
            <input
              className="input"
              placeholder="Family group name (e.g. The Smiths)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <button className="btn btn-primary w-full" type="submit" disabled={busy}>
              Create Group
            </button>
          </form>
        </div>

        {/* Join */}
        <div className="soft-panel space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Join a family group</p>
            <p className="mt-1 text-sm text-slate-600">
              Enter the 8-character invite code shared by the group admin.
            </p>
          </div>
          <form className="space-y-3" onSubmit={handleJoin}>
            <input
              className="input font-mono uppercase tracking-widest"
              placeholder="XXXXXXXX"
              maxLength={8}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              required
            />
            <button className="btn btn-primary w-full" type="submit" disabled={busy}>
              Join Group
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Family;
