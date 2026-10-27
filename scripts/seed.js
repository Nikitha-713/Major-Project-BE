// Usage: npm run seed   (wipes everything, then inserts demo data)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const connectDB = require('../src/config/db');
const Therapist = require('../src/models/Therapist');
const Availability = require('../src/models/Availability');
const Session = require('../src/models/Session');
const Client = require('../src/models/Client');
const ConsentRecord = require('../src/models/ConsentRecord');
const Payment = require('../src/models/Payment');
const Package = require('../src/models/Package');
const ClientPackage = require('../src/models/ClientPackage');
const Counter = require('../src/models/Counter');
const SessionNote = require('../src/models/SessionNote');
const consentTemplates = require('../src/config/consentTemplates');
const { buildCells } = require('../src/services/schedulingService');

const weekdays = (windows) => [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, windows }));

const demo = [
  {
    profile: {
      name: 'Dr. Asha Rao',
      email: 'asha@example.com',
      slug: 'asha-rao',
      headline: 'Helping adults work through anxiety, burnout and life transitions.',
      bio: 'I am a clinical psychologist with 9 years of experience.\nMy approach blends CBT with mindfulness-based practices.',
      specializations: ['Anxiety', 'Burnout', 'Career stress'],
      languages: ['English', 'Kannada', 'Hindi'],
      billing: {
        collectAdvancePayment: true,
        businessName: 'Dr. Asha Rao, Clinical Psychologist',
        address: 'Indiranagar, Bengaluru, Karnataka 560038',
        gstin: '',
        gstRatePercent: 0,
      },
      services: [
        { title: 'Initial consultation', description: 'A first conversation to understand what brings you here.', durationMin: 45, price: 1200 },
        { title: 'Individual therapy', description: 'Ongoing one-to-one sessions.', durationMin: 60, price: 1800 },
      ],
    },
    availability: {
      timezone: 'Asia/Kolkata',
      weeklyHours: weekdays([{ start: '10:00', end: '13:00' }, { start: '15:00', end: '18:00' }]),
      bufferMin: 10,
      sessionDurations: [45, 60],
    },
  },
  {
    profile: {
      name: 'Rohan Mehta',
      email: 'rohan@example.com',
      slug: 'rohan-mehta',
      headline: 'Couples and family counselling, in person and online.',
      bio: 'Counsellor focused on communication and relationships.',
      specializations: ['Couples therapy', 'Family conflict'],
      languages: ['English', 'Hindi'],
      services: [{ title: 'Couples session', description: 'Joint session for partners.', durationMin: 90, price: 2800 }],
    },
    availability: {
      timezone: 'Asia/Kolkata',
      weeklyHours: [
        { dayOfWeek: 2, windows: [{ start: '16:00', end: '20:00' }] },
        { dayOfWeek: 4, windows: [{ start: '16:00', end: '20:00' }] },
        { dayOfWeek: 6, windows: [{ start: '10:00', end: '14:00' }] },
      ],
      bufferMin: 15,
      sessionDurations: [60, 90],
    },
  },
];

// Builds a small TipTap document from plain paragraphs.
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

const makeSession = async (therapist, client, daysFromNow, hour, durationMin, status, title) => {
  const start = DateTime.now().setZone('Asia/Kolkata').plus({ days: daysFromNow })
    .set({ hour, minute: 0, second: 0, millisecond: 0 }).toUTC();
  const startTime = start.toJSDate();
  const endTime = start.plus({ minutes: durationMin }).toJSDate();
  const occupiedUntil = start.plus({ minutes: durationMin + 10 }).toJSDate();
  return Session.create({
    therapist: therapist._id, client: client._id, serviceTitle: title, durationMin,
    startTime, endTime, occupiedUntil, cells: buildCells(startTime, occupiedUntil), status, holdsSlot: true,
    clientName: client.name, clientEmail: client.email, clientPhone: client.phone, clientTimezone: client.timezone,
  });
};

