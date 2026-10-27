const mongoose = require('mongoose');

// Atomic counters (used for gap-free invoice numbers per therapist per year).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });

module.exports = mongoose.model('Counter', counterSchema);
