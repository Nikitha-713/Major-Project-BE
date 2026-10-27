const Payment = require('../models/Payment');
const ClientPackage = require('../models/ClientPackage');
const Session = require('../models/Session');
const Therapist = require('../models/Therapist');
const Client = require('../models/Client');
const Counter = require('../models/Counter');
const gateway = require('./paymentGateway');
const { notify } = require('./notificationService');
const { computeFee, splitTax } = require('../utils/billingMath');
const { INVOICE_PREFIX } = require('../config/billing');

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- Creating payments (money not yet received) ---------- */

async function createSessionPayment({ therapist, client, session, amountMinor }) {
  const fee = computeFee(amountMinor);
  const payment = new Payment({
    therapist: therapist._id,
    client: client._id,
    kind: 'session',
    session: session._id,
    description: `${session.serviceTitle} (${session.durationMin} min)`,
    amount: amountMinor,
    platformFee: fee,
    netAmount: amountMinor - fee,
  });
  const order = await gateway.createOrder({
    amount: amountMinor,
    receipt: String(payment._id),
    notes: { paymentId: String(payment._id), kind: 'session', sessionId: String(session._id) },
  });
  payment.gatewayOrderId = order.id;
  await payment.save();
  return { payment, order };
}

async function createPackagePayment({ therapist, client, pkg }) {
  const clientPackage = await ClientPackage.create({
    client: client._id,
    therapist: therapist._id,
    package: pkg._id,
    name: pkg.name,
    sessionsTotal: pkg.sessions,
    sessionsRemaining: pkg.sessions,
    durationMin: pkg.durationMin,
    validityDays: pkg.validityDays,
    pricePaid: pkg.price,
    perSessionRate: Math.round(pkg.price / pkg.sessions),
    status: 'pending_payment',
  });

  try {
    const fee = computeFee(pkg.price);
    const payment = new Payment({
      therapist: therapist._id,
      client: client._id,
      kind: 'package',
      clientPackage: clientPackage._id,
      description: `${pkg.name} (${pkg.sessions} sessions of ${pkg.durationMin} min)`,
      amount: pkg.price,
      platformFee: fee,
      netAmount: pkg.price - fee,
    });
    const order = await gateway.createOrder({
      amount: pkg.price,
      receipt: String(payment._id),
      notes: { paymentId: String(payment._id), kind: 'package', clientPackageId: String(clientPackage._id) },
    });
    payment.gatewayOrderId = order.id;
    await payment.save();
    await ClientPackage.updateOne({ _id: clientPackage._id }, { payment: payment._id });
    return { payment, order };
  } catch (err) {
    await ClientPackage.deleteOne({ _id: clientPackage._id });
    throw err;
  }
}

/* ---------- Confirming payments (called by BOTH the browser callback and the webhook) ---------- */

// Safe to call any number of times, from any number of places. Only the first call that finds
// the payment in 'created' state does the work; the rest are no-ops.
async function markPaid({ orderId, gatewayPaymentId, method }) {
  const payment = await Payment.findOneAndUpdate(
    { gatewayOrderId: orderId, status: 'created' },
    { status: 'paid', gatewayPaymentId, method, paidAt: new Date() },
    { new: true }
  );

  if (payment) {
    await finalize(payment);
    return { payment, alreadyProcessed: false };
  }

  const existing = await Payment.findOne({ gatewayOrderId: orderId });
  // Self-heal: if the first attempt died half-way (server restart), a later webhook retry finishes it.
  if (existing && existing.status === 'paid' && !(existing.invoice && existing.invoice.number)) {
    if (Date.now() - new Date(existing.paidAt).getTime() > 2 * 60 * 1000) await finalize(existing);
  }
  return { payment: existing, alreadyProcessed: Boolean(existing) };
}

async function finalize(payment) {
  await assignInvoice(payment);
  if (payment.kind === 'session') await confirmSession(payment);
  if (payment.kind === 'package') await activatePackage(payment);
}

async function nextInvoiceNumber(therapistId, date) {
  const year = new Date(date).getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice:${therapistId}:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `${INVOICE_PREFIX}-${year}-${String(counter.seq).padStart(4, '0')}`;
}

async function assignInvoice(payment) {
  const fresh = await Payment.findById(payment._id).select('invoice');
  if (fresh && fresh.invoice && fresh.invoice.number) return;

  const [therapist, client] = await Promise.all([Therapist.findById(payment.therapist), Client.findById(payment.client)]);
  const b = therapist.billing || {};
  // GST only appears on invoices of therapists who entered a GSTIN.
  const rate = b.gstin ? b.gstRatePercent || 0 : 0;
  const { taxable, cgst, sgst } = splitTax(payment.amount, rate);

  await Payment.updateOne(
    { _id: payment._id, 'invoice.number': { $exists: false } },
    {
      $set: {
        invoice: {
          number: await nextInvoiceNumber(therapist._id, payment.paidAt),
          issuedAt: payment.paidAt,
          businessName: b.businessName || therapist.name,
          address: b.address || '',
          gstin: b.gstin || '',
          gstRatePercent: rate,
          taxableAmount: taxable,
          cgst,
          sgst,
          clientName: client.name,
          clientEmail: client.email,
        },
      },
    }
  );
}