(async () => {
  await connectDB();
  await Promise.all([
    Therapist.deleteMany({}), Availability.deleteMany({}), Session.deleteMany({}),
    Client.deleteMany({}), ConsentRecord.deleteMany({}),
    Payment.deleteMany({}), Package.deleteMany({}), ClientPackage.deleteMany({}), Counter.deleteMany({}),
    SessionNote.deleteMany({}),
  ]);
  await Promise.all([Session.syncIndexes(), Client.syncIndexes()]);

  const passwordHash = await bcrypt.hash('password123', 12);
  const created = [];
  for (const d of demo) {
    const therapist = await Therapist.create({ ...d.profile, passwordHash });
    await Availability.create({ therapist: therapist._id, ...d.availability });
    created.push(therapist);
  }
  const asha = created[0];

  await Package.create([
    { therapist: asha._id, name: '3 session pack', sessions: 3, price: 510000, durationMin: 60, validityDays: 90 },
    { therapist: asha._id, name: '6 session pack', sessions: 6, price: 960000, durationMin: 60, validityDays: 120 },
  ]);

  // Client 1: intake and consent done, two past sessions and one upcoming.
  const priya = await Client.create({
    therapist: asha._id, name: 'Priya Nair', email: 'priya@example.com', phone: '9876500001',
    timezone: 'Asia/Kolkata', tags: ['anxiety', 'weekly'],
    intake: {
      completedAt: new Date(),
      demographics: { dateOfBirth: new Date('1994-05-12'), gender: 'Female', occupation: 'Software engineer', city: 'Bengaluru' },
      presentingConcern: 'Constant worry about work deadlines and trouble sleeping for the last six months.',
      history: { previousTherapy: false, previousTherapyDetails: '', medications: '', medicalConditions: '' },
      emergencyContact: { name: 'Anil Nair', phone: '9876500002', relationship: 'Father' },
    },
  });
  const consent = consentTemplates.render(consentTemplates.CURRENT_VERSION, asha.name);
  await ConsentRecord.create({
    client: priya._id, therapist: asha._id, type: 'treatment_consent', version: consent.version,
    title: consent.title, textSnapshot: consent.paragraphs.join('\n\n'), acceptedAt: new Date(), ipAddress: '127.0.0.1', userAgent: 'seed script',
  });
  const priyaFirst = await makeSession(asha, priya, -14, 10, 45, 'completed', 'Initial consultation');
  const priyaSecond = await makeSession(asha, priya, -7, 10, 60, 'completed', 'Individual therapy');
  await makeSession(asha, priya, 3, 15, 60, 'confirmed', 'Individual therapy');

  // Client 2: booked but intake still pending (use this one to try the portal form).
  const karthik = await Client.create({
    therapist: asha._id, name: 'Karthik Gowda', email: 'karthik@example.com', phone: '9876500003',
    timezone: 'Asia/Kolkata', tags: ['new'],
  });
  await Client.findById(karthik._id); // token already generated on create
  await makeSession(asha, karthik, 5, 11, 45, 'confirmed', 'Initial consultation');

  // Client 3: inactive, one past session.
  const meera = await Client.create({
    therapist: asha._id, name: 'Meera Joshi', email: 'meera@example.com', phone: '',
    timezone: 'Asia/Kolkata', status: 'inactive', tags: ['burnout'],
  });
  await makeSession(asha, meera, -30, 16, 60, 'completed', 'Individual therapy');

  // Notes: one private SOAP note (therapist only) and one shared free-form note (client can read it).
  await SessionNote.create([
    {
      therapist: asha._id, client: priya._id, session: priyaFirst._id, type: 'private', format: 'soap',
      title: 'Intake session',
      sections: [
        { key: 'subjective', content: doc('Reports constant worry about deadlines. Sleeping 4 to 5 hours a night.') },
        { key: 'objective', content: doc('Restless, speech slightly fast. Good eye contact. Oriented and cooperative.') },
        { key: 'assessment', content: doc('Presentation consistent with generalised anxiety. Rule out burnout contribution.') },
        { key: 'plan', content: doc('Weekly CBT sessions. Introduce a sleep diary and diaphragmatic breathing.') },
      ],
    },
    {
      therapist: asha._id, client: priya._id, session: priyaSecond._id, type: 'shared', format: 'freeform',
      title: 'Between-session practice',
      sections: [{ key: 'body', content: doc('Practice the 4-6 breathing exercise for five minutes, twice a day.', 'Fill in the sleep diary each morning and bring it to our next session.') }],
    },
  ]);

  console.log('Seeded therapists, availability, clients, sessions and notes.');
  console.log('Login: asha@example.com / password123');
  console.log(`Try the intake form for Karthik (pending): http://localhost:5173/portal/${karthik.portalToken}`);
  await mongoose.disconnect();
})();
