const Client = require('../models/Client');

// Finds the therapist's client by email, or creates one. Safe against two bookings racing:
// the unique (therapist, email) index rejects the duplicate and we read the winner.
async function findOrCreateClient(therapistId, { name, email, phone, timezone }) {
  const normalized = String(email).toLowerCase().trim();
  const lookup = () => Client.findOne({ therapist: therapistId, email: normalized }).select('+portalToken');

  let client = await lookup();
  if (client) {
    let changed = false;
    if (!client.phone && phone) { client.phone = phone; changed = true; }
    if (timezone && client.timezone !== timezone) { client.timezone = timezone; changed = true; }
    if (changed) await client.save();
    return { client, created: false };
  }

  try {
    client = await Client.create({
      therapist: therapistId,
      name,
      email: normalized,
      phone: phone || '',
      timezone: timezone || 'UTC',
    });
    return { client, created: true };
  } catch (err) {
    if (err.code === 11000) return { client: await lookup(), created: false };
    throw err;
  }
}

module.exports = { findOrCreateClient };
