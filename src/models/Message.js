const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    // 'therapist' or 'client' — who sent it. No free-text role that could be spoofed.
    senderRole: { type: String, enum: ['therapist', 'client'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    readAt: { type: Date },
  },
  { timestamps: true }
);

// Chat is always "messages in this thread, newest first".
messageSchema.index({ therapist: 1, client: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);