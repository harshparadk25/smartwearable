const ds = require('../storage/dataStore');

// POST /api/devices/register  — called by BLE bridge on each watch connection
exports.registerDevice = async (req, res, next) => {
  try {
    const { macAddress, name, userId: bodyUserId } = req.body || {};

    // Accept userId from JWT (frontend calls) or from request body (BLE bridge with its own userId)
    const userId = (req.user && req.user._id) || (bodyUserId ? String(bodyUserId).trim() : null);
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const mac = (macAddress || '').trim().toLowerCase();

    // Return existing device record if this MAC+user combo is already registered
    if (mac) {
      const existing = await ds.findDeviceByMacAndUser(mac, userId);
      if (existing) {
        await ds.updateDevice(existing._id, {
          lastSeen: new Date().toISOString(),
          status: 'CONNECTED',
          name: name ? String(name).trim() : existing.name
        });
        return res.json({ pin: existing.pin, deviceId: existing._id });
      }
    }

    const device = await ds.createDevice({
      macAddress: mac,
      name: name ? String(name).trim() : 'Smart Watch',
      userId,
      status: 'CONNECTED'
    });

    return res.status(201).json({ pin: device.pin, deviceId: device._id });
  } catch (err) {
    return next(err);
  }
};

// GET /api/devices  — list current user's registered devices
exports.getDevices = async (req, res, next) => {
  try {
    const devices = await ds.getUserDevices(req.user._id);
    // Strip internal fields before returning
    const safe = devices.map(({ passwordHash: _, ...d }) => d);
    return res.json(safe);
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/devices/:pin/disconnect  — mark device offline (called by BLE bridge on disconnect)
exports.markDisconnected = async (req, res, next) => {
  try {
    const { pin } = req.params;
    const device = await ds.findDeviceByPin(pin);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const updated = await ds.updateDevice(device._id, {
      status: 'DISCONNECTED',
      lastSeen: new Date().toISOString()
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
};
