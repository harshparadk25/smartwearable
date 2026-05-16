const {
  addHealthData,
  addAlerts,
  getLatestHealthData,
  getLatestHealthDataByUserId
} = require('../storage/dataStore');
const { evaluateAlerts } = require('../services/alertEngine');

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

exports.createHealthData = async (req, res, next) => {
  try {
    const { userId, heartRate, spo2, temperature, timestamp, devicePin } = req.body || {};

    // heartRate and timestamp are required; spo2 and temperature are optional
    // (not all watch models expose standard GATT services for every metric)
    if (!userId || heartRate == null || !timestamp) {
      return res.status(400).json({ message: 'userId, heartRate and timestamp are required' });
    }

    const hr   = toNumber(heartRate);
    const s    = spo2        != null ? toNumber(spo2)        : null;
    const temp = temperature != null ? toNumber(temperature) : null;
    const ts   = toDate(timestamp);

    if (hr === null || !ts) {
      return res.status(400).json({ message: 'Invalid heartRate or timestamp' });
    }

    const health = await addHealthData({
      userId,
      heartRate: hr,
      spo2: s,
      temperature: temp,
      timestamp: ts.toISOString(),
      ...(devicePin ? { devicePin: String(devicePin) } : {})
    });

    console.log('[healthData]', {
      userId: health.userId,
      heartRate: health.heartRate,
      spo2: health.spo2,
      temperature: health.temperature,
      timestamp: health.timestamp
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('healthData', health);
    }

    const alertPayloads = evaluateAlerts(health);
    let insertedAlerts = [];

    if (alertPayloads.length) {
      insertedAlerts = await addAlerts(alertPayloads);
      if (io) {
        insertedAlerts.forEach((alert) => io.emit('alert', alert));
      }

      insertedAlerts.forEach((alert) => {
        console.log('[alert]', {
          userId: alert.userId,
          type: alert.type,
          severity: alert.severity,
          value: alert.value,
          timestamp: alert.timestamp
        });
      });
    }

    return res.status(201).json({ health, alerts: insertedAlerts });
  } catch (err) {
    return next(err);
  }
};

// GET /api/health/latest?userId=xxx
// If userId query param is provided, return that user's latest; otherwise global latest.
exports.getLatestHealthData = async (req, res, next) => {
  try {
    const userId = req.query.userId;
    const latest = userId
      ? await getLatestHealthDataByUserId(String(userId).trim())
      : await getLatestHealthData();
    return res.json(latest || null);
  } catch (err) {
    return next(err);
  }
};
