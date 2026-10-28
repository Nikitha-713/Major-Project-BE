const router = require('express').Router();
const { body } = require('express-validator');
const protect = require('../middleware/authMiddleware');
const { validate } = require('../middleware/errorHandler');
const { updateMe, getPublicProfile, getShareHtml } = require('../controllers/therapistController');

// Imports for Analytics
const Payment = require('../models/Payment');
const Session = require('../models/Session');
const Client = require('../models/Client');
const TierConfig = require('../models/TierConfig');
const { canAccess } = require('../services/entitlementService');

router.put(
  '/me',
  protect,
  [
    body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2 to 80 characters'),
    body('slug').optional().trim().isLength({ min: 3, max: 40 }).withMessage('Link must be 3 to 40 characters'),
    body('headline').optional().isLength({ max: 140 }).withMessage('Headline can be at most 140 characters'),
    body('bio').optional().isLength({ max: 2000 }).withMessage('Bio can be at most 2000 characters'),
    body('specializations').optional().isArray({ max: 15 }).withMessage('Add up to 15 specializations'),
    body('languages').optional().isArray({ max: 15 }).withMessage('Add up to 15 languages'),
    body('services').optional().isArray({ max: 8 }).withMessage('Add up to 8 services'),
    body('services.*.title').optional().trim().notEmpty().withMessage('Each service needs a title'),
    body('services.*.durationMin').optional().isIn([30, 45, 60, 90]).withMessage('Duration must be 30, 45, 60 or 90 minutes'),
    body('services.*.price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Price cannot be negative'),
  ],
  validate,
  updateMe
);

// ANALYTICS ROUTE
router.get('/analytics', protect, async (req, res, next) => {
  try {
    // 1. Check Gate
    const access = await canAccess(req.therapist._id, 'advancedAnalytics');
    if (!access.allowed) {
      return res.status(403).json({ code: 'UPGRADE_REQUIRED', message: access.reason });
    }

    // 2. Get Data
    const therapistId = req.therapist._id;
    const therapistTier = req.therapist.subscriptionTier || 'free';
    const config = await TierConfig.findOne({ tier: therapistTier });
    const daysLimit = config ? config.analyticsDepthDays : 7;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

    let revenueTrend = [];
    try {
      const revenuePipeline = [
        { $match: { therapist: therapistId, status: 'paid', paidAt: { $gte: cutoffDate } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ];
      const revenueDataRaw = await Payment.aggregate(revenuePipeline);
      revenueTrend = revenueDataRaw.map(item => ({ 
        date: item._id || 'Unknown', 
        revenue: (item.revenue || 0) / 100, 
        transactions: item.count || 0 
      }));
    } catch (e) { console.log('Revenue error', e.message); }

    let completed = 0, noShow = 0, cancelled = 0;
    try {
      const sessionPipeline = [
        { $match: { therapist: therapistId, startTime: { $gte: cutoffDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ];
      const sessionStatsRaw = await Session.aggregate(sessionPipeline);
      sessionStatsRaw.forEach(stat => {
        if (stat._id === 'completed') completed = stat.count;
        if (stat._id === 'no_show') noShow = stat.count;
        if (stat._id === 'cancelled') cancelled = stat.count;
      });
    } catch (e) { console.log('Session error', e.message); }

    const totalSessions = completed + noShow + cancelled;
    const noShowRate = totalSessions > 0 ? ((noShow / totalSessions) * 100).toFixed(1) : 0;
    
    let activeClientsCount = 0;
    try {
      activeClientsCount = await Client.countDocuments({ therapist: therapistId, status: 'active' });
    } catch(e) { console.log('Client error', e.message); }

    res.json({
      tier: therapistTier,
      analyticsDays: daysLimit,
      revenueTrend,
      stats: {
        totalRevenue: revenueTrend.reduce((sum, item) => sum + item.revenue, 0),
        completedSessions: completed,
        noShowRate: parseFloat(noShowRate),
        activeClients: activeClientsCount
      }
    });
  } catch (err) {
    console.error("Analytics Route Error:", err);
    res.status(500).json({ message: "Analytics failed. Check backend terminal." });
  }
});

router.get('/public/:slug', getPublicProfile);
router.get('/public/:slug/share', getShareHtml);

module.exports = router;