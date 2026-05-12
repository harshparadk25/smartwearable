const { addConnectionEvent, getConnections } = require('../storage/dataStore');

const allowedStatuses = new Set(['CONNECTED', 'DISCONNECTED', 'ERROR']);

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

const toTimestamp = (value) => {
  if (!value) {
    return new Date();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

exports.createConnectionEvent = async (req, res, next) => {
  try {
    const { deviceId, status, timestamp, reason, userId } = req.body || {};
    const normalizedStatus = normalizeStatus(status);

    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const ts = toTimestamp(timestamp);
    if (!ts) {
      return res.status(400).json({ message: 'Invalid timestamp' });
    }

    const event = await addConnectionEvent({
      deviceId: deviceId ? String(deviceId).trim() : 'unknown',
      status: normalizedStatus,
      reason: reason ? String(reason).trim() : null,
      timestamp: ts.toISOString(),
      userId: userId ? String(userId).trim() : null
    });

    console.log('[connectionEvent]', {
      deviceId: event.deviceId,
      status: event.status,
      reason: event.reason,
      userId: event.userId,
      timestamp: event.timestamp
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('connectionEvent', event);
    }

    return res.status(201).json(event);
  } catch (err) {
    return next(err);
  }
};

exports.getConnections = async (req, res, next) => {
  try {
    const limitValue = Number(req.query.limit);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50;
    const events = await getConnections(limit);
    return res.json(events);
  } catch (err) {
    return next(err);
  }
};
