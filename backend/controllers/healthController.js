const { addHealthData, addAlerts, getLatestHealthData } = require('../storage/dataStore');
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
    const { userId, heartRate, spo2, temperature, timestamp } = req.body || {};

    if (!userId || heartRate == null || spo2 == null || temperature == null || !timestamp) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const hr = toNumber(heartRate);
    const s = toNumber(spo2);
    const temp = toNumber(temperature);
    const ts = toDate(timestamp);

    if (hr === null || s === null || temp === null || !ts) {
      return res.status(400).json({ message: 'Invalid field types' });
    }

    const health = await addHealthData({
      userId,
      heartRate: hr,
      spo2: s,
      temperature: temp,
      timestamp: ts.toISOString()
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

exports.getLatestHealthData = async (req, res, next) => {
  try {
    const latest = await getLatestHealthData();
    return res.json(latest || null);
  } catch (err) {
    return next(err);
  }
};
