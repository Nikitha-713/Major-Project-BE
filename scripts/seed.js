// Usage: npm run seed   (wipes therapists, then inserts demo data)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Therapist = require('../src/models/Therapist');

const demo = [
  {
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
  {
    name: 'Rohan Mehta',
    email: 'rohan@example.com',
    slug: 'rohan-mehta',
    headline: 'Couples and family counselling, in person and online.',
    bio: 'Counsellor focused on communication and relationships.',
    specializations: ['Couples therapy', 'Family conflict'],
    languages: ['English', 'Hindi'],
    services: [{ title: 'Couples session', description: 'Joint session for partners.', durationMin: 90, price: 2800 }],
  },
];

(async () => {
  await connectDB();
  await Therapist.deleteMany({});
  const passwordHash = await bcrypt.hash('password123', 12);
  await Therapist.insertMany(demo.map((t) => ({ ...t, passwordHash })));
  console.log('Seeded therapists. Login with asha@example.com / password123');
  await mongoose.disconnect();
})();
