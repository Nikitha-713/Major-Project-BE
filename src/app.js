const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const therapistRoutes = require('./routes/therapistRoutes');
const schedulingRoutes = require('./routes/schedulingRoutes');
const clientRoutes = require('./routes/clientRoutes');
const portalRoutes = require('./routes/portalRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1); // so req.ip is the real client IP behind Render/Railway

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/portal', portalRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
