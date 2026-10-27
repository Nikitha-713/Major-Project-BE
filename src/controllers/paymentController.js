const Payment = require('../models/Payment');
const Package = require('../models/Package');
const ClientPackage = require('../models/ClientPackage');
const Client = require('../models/Client');
const Therapist = require('../models/Therapist');
const gateway = require('../services/paymentGateway');
const { createPackagePayment, markPaid, handleWebhookEvent } = require('../services/paymentService');
const { streamInvoicePdf } = require('../services/invoiceService');
const cfg = require('../config/billing');

const TOKEN_RE = /^[a-f0-9]{64}$/;

/* ---------- Therapist: billing settings ---------- */

const billingPayload = (therapist) => ({
  billing: therapist.toBillingJSON(),
  paymentsConfigured: gateway.isConfigured(),
  platformFeePercent: cfg.PLATFORM_FEE_PERCENT,
  gstRateMax: cfg.GST_RATE_MAX,
});

exports.getBilling = (req, res) => res.json(billingPayload(req.therapist));

exports.updateBilling = async (req, res, next) => {
  try {
    const t = req.therapist;
    const b = req.body;
    if (b.collectAdvancePayment !== undefined) t.billing.collectAdvancePayment = Boolean(b.collectAdvancePayment);
    if (b.businessName !== undefined) t.billing.businessName = b.businessName;
    if (b.address !== undefined) t.billing.address = b.address;
    if (b.gstin !== undefined) t.billing.gstin = b.gstin;
    if (b.gstRatePercent !== undefined) t.billing.gstRatePercent = Number(b.gstRatePercent);
    await t.save();
    res.json(billingPayload(t));
  } catch (err) {
    next(err);
  }
};

/* ---------- Therapist: packages for sale ---------- */

exports.listPackages = async (req, res, next) => {
  try {
    const packages = await Package.find({ therapist: req.therapist._id }).sort({ sessions: 1, createdAt: -1 }).lean();
    res.json({
      packages,
      options: { sessions: cfg.PACKAGE_SESSION_OPTIONS, durations: cfg.PACKAGE_DURATION_OPTIONS, validityDays: cfg.PACKAGE_VALIDITY_DAYS },
    });
  } catch (err) {
    next(err);
  }
};

exports.createPackage = async (req, res, next) => {
  try {
    const { name, sessions, price, durationMin, validityDays } = req.body;
    const pkg = await Package.create({ therapist: req.therapist._id, name, sessions, price, durationMin, validityDays });
    res.status(201).json({ package: pkg });
  } catch (err) {
    next(err);
  }
};

// Packages are never deleted (clients may already own one); they are switched off instead.
exports.updatePackage = async (req, res, next) => {
  try {
    const pkg = await Package.findOne({ _id: req.params.id, therapist: req.therapist._id });
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (req.body.active !== undefined) pkg.active = Boolean(req.body.active);
    if (req.body.name !== undefined) pkg.name = req.body.name;
    await pkg.save();
    res.json({ package: pkg });
  } catch (err) {
    next(err);
  }
};

/* ---------- Therapist: payment history ---------- */

exports.listPayments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const filter = { therapist: req.therapist._id };
    if (['created', 'paid', 'refunded', 'failed'].includes(req.query.status)) filter.status = req.query.status;

    const [payments, total, grouped] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('client', 'name email').lean(),
      Payment.countDocuments(filter),
      Payment.aggregate([
        { $match: { therapist: req.therapist._id } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' }, fee: { $sum: '$platformFee' }, net: { $sum: '$netAmount' } } },
      ]),
    ]);

    const by = Object.fromEntries(grouped.map((g) => [g._id, g]));
    const paid = by.paid || { count: 0, amount: 0, fee: 0, net: 0 };
    res.json({
      payments: payments.map((p) => ({
        id: p._id,
        client: p.client ? { id: p.client._id, name: p.client.name } : null,
        kind: p.kind,
        description: p.description,
        amount: p.amount,
        platformFee: p.platformFee,
        netAmount: p.netAmount,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        invoiceNumber: p.invoice && p.invoice.number,
        failureReason: p.failureReason,
      })),
      total,
      page,
      limit,
      summary: {
        paidCount: paid.count,
        collected: paid.amount,
        platformFees: paid.fee,
        netPayout: paid.net,
        awaitingCount: (by.created || { count: 0 }).count,
        refundedCount: (by.refunded || { count: 0 }).count,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.downloadInvoice = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      therapist: req.therapist._id,
      status: 'paid',
      'invoice.number': { $exists: true },
    });
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });
    streamInvoicePdf(payment, res);
  } catch (err) {
    next(err);
  }
};

