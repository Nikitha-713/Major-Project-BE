const Client = require('../models/Client');
const Therapist = require('../models/Therapist');
const Session = require('../models/Session');
const ConsentRecord = require('../models/ConsentRecord');
const Package = require('../models/Package');
const ClientPackage = require('../models/ClientPackage');
const Payment = require('../models/Payment');
const { clientPackagesView } = require('./paymentController');
const consentTemplates = require('../config/consentTemplates');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const clientFromToken = (token) => (TOKEN_RE.test(token) ? Client.findOne({ portalToken: token }) : null);
const text = (v) => (v === undefined || v === null ? '' : String(v).trim());

// What the client may see: their own first-level status only. Previously submitted intake
// answers are NEVER returned here, so a leaked link cannot expose health information.
exports.getPortal = async (req, res, next) => {
  try {
    const client = await clientFromToken(req.params.token);
    if (!client) return res.status(404).json({ message: 'This link is not valid' });

    const therapist = await Therapist.findById(client.therapist);
    const consent = consentTemplates.render(consentTemplates.CURRENT_VERSION, therapist.name);
    const upcomingSessions = await Session.find({ client: client._id, status: 'confirmed', endTime: { $gte: new Date() } })
      .sort({ startTime: 1 })
      .limit(5)
      .select('startTime durationMin serviceTitle')
      .lean();

    const [owned, forSale, payments] = await Promise.all([
      ClientPackage.find({ client: client._id, status: { $in: ['active', 'exhausted', 'expired'] } }).sort({ createdAt: -1 }).lean(),
      Package.find({ therapist: client.therapist, active: true }).sort({ sessions: 1 }).lean(),
      Payment.find({ client: client._id, status: 'paid' }).sort({ paidAt: -1 }).limit(20)
        .select('description amount paidAt invoice.number').lean(),
    ]);

    res.json({
      packages: clientPackagesView(owned),
      packagesForSale: forSale.map((p) => ({
        id: p._id, name: p.name, sessions: p.sessions, price: p.price, durationMin: p.durationMin,
        validityDays: p.validityDays, perSessionRate: Math.round(p.price / p.sessions),
      })),
      payments: payments.map((p) => ({ id: p._id, description: p.description, amount: p.amount, paidAt: p.paidAt, invoiceNumber: p.invoice && p.invoice.number })),
      therapist: { id: therapist._id, name: therapist.name, slug: therapist.slug },
      client: { id: client._id, name: client.name },
      intakeCompleted: Boolean(client.intake && client.intake.completedAt),
      consent,
      upcomingSessions,
    });
  } catch (err) {
    next(err);
  }
};

exports.submitIntake = async (req, res, next) => {
  try {
    const client = await clientFromToken(req.params.token);
    if (!client) return res.status(404).json({ message: 'This link is not valid' });

    const b = req.body;
    if (b.consent.version !== consentTemplates.CURRENT_VERSION) {
      return res.status(409).json({ message: 'The consent text was updated. Please reload this page and try again.' });
    }

    const therapist = await Therapist.findById(client.therapist);
    const rendered = consentTemplates.render(consentTemplates.CURRENT_VERSION, therapist.name);

    const intake = {
      completedAt: new Date(),
      demographics: {
        dateOfBirth: new Date(b.demographics.dateOfBirth),
        gender: text(b.demographics.gender),
        occupation: text(b.demographics.occupation),
        city: text(b.demographics.city),
      },
      presentingConcern: text(b.presentingConcern),
      history: {
        previousTherapy: Boolean(b.history && b.history.previousTherapy),
        previousTherapyDetails: text(b.history && b.history.previousTherapyDetails),
        medications: text(b.history && b.history.medications),
        medicalConditions: text(b.history && b.history.medicalConditions),
      },
      emergencyContact: {
        name: text(b.emergencyContact.name),
        phone: text(b.emergencyContact.phone),
        relationship: text(b.emergencyContact.relationship),
      },
    };

    // Atomic "submit once" guard: only succeeds if intake has never been completed.
    const result = await Client.updateOne(
      { _id: client._id, 'intake.completedAt': { $exists: false } },
      { $set: { intake } }
    );
    if (result.modifiedCount === 0) {
      return res.status(409).json({ message: 'Your intake form is already submitted. Contact your therapist to change anything.' });
    }

    try {
      await ConsentRecord.create({
        client: client._id,
        therapist: client.therapist,
        type: 'treatment_consent',
        version: rendered.version,
        title: rendered.title,
        textSnapshot: rendered.paragraphs.join('\n\n'),
        acceptedAt: new Date(), // server clock, never the browser's
        ipAddress: req.ip || '',
        userAgent: (req.get('user-agent') || '').slice(0, 300),
      });
    } catch (err) {
      // Intake without a consent record is not allowed: undo and let the client retry.
      await Client.updateOne({ _id: client._id }, { $unset: { intake: '' } });
      throw err;
    }

    res.status(201).json({ intakeCompleted: true });
  } catch (err) {
    next(err);
  }
};
