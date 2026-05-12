const { getAlerts } = require('../storage/dataStore');

exports.getAlerts = async (req, res, next) => {
  try {
    const alerts = await getAlerts(50);
    return res.json(alerts);
  } catch (err) {
    return next(err);
  }
};