/* ---------- Public: confirming a payment ---------- */

// Called by the browser right after Razorpay Checkout succeeds. The signature proves it is
// genuine, so no login is needed. The webhook below does the same job independently.
exports.verifyPayment = async (req, res, next) => {
  try {
    const orderId = req.body.razorpay_order_id;
    const paymentId = req.body.razorpay_payment_id;
    const signature = req.body.razorpay_signature;

    if (!gateway.verifyCheckoutSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ message: 'We could not verify this payment. If money was taken, it will be refunded automatically.' });
    }

    const { payment } = await markPaid({ orderId, gatewayPaymentId: paymentId });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const fresh = await Payment.findById(payment._id);
    if (fresh.status === 'refunded') {
      return res.status(409).json({ message: 'That time was taken before your payment arrived, so you have been refunded. Please book another time.' });
    }
    res.json({ status: fresh.status, kind: fresh.kind });
  } catch (err) {
    next(err);
  }
};

// Razorpay -> our server. Needs the RAW request body to check the signature, so app.js mounts
// this route before the JSON parser. Any non-2xx reply makes Razorpay retry later.
exports.webhook = async (req, res) => {
  const raw = req.body;
  if (!Buffer.isBuffer(raw) || !gateway.verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) {
    return res.status(400).json({ message: 'Invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ message: 'Invalid payload' });
  }
  try {
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing failed:', err);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

/* ---------- Public: client portal actions (authorised by the portal token) ---------- */

const clientFromToken = (token) => (TOKEN_RE.test(token) ? Client.findOne({ portalToken: token }) : null);

exports.createPackageOrder = async (req, res, next) => {
  try {
    const client = await clientFromToken(req.params.token);
    if (!client) return res.status(404).json({ message: 'This link is not valid' });

    const pkg = await Package.findOne({ _id: req.body.packageId, therapist: client.therapist, active: true });
    if (!pkg) return res.status(404).json({ message: 'That package is not available' });

    const therapist = await Therapist.findById(client.therapist);
    const { payment, order } = await createPackagePayment({ therapist, client, pkg });
    res.status(201).json({
      payment: {
        id: payment._id,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: gateway.publicKeyId(),
        description: payment.description,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.downloadPortalInvoice = async (req, res, next) => {
  try {
    const client = await clientFromToken(req.params.token);
    if (!client) return res.status(404).json({ message: 'This link is not valid' });
    const payment = await Payment.findOne({ _id: req.params.id, client: client._id, status: 'paid', 'invoice.number': { $exists: true } });
    if (!payment) return res.status(404).json({ message: 'Invoice not found' });
    streamInvoicePdf(payment, res);
  } catch (err) {
    next(err);
  }
};

// Used by the portal page to display the client's packages.
exports.clientPackagesView = (list) => {
  const now = new Date();
  return list.map((p) => ({
    id: p._id,
    name: p.name,
    sessionsTotal: p.sessionsTotal,
    sessionsRemaining: p.sessionsRemaining,
    durationMin: p.durationMin,
    perSessionRate: p.perSessionRate,
    expiresAt: p.expiresAt,
    status: p.status === 'active' && p.expiresAt && p.expiresAt < now ? 'expired' : p.status,
  }));
};
