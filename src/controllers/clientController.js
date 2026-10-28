const Client = require('../models/Client');
const Session = require('../models/Session');
const Payment = require('../models/Payment');
const SessionNote = require('../models/SessionNote');

// Fields a therapist may set/update. "therapist" is NEVER taken from the request body.
const ALLOWED_FIELDS = [
  'name', 'email', 'phone', 'status', 'tags',
  'dateOfBirth', 'gender', 'intake', 'consent',
];
const SORTABLE = ['name', 'email', 'status', 'createdAt', 'updatedAt'];

const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj[k] !== undefined ? { ...acc, [k]: obj[k] } : acc), {});

// The frontend uses `id`, not Mongo's `_id`
const withId = (doc) => {
  const o = doc && doc.toObject ? doc.toObject() : doc;
  return o ? { ...o, id: String(o._id) } : o;
};

// GET /api/clients?search=&status=&tag=&sort=name&order=asc&page=1
// -> { clients, total, page, limit, allTags }
exports.getClients = async (req, res, next) => {
  try {
    const { status, search, tag } = req.query;
    const sortKey = SORTABLE.includes(req.query.sort) ? req.query.sort : 'name';
    const dir = req.query.order === 'desc' ? -1 : 1;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const filter = { therapist: req.user.id };
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [clients, total, allTags] = await Promise.all([
      Client.find(filter)
        .sort({ [sortKey]: dir })
        .skip((page - 1) * limit)
        .limit(limit),
      Client.countDocuments(filter),
      Client.distinct('tags', { therapist: req.user.id }),
    ]);

    res.json({
      clients: clients.map(withId),
      total,
      page,
      limit,
      allTags: (allTags || []).filter(Boolean).sort(),
    });
  } catch (err) { next(err); }
};

// Load a model only if the file exists, so a different file name never crashes the server
const tryModel = (...names) => {
  for (const n of names) {
    try { return require(`../models/${n}`); } catch (e) { /* try next name */ }
  }
  return null;
};
const ClientPackage = tryModel('ClientPackage');
const Consent = tryModel('Consent', 'ConsentRecord', 'ClientConsent');

// GET /api/clients/:id -> { client, sessions, consents, payments, packages }
// This is the exact shape ClientProfile.jsx reads.
exports.getClientById = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, therapist: req.user.id });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    // Ownership is already verified above, so related records are fetched by client id.
    const [sessions, payments, packages, consentDocs] = await Promise.all([
      Session.find({ client: client._id }).sort('-startTime'),
      Payment.find({ client: client._id }).sort('-createdAt'),
      ClientPackage ? ClientPackage.find({ client: client._id }).sort('-createdAt') : [],
      Consent ? Consent.find({ client: client._id }).sort('-acceptedAt') : [],
    ]);

    // Fall back to consents embedded on the client document, if that is how they are stored
    const consents = consentDocs.length
      ? consentDocs
      : (client.toObject().consents || []);

    res.json({
      client: withId(client),
      sessions: sessions.map(withId),
      consents: consents.map(withId),
      payments: payments.map(withId),
      packages: packages.map(withId),
    });
  } catch (err) { next(err); }
};

// POST /api/clients  (gated by requireFeature('active_clients') in the route)
// -> { client }   (the page navigates to /dashboard/clients/${client.id})
exports.createClient = async (req, res, next) => {
  try {
    const data = pick(req.body, ALLOWED_FIELDS);
    const client = await Client.create({ ...data, therapist: req.user.id });
    res.status(201).json({ client: withId(client) });
  } catch (err) { next(err); }
};

// PUT /api/clients/:id
exports.updateClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, therapist: req.user.id },
      pick(req.body, ALLOWED_FIELDS),
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ client: withId(client) });
  } catch (err) { next(err); }
};

// DELETE /api/clients/:id -> soft delete (keeps session/payment history)
exports.deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, therapist: req.user.id },
      { status: 'archived' },
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client archived', client: withId(client) });
  } catch (err) { next(err); }
};
