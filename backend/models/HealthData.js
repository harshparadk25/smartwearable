const mongoose = require('mongoose');

const HealthDataSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    heartRate: { type: Number, required: true },
    spo2: { type: Number, required: true },
    temperature: { type: Number, required: true },
    timestamp: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('HealthData', HealthDataSchema);
