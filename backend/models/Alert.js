const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    severity: { type: String, required: true, enum: ['HIGH', 'MEDIUM'] },
    message: { type: String, required: true },
    value: { type: Number, required: true },
    timestamp: { type: Date, required: true, index: true },
    healthDataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HealthData',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', AlertSchema);
