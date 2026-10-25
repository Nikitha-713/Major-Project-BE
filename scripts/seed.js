// Usage: npm run seed   (wipes therapists, availability and sessions, then inserts demo data)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Therapist = require('../src/models/Therapist');
const Availability = require('../src/models/Availability');
const Session = require('../src/models/Session');

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

(async () => {
  await connectDB();
  await Promise.all([Therapist.deleteMany({}), Availability.deleteMany({}), Session.deleteMany({})]);
  await Session.syncIndexes(); // make sure the double-booking index exists

  const passwordHash = await bcrypt.hash('password123', 12);
  for (const d of demo) {
    const therapist = await Therapist.create({ ...d.profile, passwordHash });
    await Availability.create({ therapist: therapist._id, ...d.availability });
  }
  console.log('Seeded therapists and availability. Login with asha@example.com / password123');
  await mongoose.disconnect();
})();
