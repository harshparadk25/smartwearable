const fs = require('fs/promises');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');

const DEFAULT_PATH = path.join(__dirname, 'data.json');
const dataFile = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : DEFAULT_PATH;

const emptyStore = {
  healthData: [],
  alerts: [],
  users: [],
  connections: [],
  devices: [],
  familyGroups: []
};

const ensureStore = async () => {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(emptyStore, null, 2));
  }
};

const readStore = async () => {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      healthData: Array.isArray(parsed.healthData) ? parsed.healthData : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      familyGroups: Array.isArray(parsed.familyGroups) ? parsed.familyGroups : []
    };
  } catch {
    return { ...emptyStore };
  }
};

const writeStore = async (data) => {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
};

let writeQueue = Promise.resolve();

const updateStore = async (updater) => {
  writeQueue = writeQueue.then(async () => {
    const data = await readStore();
    const result = await updater(data);
    await writeStore(data);
    return result;
  });
  return writeQueue;
};

// ── Health Data ────────────────────────────────────────────────────────────

const HEALTH_DATA_LIMIT = 2000;
const ALERTS_LIMIT = 500;
const CONNECTIONS_LIMIT = 300;

const addHealthData = async (payload) =>
  updateStore((data) => {
    const item = { ...payload, _id: randomUUID() };
    data.healthData.push(item);
    if (data.healthData.length > HEALTH_DATA_LIMIT) {
      data.healthData = data.healthData.slice(-HEALTH_DATA_LIMIT);
    }
    return item;
  });

const addAlerts = async (alerts) =>
  updateStore((data) => {
    const items = (alerts || []).map((alert) => ({ ...alert, _id: randomUUID() }));
    data.alerts.push(...items);
    if (data.alerts.length > ALERTS_LIMIT) {
      data.alerts = data.alerts.slice(-ALERTS_LIMIT);
    }
    return items;
  });

const getLatestHealthData = async () => {
  const data = await readStore();
  if (!data.healthData.length) return null;
  return data.healthData.reduce((latest, current) =>
    new Date(current.timestamp) >= new Date(latest.timestamp) ? current : latest
  );
};

const getLatestHealthDataByUserId = async (userId) => {
  const data = await readStore();
  const records = data.healthData.filter((h) => h.userId === userId);
  if (!records.length) return null;
  return records.reduce((latest, current) =>
    new Date(current.timestamp) >= new Date(latest.timestamp) ? current : latest
  );
};

// Returns sorted ascending (oldest first) for charting; use .slice(-N) for last N points
const getHealthDataByUserId = async (userId, limit = 100) => {
  const data = await readStore();
  return data.healthData
    .filter((h) => h.userId === userId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-limit);
};

