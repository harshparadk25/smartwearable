const ds = require('../storage/dataStore');

const computeStats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const last = values[values.length - 1];
  // Simple linear trend: positive = rising, negative = falling
  let trend = 0;
  if (values.length >= 4) {
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const secondHalf = values.slice(-half).reduce((s, v) => s + v, 0) / half;
    trend = +(secondHalf - firstHalf).toFixed(2);
  }
  return {
    avg: +avg.toFixed(1),
    min: +sorted[0].toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
    latest: +last.toFixed(1),
    trend
  };
};

const canViewMember = async (requesterId, targetUserId) => {
  if (requesterId === targetUserId) return true;
  const group = await ds.getFamilyGroupByUserId(requesterId);
  return group && group.members.some((m) => m.userId === targetUserId);
};

// GET /api/analysis/member/:userId
exports.getMemberAnalysis = async (req, res, next) => {
  try {
    const requesterId = req.user._id;
    const targetUserId = req.params.userId;

    if (!(await canViewMember(requesterId, targetUserId))) {
      return res.status(403).json({ message: 'Not authorized to view this member' });
    }

    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 10), 500) : 200;

    const [history, alerts] = await Promise.all([
      ds.getHealthDataByUserId(targetUserId, limit),
      ds.getAlertsByUserId(targetUserId, 50)
    ]);

    const hrVals = history.map((h) => h.heartRate).filter((v) => v != null);
    const spo2Vals = history.map((h) => h.spo2).filter((v) => v != null);
    const tempVals = history.map((h) => h.temperature).filter((v) => v != null);

    // Chart-ready data: timestamp + all three vitals per point
    const chartData = history.map((h) => ({
      t: h.timestamp,
      hr: h.heartRate != null ? +h.heartRate.toFixed(1) : null,
      spo2: h.spo2 != null ? +h.spo2.toFixed(1) : null,
      temp: h.temperature != null ? +h.temperature.toFixed(1) : null
    }));

    return res.json({
      userId: targetUserId,
      dataPoints: history.length,
      stats: {
        heartRate: computeStats(hrVals),
        spo2: computeStats(spo2Vals),
        temperature: computeStats(tempVals)
      },
      chartData,
      alerts
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/analysis/family
exports.getFamilyAnalysis = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const group = await ds.getFamilyGroupByUserId(userId);
    if (!group) {
      return res.status(404).json({ message: 'Not in a family group' });
    }

    const memberIds = group.members.map((m) => m.userId);
    const users = await ds.getUsersByIds(memberIds);

    const members = await Promise.all(
      memberIds.map(async (mid) => {
        const user = users.find((u) => u._id === mid);
        const history = await ds.getHealthDataByUserId(mid, 100);
        const alerts = await ds.getAlertsByUserId(mid, 5);

        const hrVals = history.map((h) => h.heartRate).filter((v) => v != null);
        const spo2Vals = history.map((h) => h.spo2).filter((v) => v != null);
        const tempVals = history.map((h) => h.temperature).filter((v) => v != null);

        return {
          userId: mid,
          name: user?.name || 'Unknown',
          role: group.members.find((m) => m.userId === mid)?.role || 'member',
          dataPoints: history.length,
          stats: {
            heartRate: computeStats(hrVals),
            spo2: computeStats(spo2Vals),
            temperature: computeStats(tempVals)
          },
          recentAlerts: alerts.slice(0, 3)
        };
      })
    );

    return res.json({
      groupName: group.name,
      memberCount: group.members.length,
      members
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/analysis/history/:userId  — paginated raw history
exports.getMemberHistory = async (req, res, next) => {
  try {
    const requesterId = req.user._id;
    const targetUserId = req.params.userId;

    if (!(await canViewMember(requesterId, targetUserId))) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
    const history = await ds.getHealthDataByUserId(targetUserId, limit);
    return res.json(history);
  } catch (err) {
    return next(err);
  }
};
