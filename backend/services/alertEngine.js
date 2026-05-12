const evaluateAlerts = (healthData) => {
  const alerts = [];

  if (healthData.heartRate > 120) {
    alerts.push({
      userId: healthData.userId,
      type: 'HEART_RATE',
      severity: 'HIGH',
      message: 'High heart rate detected',
      value: healthData.heartRate,
      timestamp: healthData.timestamp,
      healthDataId: healthData._id
    });
  }

  if (healthData.spo2 < 90) {
    alerts.push({
      userId: healthData.userId,
      type: 'SPO2',
      severity: 'HIGH',
      message: 'Low SpO2 detected',
      value: healthData.spo2,
      timestamp: healthData.timestamp,
      healthDataId: healthData._id
    });
  }

  if (healthData.temperature > 38) {
    alerts.push({
      userId: healthData.userId,
      type: 'TEMPERATURE',
      severity: 'MEDIUM',
      message: 'Elevated temperature detected',
      value: healthData.temperature,
      timestamp: healthData.timestamp,
      healthDataId: healthData._id
    });
  }

  return alerts;
};

module.exports = { evaluateAlerts };