const getAlerts = async (limit = 50) => {
  const data = await readStore();
  return data.alerts
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

const getAlertsByUserId = async (userId, limit = 50) => {
  const data = await readStore();
  return data.alerts
    .filter((a) => a.userId === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

// ── Connections ────────────────────────────────────────────────────────────

const addConnectionEvent = async (payload) =>
  updateStore((data) => {
    const item = { ...payload, _id: randomUUID() };
    data.connections.push(item);
    if (data.connections.length > CONNECTIONS_LIMIT) {
      data.connections = data.connections.slice(-CONNECTIONS_LIMIT);
    }
    return item;
  });

const getConnections = async (limit = 50) => {
  const data = await readStore();
  return data.connections
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

// ── Users ──────────────────────────────────────────────────────────────────

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const createUser = async (payload) =>
  updateStore((data) => {
    const item = {
      _id: randomUUID(),
      name: payload.name,
      email: normalizeEmail(payload.email),
      passwordHash: payload.passwordHash,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };
    data.users.push(item);
    return item;
  });

const findUserByEmail = async (email) => {
  const data = await readStore();
  return data.users.find((u) => u.email === normalizeEmail(email)) || null;
};

const getUserById = async (id) => {
  const data = await readStore();
  return data.users.find((u) => u._id === id) || null;
};

const getUsersByIds = async (ids) => {
  const data = await readStore();
  const set = new Set(ids);
  return data.users.filter((u) => set.has(u._id));
};

const updateUser = async (id, updates) =>
  updateStore((data) => {
    const i = data.users.findIndex((u) => u._id === id);
    if (i === -1) return null;
    data.users[i] = { ...data.users[i], ...updates };
    return data.users[i];
  });

// ── Devices ────────────────────────────────────────────────────────────────

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateInviteCode = () => {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => INVITE_CHARS[b % INVITE_CHARS.length]).join('');
};

const generateDevicePin = (existingPins) => {
  for (let i = 0; i < 200; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!existingPins.has(pin)) return pin;
  }
  // Extremely unlikely fallback — expand to 7 digits
  return String(Math.floor(1000000 + Math.random() * 9000000));
};

const createDevice = async (payload) =>
  updateStore((data) => {
    const existingPins = new Set(data.devices.map((d) => d.pin));
    const pin = generateDevicePin(existingPins);
    const item = {
      _id: randomUUID(),
      pin,
      userId: payload.userId,
      macAddress: (payload.macAddress || '').toLowerCase(),
      name: payload.name || 'Smart Watch',
      status: payload.status || 'CONNECTED',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    data.devices.push(item);
    return item;
  });

const findDeviceByPin = async (pin) => {
  const data = await readStore();
  return data.devices.find((d) => d.pin === pin) || null;
};

const findDeviceByMacAndUser = async (macAddress, userId) => {
  const data = await readStore();
  const mac = (macAddress || '').toLowerCase();
  if (!mac) return null;
  return data.devices.find((d) => d.macAddress === mac && d.userId === userId) || null;
};

const getUserDevices = async (userId) => {
  const data = await readStore();
  return data.devices.filter((d) => d.userId === userId);
};

const getDevicesByUserIds = async (userIds) => {
  const data = await readStore();
  const set = new Set(userIds);
  return data.devices.filter((d) => set.has(d.userId));
};

const updateDevice = async (id, updates) =>
  updateStore((data) => {
    const i = data.devices.findIndex((d) => d._id === id);
    if (i === -1) return null;
    data.devices[i] = { ...data.devices[i], ...updates };
    return data.devices[i];
  });

// ── Family Groups ──────────────────────────────────────────────────────────

const createFamilyGroup = async (payload) =>
  updateStore((data) => {
    const item = {
      _id: randomUUID(),
      name: payload.name || 'My Family',
      adminUserId: payload.adminUserId,
      inviteCode: generateInviteCode(),
      members: [
        { userId: payload.adminUserId, role: 'admin', joinedAt: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString()
    };
    data.familyGroups.push(item);
    return item;
  });

const getFamilyGroupById = async (id) => {
  const data = await readStore();
  return data.familyGroups.find((g) => g._id === id) || null;
};

const getFamilyGroupByInviteCode = async (code) => {
  const data = await readStore();
  return data.familyGroups.find((g) => g.inviteCode === code) || null;
};

const getFamilyGroupByUserId = async (userId) => {
  const data = await readStore();
  return data.familyGroups.find((g) => g.members.some((m) => m.userId === userId)) || null;
};

const addFamilyMember = async (groupId, userId, role = 'member') =>
  updateStore((data) => {
    const i = data.familyGroups.findIndex((g) => g._id === groupId);
    if (i === -1) return null;
    data.familyGroups[i].members.push({ userId, role, joinedAt: new Date().toISOString() });
    return data.familyGroups[i];
  });

const removeFamilyMember = async (groupId, userId) =>
  updateStore((data) => {
    const i = data.familyGroups.findIndex((g) => g._id === groupId);
    if (i === -1) return null;
    data.familyGroups[i].members = data.familyGroups[i].members.filter(
      (m) => m.userId !== userId
    );
    return data.familyGroups[i];
  });

const deleteFamilyGroup = async (id) =>
  updateStore((data) => {
    data.familyGroups = data.familyGroups.filter((g) => g._id !== id);
    return null;
  });

module.exports = {
  initStore: ensureStore,
  // health
  addHealthData,
  addAlerts,
  getLatestHealthData,
  getLatestHealthDataByUserId,
  getHealthDataByUserId,
  getAlerts,
  getAlertsByUserId,
  // connections
  addConnectionEvent,
  getConnections,
  // users
  createUser,
  findUserByEmail,
  getUserById,
  getUsersByIds,
  updateUser,
  // devices
  createDevice,
  findDeviceByPin,
  findDeviceByMacAndUser,
  getUserDevices,
  getDevicesByUserIds,
  updateDevice,
  // family
  createFamilyGroup,
  getFamilyGroupById,
  getFamilyGroupByInviteCode,
  getFamilyGroupByUserId,
  addFamilyMember,
  removeFamilyMember,
  deleteFamilyGroup
};