async function confirmSession(payment) {
  const confirmed = await Session.findOneAndUpdate(
    { _id: payment.session, status: 'pending_payment' },
    { $set: { status: 'confirmed', paymentStatus: 'paid' }, $unset: { holdExpiresAt: 1 } },
    { new: true }
  );
  if (confirmed) {
    notify('booking.confirmed', { sessionId: confirmed._id, clientEmail: confirmed.clientEmail, startTime: confirmed.startTime });
    notify('payment.received', { paymentId: payment._id, amount: payment.amount });
    return;
  }

  const current = await Session.findById(payment.session);
  if (current && current.status === 'confirmed') return; // already done

  // The client paid AFTER the hold ran out. Try to take the time back; if someone else has
  // booked it meanwhile, the database guard rejects us and we refund automatically.
  if (current && current.status === 'expired') {
    try {
      const reclaimed = await Session.findOneAndUpdate(
        { _id: current._id, status: 'expired' },
        { $set: { status: 'confirmed', paymentStatus: 'paid', holdsSlot: true } },
        { new: true }
      );
      if (reclaimed) {
        notify('booking.confirmed', { sessionId: reclaimed._id, clientEmail: reclaimed.clientEmail, startTime: reclaimed.startTime });
        return;
      }
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  await refundAndMark(payment, 'The booked time was released before payment arrived and is no longer free.');
}

async function activatePackage(payment) {
  const cp = await ClientPackage.findById(payment.clientPackage);
  if (!cp || cp.status !== 'pending_payment') return;
  const now = payment.paidAt || new Date();
  await ClientPackage.updateOne(
    { _id: cp._id, status: 'pending_payment' },
    { status: 'active', purchasedAt: now, expiresAt: new Date(now.getTime() + cp.validityDays * DAY_MS) }
  );
}

async function refundAndMark(payment, reason) {
  let refunded = true;
  try {
    await gateway.refundPayment(payment.gatewayPaymentId);
  } catch (err) {
    refunded = false;
    console.error('Automatic refund failed, needs manual action:', String(payment._id), err.error || err.message);
  }
  await Payment.updateOne(
    { _id: payment._id },
    refunded
      ? { status: 'refunded', refundedAt: new Date(), failureReason: reason }
      : { failureReason: `Manual refund needed: ${reason}` }
  );
  if (payment.session) await Session.updateOne({ _id: payment.session }, { paymentStatus: refunded ? 'refunded' : 'paid' });
  notify('payment.refunded', { paymentId: payment._id, refunded, reason });
}

/* ---------- Webhook events ---------- */

async function handleWebhookEvent(event) {
  const p = event.payload || {};
  switch (event.event) {
    case 'payment.captured':
    case 'order.paid': {
      const pay = p.payment && p.payment.entity;
      const order = p.order && p.order.entity;
      const orderId = (pay && pay.order_id) || (order && order.id);
      if (orderId && pay && pay.id) await markPaid({ orderId, gatewayPaymentId: pay.id, method: pay.method });
      break;
    }
    case 'payment.failed': {
      const pay = p.payment && p.payment.entity;
      if (pay && pay.order_id) {
        await Payment.updateOne({ gatewayOrderId: pay.order_id, status: 'created' }, { failureReason: pay.error_description || 'Payment failed' });
      }
      break;
    }
    case 'refund.processed': {
      const refund = p.refund && p.refund.entity;
      if (refund && refund.payment_id) {
        const payment = await Payment.findOneAndUpdate(
          { gatewayPaymentId: refund.payment_id, status: 'paid' },
          { status: 'refunded', refundedAt: new Date() },
          { new: true }
        );
        if (payment && payment.session) await Session.updateOne({ _id: payment.session }, { paymentStatus: 'refunded' });
      }
      break;
    }
    default:
      break; // events we do not care about are acknowledged and ignored
  }
}

/* ---------- Slot holds and package credits ---------- */

// Unpaid holds free their time again. Run before every slot lookup/booking and once a minute.
async function releaseExpiredHolds(therapistId) {
  const filter = { status: 'pending_payment', holdExpiresAt: { $lt: new Date() } };
  if (therapistId) filter.therapist = therapistId;
  await Session.updateMany(filter, { $set: { status: 'expired' }, $unset: { holdsSlot: 1 } });
}

async function expireOldPackages() {
  await ClientPackage.updateMany({ status: 'active', expiresAt: { $lt: new Date() } }, { status: 'expired' });
}

// Atomically takes one credit from the soonest-expiring matching package, or returns null.
async function redeemCredit(clientId, durationMin) {
  const cp = await ClientPackage.findOneAndUpdate(
    { client: clientId, status: 'active', durationMin, sessionsRemaining: { $gt: 0 }, expiresAt: { $gt: new Date() } },
    { $inc: { sessionsRemaining: -1 } },
    { new: true, sort: { expiresAt: 1 } }
  );
  if (cp && cp.sessionsRemaining === 0) await ClientPackage.updateOne({ _id: cp._id, sessionsRemaining: 0 }, { status: 'exhausted' });
  return cp;
}

// Gives a credit back (booking failed or the therapist cancelled), unless the package has expired.
async function restoreCredit(clientPackageId) {
  await ClientPackage.updateOne(
    { _id: clientPackageId, status: { $in: ['active', 'exhausted'] }, expiresAt: { $gt: new Date() } },
    { $inc: { sessionsRemaining: 1 }, $set: { status: 'active' } }
  );
}

module.exports = {
  createSessionPayment,
  createPackagePayment,
  markPaid,
  handleWebhookEvent,
  releaseExpiredHolds,
  expireOldPackages,
  redeemCredit,
  restoreCredit,
};
