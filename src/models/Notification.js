const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // A notification can target a therapist or a client (or be system-wide).
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },

    event: { type: String, required: true }, // e.g. 'booking.confirmed'
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 1000 },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }, // raw event data for debugging

    // Which channels were attempted and their result. Free text, not enum — new channels shouldn't need a migration.
    channels: {
      type: [
        {
          name: String, // 'email' | 'whatsapp' | 'inapp'
          status: String, // 'sent' | 'stubbed' | 'failed'
          at: Date,
          error: String,
        },
      ],
      default: [],
    },

    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ therapist: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);