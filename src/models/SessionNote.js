const mongoose = require('mongoose');
const { FORMAT_KEYS } = require('../config/noteTemplates');

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true }, // sanitized TipTap JSON
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    therapist: { type: mongoose.Schema.Types.ObjectId, ref: 'Therapist', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },

    // private = the therapist's own clinical record. shared = the therapist chose to show it to the client.
    // Defaults to private so a note is never visible to a client by accident.
    type: { type: String, enum: ['private', 'shared'], default: 'private', required: true },
    format: { type: String, enum: FORMAT_KEYS, default: 'freeform', required: true },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    sections: { type: [sectionSchema], default: [] },
    sharedAt: { type: Date },
  },
  { timestamps: true }
);

noteSchema.index({ therapist: 1, client: 1, createdAt: -1 });
noteSchema.index({ client: 1, type: 1, sharedAt: -1 });

// Keeps sharedAt honest: set when a note becomes shared, cleared when it goes back to private.
noteSchema.pre('save', function setSharedAt() {
  if (this.type === 'shared' && !this.sharedAt) this.sharedAt = new Date();
  if (this.type === 'private') this.sharedAt = undefined;
});

// THE ONLY way client-facing code reads notes. The 'shared' filter lives here, in the data layer,
// so no route can forget it. See services/noteSerializer.js for the second, independent guard.
noteSchema.statics.findSharedForClient = function findSharedForClient(clientId) {
  return this.find({ client: clientId, type: 'shared' }).sort({ sharedAt: -1 }).limit(200);
};

module.exports = mongoose.model('SessionNote', noteSchema);
