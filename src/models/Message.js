const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
  client:    { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  senderRole:{ type: String, enum: ['therapist', 'client'], required: true },
  text:      { type: String, required: true, trim: true, maxlength: 2000 },
  readAt:    { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ therapist: 1, client: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
