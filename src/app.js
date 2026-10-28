const express = require('express');
const cors = require('cors');

const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const therapistRoutes = require('./routes/therapistRoutes');
const clientRoutes = require('./routes/clientRoutes');
const schedulingRoutes = require('./routes/schedulingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const noteRoutes = require('./routes/noteRoutes');
const chatRoutes = require('./routes/chatRoutes');                   // Module 6
const analyticsRoutes = require('./routes/analyticsRoutes');         // Module 7
const entitlementRoutes = require('./routes/entitlementRoutes');     // Module 7

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));

// Keep the raw body so the Razorpay webhook signature can be verified
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

// Friendly message for the root URL
app.get('/', (_req, res) => res.send('Unfazed API is running'));
// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/entitlements', entitlementRoutes);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ message: 'Route not found' }));

// Must be last
app.use(errorHandler);

module.exports = app;
