const Client = require('../models/Client');
const Session = require('../models/Session');
const ConsentRecord = require('../models/ConsentRecord');
const Payment = require('../models/Payment');
const ClientPackage = require('../models/ClientPackage');

const SORTS = { name: 'name', lastSession: 'lastSession', nextSession: 'nextSession', status: 'status', createdAt: 'createdAt' };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanTags = (list) =>
  [...new Set((list || []).map((t) => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 15);

const serialize = (doc) => {
  const c = doc.toObject ? doc.toObject() : doc;
  return {
    id: c._id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    timezone: c.timezone,
    status: c.status,
    tags: c.tags,
    intakeCompleted: Boolean(c.intake && c.intake.completedAt),
    intake: c.intake && c.intake.completedAt ? c.intake : null,
    portalToken: c.portalToken,
    createdAt: c.createdAt,
  };
};

// Sortable, filterable client list. Last/next session are computed in MongoDB, not in the browser.
exports.listClients = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const sortField = SORTS[req.query.sort] || 'name';
    const direction = req.query.order === 'desc' ? -1 : 1;
    const now = new Date();

    const match = { therapist: req.therapist._id };
    if (['active', 'inactive', 'archived'].includes(req.query.status)) match.status = req.query.status;
    if (req.query.tag) match.tags = String(req.query.tag);
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 60)), 'i');
      match.$or = [{ name: rx }, { email: rx }];
    }

    const notCancelled = { $ne: ['$$s.status', 'cancelled'] };
    const pastSessions = { $filter: { input: '$sessions', as: 's', cond: { $and: [notCancelled, { $lt: ['$$s.startTime', now] }] } } };
    const futureSessions = { $filter: { input: '$sessions', as: 's', cond: { $and: [{ $eq: ['$$s.status', 'confirmed'] }, { $gte: ['$$s.startTime', now] }] } } };

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'sessions',
          let: { cid: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$client', '$$cid'] } } }, { $project: { startTime: 1, status: 1 } }],
          as: 'sessions',
        },
      },
      {
        $addFields: {
          sessionCount: { $size: { $filter: { input: '$sessions', as: 's', cond: notCancelled } } },
          lastSession: { $max: { $map: { input: pastSessions, as: 's', in: '$$s.startTime' } } },
          nextSession: { $min: { $map: { input: futureSessions, as: 's', in: '$$s.startTime' } } },
          intakeCompleted: { $ne: [{ $ifNull: ['$intake.completedAt', null] }, null] },
        },
      },
      // aggregate() ignores select:false, so secrets and heavy fields are removed explicitly.
      { $project: { sessions: 0, portalToken: 0, intake: 0, __v: 0 } },
      { $sort: { [sortField]: direction, _id: 1 } },
      { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ];

    const [result] = await Client.aggregate(pipeline).collation({ locale: 'en', strength: 2 });
    const allTags = await Client.distinct('tags', { therapist: req.therapist._id });

    res.json({
      clients: result.rows.map(({ _id, ...rest }) => ({ id: _id, ...rest })),
      total: result.total[0] ? result.total[0].n : 0,
      page,
      limit,
      allTags: allTags.sort(),
    });
  } catch (err) {
    next(err);
  }
};

exports.createClient = async (req, res, next) => {
  try {
    // Module 7 will gate this through the Entitlement Service (active-client cap).
    const { name, email, phone, tags } = req.body;
    try {
      const client = await Client.create({
        therapist: req.therapist._id,
        name,
        email,
        phone: phone || '',
        tags: cleanTags(tags),
      });
      res.status(201).json({ client: serialize(client) });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: 'You already have a client with this email' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

// Everything about one client in one response.
exports.getClient = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, therapist: req.therapist._id })
      .select('+portalToken')
      .lean();
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const [sessions, consents, payments, packages] = await Promise.all([
      Session.find({ client: client._id, therapist: req.therapist._id }).sort({ startTime: -1 }).limit(200).lean(),
      ConsentRecord.find({ client: client._id, therapist: req.therapist._id })
        .sort({ acceptedAt: -1 })
        .select('type version title acceptedAt ipAddress')
        .lean(),
      Payment.find({ client: client._id, therapist: req.therapist._id }).sort({ createdAt: -1 }).limit(50)
        .select('description amount platformFee status paidAt createdAt invoice.number').lean(),
      ClientPackage.find({ client: client._id, therapist: req.therapist._id, status: { $ne: 'pending_payment' } }).sort({ createdAt: -1 }).lean(),
    ]);

    const now = new Date();
    res.json({
      client: serialize(client),
      sessions,
      consents,
      payments: payments.map((p) => ({ ...p, invoiceNumber: p.invoice && p.invoice.number })),
      packages: packages.map((p) => ({ ...p, status: p.status === 'active' && p.expiresAt < now ? 'expired' : p.status })),
    });
  } catch (err) {
    next(err);
  }
};

exports.updateClient = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, therapist: req.therapist._id }).select('+portalToken');
    if (!client) return res.status(404).json({ message: 'Client not found' });

    // Email is the client's identity, so it is not editable here.
    if (req.body.name !== undefined) client.name = req.body.name;
    if (req.body.phone !== undefined) client.phone = req.body.phone;
    if (req.body.status !== undefined) client.status = req.body.status;
    if (req.body.tags !== undefined) client.tags = cleanTags(req.body.tags);

    await client.save();
    res.json({ client: serialize(client) });
  } catch (err) {
    next(err);
  }
};
