const { DateTime } = require('luxon');
const Therapist = require('../models/Therapist');
const Availability = require('../models/Availability');
const Session = require('../models/Session');
const Client = require('../models/Client');
const { OPTIONS, LIMITS } = require('../config/schedulingDefaults');
const { HOLD_MINUTES } = require('../config/billing');
const { validateAvailability } = require('../utils/validateAvailability');
const { toMinor } = require('../utils/billingMath');
const { generateOpenSlots, buildCells, normalizeIso } = require('../services/schedulingService');
const { notify } = require('../services/notificationService');
const { findOrCreateClient } = require('../services/clientService');
const gateway = require('../services/paymentGateway');
const { createSessionPayment, releaseExpiredHolds, redeemCredit, restoreCredit } = require('../services/paymentService');

const optionsPayload = () => ({
  ...OPTIONS,
  maxWindowsPerDay: LIMITS.maxWindowsPerDay,
  maxMinNoticeHours: LIMITS.maxMinNoticeHours,
  maxAdvanceDays: LIMITS.maxAdvanceDays,
});

// React StrictMode fires two identical requests on first load; the unique index on
// `therapist` makes the second create fail, so we simply read the winner.
async function getOrCreateAvailability(therapistId) {
  let av = await Availability.findOne({ therapist: therapistId });
  if (av) return av;
  try {
    return await Availability.create({ therapist: therapistId });
  } catch (err) {
    if (err.code === 11000) return Availability.findOne({ therapist: therapistId });
    throw err;
  }
}

const serializeAvailability = (av) => {
  const o = av.toObject();
  delete o._id;
  delete o.__v;
  delete o.therapist;
  return o;
};

// Confirmed sessions AND unpaid holds both block the time.
const findBlockingSessions = (therapistId) =>
  Session.find({ therapist: therapistId, status: { $in: ['confirmed', 'pending_payment'] }, occupiedUntil: { $gt: new Date() } })
    .select('startTime occupiedUntil')
    .lean();

/* ---------- Therapist (private) ---------- */

exports.getMyAvailability = async (req, res, next) => {
  try {
    const av = await getOrCreateAvailability(req.therapist._id);
    res.json({ availability: serializeAvailability(av), options: optionsPayload() });
  } catch (err) {
    next(err);
  }
};

exports.updateMyAvailability = async (req, res, next) => {
  try {
    const { error, value } = validateAvailability(req.body);
    if (error) return res.status(400).json({ message: error });

    const av = await getOrCreateAvailability(req.therapist._id);
    av.set(value);
    await av.save();
    res.json({ availability: serializeAvailability(av), options: optionsPayload() });
  } catch (err) {
    next(err);
  }
};

exports.listMySessions = async (req, res, next) => {
  try {
    const range = req.query.range === 'past' ? 'past' : 'upcoming';
    const now = new Date();
    const filter =
      range === 'past'
        ? { therapist: req.therapist._id, startTime: { $lt: now }, status: { $nin: ['pending_payment', 'expired'] } }
        : { therapist: req.therapist._id, status: 'confirmed', endTime: { $gte: now } };

    const sessions = await Session.find(filter)
      .sort({ startTime: range === 'past' ? -1 : 1 })
      .limit(100)
      .lean();
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
};

exports.cancelSession = async (req, res, next) => {
  try {
    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, therapist: req.therapist._id, status: 'confirmed' },
      { $set: { status: 'cancelled', cancelledAt: new Date() }, $unset: { holdsSlot: 1 } },
      { new: true }
    ).lean();
    if (!session) return res.status(404).json({ message: 'Session not found or already cancelled' });

    // A session paid with a package credit gives the credit back.
    if (session.clientPackage) await restoreCredit(session.clientPackage);

    notify('booking.cancelled', { sessionId: session._id, clientEmail: session.clientEmail });
    res.json({ session });
  } catch (err) {
    next(err);
  }
};

/* ---------- Public (clients, no login) ---------- */

exports.getPublicSlots = async (req, res, next) => {
  try {
    const therapist = await Therapist.findOne({ slug: req.params.slug.toLowerCase() });
    if (!therapist) return res.status(404).json({ message: 'Profile not found' });

    const av = await Availability.findOne({ therapist: therapist._id }).lean();
    if (!av) return res.json({ timezone: null, sessionDurations: [], durationMin: null, slots: [], paymentRequired: false });

    const durationMin = Number(req.query.durationMin) || av.sessionDurations[0];
    const allowed = new Set([...av.sessionDurations, ...therapist.services.map((s) => s.durationMin)]);
    if (!allowed.has(durationMin)) return res.status(400).json({ message: 'That session length is not offered' });

    await releaseExpiredHolds(therapist._id);
    const bookedSessions = await findBlockingSessions(therapist._id);
    const slots = generateOpenSlots({ availability: av, durationMin, bookedSessions });

    res.json({
      timezone: av.timezone,
      sessionDurations: av.sessionDurations,
      durationMin,
      slots,
      paymentRequired: Boolean(therapist.billing && therapist.billing.collectAdvancePayment),
    });
  } catch (err) {
    next(err);
  }
};

