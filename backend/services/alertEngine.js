const evaluateAlerts = (healthData) => {
  const alerts = [];
  const { userId, heartRate, spo2, temperature, timestamp, _id } = healthData;

  // Guard every check — null/undefined values must not trigger alerts
  // (JavaScript coerces null to 0, so `null < 90` would be true without guards)
  if (Number.isFinite(heartRate) && heartRate > 120) {
    alerts.push({
      userId, type: 'HEART_RATE', severity: 'HIGH',
      message: 'High heart rate detected',
      value: heartRate, timestamp, healthDataId: _id
    });
  }

  if (Number.isFinite(spo2) && spo2 < 90) {
    alerts.push({
      userId, type: 'SPO2', severity: 'HIGH',
      message: 'Low SpO2 detected',
      value: spo2, timestamp, healthDataId: _id
    });
  }

  if (Number.isFinite(temperature) && temperature > 38) {
    alerts.push({
      userId, type: 'TEMPERATURE', severity: 'MEDIUM',
      message: 'Elevated temperature detected',
      value: temperature, timestamp, healthDataId: _id
    });
  }

  return alerts;
};

module.exports = { evaluateAlerts };
