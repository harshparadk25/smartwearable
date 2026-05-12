const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_PATH = path.join(__dirname, 'data.json');
const dataFile = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : DEFAULT_PATH;

const emptyStore = { healthData: [], alerts: [], users: [], connections: [] };

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
      connections: Array.isArray(parsed.connections) ? parsed.connections : []
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

const addHealthData = async (payload) =>
  updateStore((data) => {
    const item = { ...payload, _id: randomUUID() };
    data.healthData.push(item);
    return item;
  });

const addAlerts = async (alerts) =>
  updateStore((data) => {
    const items = (alerts || []).map((alert) => ({ ...alert, _id: randomUUID() }));
    data.alerts.push(...items);
    return items;
  });

const getLatestHealthData = async () => {
  const data = await readStore();
  if (!data.healthData.length) {
    return null;
  }

  return data.healthData.reduce((latest, current) => {
    const latestTime = new Date(latest.timestamp).getTime();
    const currentTime = new Date(current.timestamp).getTime();
    return currentTime >= latestTime ? current : latest;
  });
};

const getAlerts = async (limit = 50) => {
  const data = await readStore();
  return data.alerts
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

const addConnectionEvent = async (payload) =>
  updateStore((data) => {
    const item = { ...payload, _id: randomUUID() };
    data.connections.push(item);
    return item;
  });

const getConnections = async (limit = 50) => {
  const data = await readStore();
  return data.connections
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

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
  const normalized = normalizeEmail(email);
  return data.users.find((user) => user.email === normalized) || null;
};

const getUserById = async (id) => {
  const data = await readStore();
  return data.users.find((user) => user._id === id) || null;
};

const updateUser = async (id, updates) =>
  updateStore((data) => {
    const index = data.users.findIndex((user) => user._id === id);
    if (index === -1) {
      return null;
    }
    data.users[index] = { ...data.users[index], ...updates };
    return data.users[index];
  });

module.exports = {
  initStore: ensureStore,
  addHealthData,
  addAlerts,
  getLatestHealthData,
  getAlerts,
  createUser,
  findUserByEmail,
  getUserById,
  updateUser,
  addConnectionEvent,
  getConnections
};
