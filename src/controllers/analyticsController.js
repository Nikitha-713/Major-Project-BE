const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Client = require('../models/Client');
const Session = require('../models/Session');
const { canAccess } = require('../services/entitlementService');

const oid = (id) => new mongoose.Types.ObjectId(id);

exports.getAnalytics = async (req, res, next) => {
  try {
    const therapistId = oid(req.user.id);

    // Depth + history window come from the entitlement service, not tier strings
    const depth  = (await canAccess(req.user.id, 'analytics_depth')).value;
    const months = (await canAccess(req.user.id, 'analytics_months')).value;
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    // 1. Revenue trend (monthly) - aggregation pipeline
    const revenueTrend = await Payment.aggregate([
      { $match: { therapist: therapistId, status: 'paid', createdAt: { $gte: since } } },
      { $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          revenue: { $sum: '$net_amount' },
          payments: { $sum: 1 },
      } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
      { $project: { _id: 0, month: { $concat: [{ $toString: '$_id.y' }, '-', { $toString: '$_id.m' }] }, revenue: 1, payments: 1 } },
    ]);

    // 2. Active clients
    const activeClients = await Client.countDocuments({ therapist: therapistId, status: 'active' });

    // 3. No-show rate
    const [noShow = { total: 0, noShows: 0 }] = await Session.aggregate([
      { $match: { therapist: therapistId, startTime: { $gte: since, $lte: new Date() }, status: { $in: ['completed', 'no_show'] } } },
      { $group: { _id: null, total: { $sum: 1 }, noShows: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } } } },
    ]);
    const noShowRate = noShow.total ? +((noShow.noShows / noShow.total) * 100).toFixed(1) : 0;

    const result = { depth, months, revenueTrend, activeClients, noShowRate };

    // Advanced-only extras
    if (depth === 'advanced') {
      result.revenueByClient = await Payment.aggregate([
        { $match: { therapist: therapistId, status: 'paid', createdAt: { $gte: since } } },
        { $group: { _id: '$client', revenue: { $sum: '$net_amount' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
        { $project: { revenue: 1, name: { $arrayElemAt: ['$client.name', 0] } } },
      ]);
      result.noShowByMonth = await Session.aggregate([
        { $match: { therapist: therapistId, startTime: { $gte: since, $lte: new Date() }, status: { $in: ['completed', 'no_show'] } } },
        { $group: {
            _id: { y: { $year: '$startTime' }, m: { $month: '$startTime' } },
            total: { $sum: 1 },
            noShows: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
        } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]);
    }

    res.json(result);
  } catch (e) { next(e); }
};