exports.bookSlot = async (req, res, next) => {
  try {
    const therapist = await Therapist.findOne({ slug: req.params.slug.toLowerCase() });
    if (!therapist) return res.status(404).json({ message: 'Profile not found' });

    const av = await Availability.findOne({ therapist: therapist._id }).lean();
    if (!av) return res.status(409).json({ message: 'This therapist is not accepting online bookings yet' });

    // 1. What is being booked (a listed service, or a plain session length), and its price.
    let durationMin;
    let serviceTitle = 'Therapy session';
    let serviceId;
    let priceMinor = 0;
    if (req.body.serviceId) {
      const service = therapist.services.id(req.body.serviceId);
      if (!service) return res.status(400).json({ message: 'That session type no longer exists' });
      durationMin = service.durationMin;
      serviceTitle = service.title;
      serviceId = service._id;
      priceMinor = typeof service.price === 'number' ? toMinor(service.price) : 0;
    } else {
      durationMin = Number(req.body.durationMin);
      if (!av.sessionDurations.includes(durationMin)) return res.status(400).json({ message: 'That session length is not offered' });
    }

    // 2. Re-check the slot on the server. Never trust the browser's list.
    const startIso = normalizeIso(req.body.startTime);
    if (!startIso) return res.status(400).json({ message: 'Choose a valid start time' });

    await releaseExpiredHolds(therapist._id);
    const bookedSessions = await findBlockingSessions(therapist._id);
    const open = generateOpenSlots({ availability: av, durationMin, bookedSessions });
    if (!open.includes(startIso)) {
      return res.status(409).json({ message: 'That time is no longer available. Please pick another.' });
    }

    // 3. Who is booking? A valid portal link proves identity, which allows package credits.
    //    Entering someone's email alone never lets you spend their credits.
    let linkedClient = null;
    if (req.body.portalToken) {
      linkedClient = await Client.findOne({ portalToken: String(req.body.portalToken), therapist: therapist._id });
      if (!linkedClient) return res.status(400).json({ message: 'This personal link is not valid' });
    }

    // 4. How is it paid: package credit, online payment, or nothing to collect.
    const credit = linkedClient ? await redeemCredit(linkedClient._id, durationMin) : null;
    const needsPayment = !credit && Boolean(therapist.billing && therapist.billing.collectAdvancePayment) && priceMinor > 0;

    // 5. Create the session. The unique index makes this atomic: if another client got the
    //    same time between step 2 and now, MongoDB rejects this insert with code 11000.
    const start = DateTime.fromISO(startIso, { zone: 'utc' });
    const startTime = start.toJSDate();
    const endTime = start.plus({ minutes: durationMin }).toJSDate();
    const occupiedUntil = start.plus({ minutes: durationMin + av.bufferMin }).toJSDate();

    let session;
    try {
      session = await Session.create({
        therapist: therapist._id,
        serviceId,
        serviceTitle,
        durationMin,
        startTime,
        endTime,
        occupiedUntil,
        cells: buildCells(startTime, occupiedUntil),
        status: needsPayment ? 'pending_payment' : 'confirmed',
        holdsSlot: true,
        holdExpiresAt: needsPayment ? new Date(Date.now() + HOLD_MINUTES * 60000) : undefined,
        paymentStatus: credit ? 'package' : needsPayment ? 'pending' : 'not_required',
        clientPackage: credit ? credit._id : undefined,
        clientName: req.body.clientName,
        clientEmail: req.body.clientEmail,
        clientPhone: req.body.clientPhone || '',
        clientTimezone: req.body.clientTimezone || 'UTC',
      });
    } catch (err) {
      if (credit) await restoreCredit(credit._id);
      if (err.code === 11000) {
        return res.status(409).json({ message: 'That time was just booked by someone else. Please pick another.' });
      }
      throw err;
    }

    // 6. Attach the booking to a client record.
    const { client, created } = linkedClient
      ? { client: linkedClient, created: false }
      : await findOrCreateClient(therapist._id, {
          name: session.clientName,
          email: session.clientEmail,
          phone: session.clientPhone,
          timezone: session.clientTimezone,
        });
    await Session.updateOne({ _id: session._id }, { client: client._id });

    const summary = {
      id: session._id,
      therapistName: therapist.name,
      serviceTitle,
      durationMin,
      startTime,
      endTime,
      paidWithPackage: Boolean(credit),
      // Only handed out when the client record is brand new. For returning clients the link
      // stays private: knowing someone's email must never reveal their portal link.
      portalToken: created ? client.portalToken : undefined,
    };

    // 7a. Online payment: open a Razorpay order. The time stays held until it is paid or expires.
    if (needsPayment) {
      try {
        const { payment, order } = await createSessionPayment({ therapist, client, session, amountMinor: priceMinor });
        return res.status(201).json({
          requiresPayment: true,
          session: summary,
          payment: {
            id: payment._id,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: gateway.publicKeyId(),
            description: payment.description,
            holdMinutes: HOLD_MINUTES,
          },
        });
      } catch (err) {
        // Could not start the payment: release the time so nobody is blocked by a dead hold.
        await Session.deleteOne({ _id: session._id });
        throw err;
      }
    }

    // 7b. Nothing to collect: confirmed immediately.
    notify('booking.confirmed', { sessionId: session._id, therapist: therapist.name, clientEmail: session.clientEmail, startTime });
    res.status(201).json({ requiresPayment: false, session: summary });
  } catch (err) {
    next(err);
  }
};
