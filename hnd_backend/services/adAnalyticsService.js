/**
 * Ad Analytics Service
 * Aggregates event logs and delivery logs into comprehensive performance metrics
 */
const AdEventLog = require('../models/AdEventLog');
const AdDeliveryLog = require('../models/AdDeliveryLog');
const User = require('../models/User');
const Ad = require('../models/Ad');

/**
 * Get comprehensive performance analytics for an ad
 */
async function getAdAnalytics(adId, dateRange = null) {
  try {
    const match = { ad_id: adId };
    
    if (dateRange) {
      const { startDate, endDate } = dateRange;
      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
      }
    }

    // 1. Basic metrics
    const eventCounts = await AdEventLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$event_type',
          count: { $sum: 1 },
        },
      },
    ]);

    const eventMap = {};
    eventCounts.forEach((e) => {
      eventMap[e._id] = e.count;
    });

    const impressions = eventMap['impression'] || 0;
    const clicks = eventMap['click'] || 0;
    const modalOpens = eventMap['modal_open'] || 0;
    const modalCloses = eventMap['modal_close'] || 0;
    const dismisses = eventMap['dismiss'] || 0;
    const linkClicks = eventMap['link_click'] || 0;
    const registrations = eventMap['registration'] || 0;

    // 2. Unique viewers
    const uniqueViewers = await AdEventLog.aggregate([
      { $match: match },
      { $group: { _id: '$user_key' } },
      { $count: 'unique' },
    ]);
    const uniqueCount = uniqueViewers?.[0]?.unique || 0;

    // 3. Daily breakdown
    const dailyBreakdown = await AdEventLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: '$day_key',
            event: '$event_type',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.day': 1 } },
    ]);

    const dailyMap = {};
    dailyBreakdown.forEach((item) => {
      const day = item._id.day;
      if (!dailyMap[day]) {
        dailyMap[day] = { day, impressions: 0, clicks: 0, modalOpens: 0, dismisses: 0 };
      }
      if (item._id.event === 'impression') dailyMap[day].impressions = item.count;
      if (item._id.event === 'click') dailyMap[day].clicks = item.count;
      if (item._id.event === 'modal_open') dailyMap[day].modalOpens = item.count;
      if (item._id.event === 'dismiss') dailyMap[day].dismisses = item.count;
    });
    const daily = Object.values(dailyMap);

    // 4. Peak hours analysis
    const peakHours = await AdEventLog.aggregate([
      { $match: { ...match, hour_key: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$hour_key',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 5. Link analytics - which links were clicked
    const linkAnalytics = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'link_click', link_destination: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$link_destination',
          clicks: { $sum: 1 },
        },
      },
      { $sort: { clicks: -1 } },
    ]);

    // 6. Average view time
    const avgViewTime = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'modal_close', duration_seconds: { $exists: true } } },
      {
        $group: {
          _id: null,
          avgSeconds: { $avg: '$duration_seconds' },
        },
      },
    ]);
    const averageViewTimeSeconds = avgViewTime?.[0]?.avgSeconds || 0;

    // 7. Audience demographics (candidate departments and programs)
    const logs = await AdEventLog.find(match).select('user_key').limit(100000).lean();
    const candidateIds = logs
      .map((l) => {
        const parts = String(l.user_key || '').split(':');
        return parts[0] === 'candidate' ? parts.slice(1).join(':') : null;
      })
      .filter(Boolean);

    let audienceByDept = [];
    let audienceByProgram = [];
    if (candidateIds.length) {
      const users = await User.find({ cand_id: { $in: candidateIds } })
        .select('department program')
        .lean();
      const byDept = {};
      const byProg = {};
      users.forEach((u) => {
        const d = u.department || 'All Departments';
        const p = String(u.program || 'HND').toUpperCase();
        byDept[d] = (byDept[d] || 0) + 1;
        byProg[p] = (byProg[p] || 0) + 1;
      });
      audienceByDept = Object.keys(byDept)
        .map((k) => ({ department: k, count: byDept[k] }))
        .sort((a, b) => b.count - a.count);
      audienceByProgram = Object.keys(byProg)
        .map((k) => ({ program: k, count: byProg[k] }))
        .sort((a, b) => b.count - a.count);
    }

    // 8. Calculate derived metrics
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const dismissRate = modalOpens > 0 ? (dismisses / modalOpens) * 100 : 0;
    const conversionRate = clicks > 0 ? (registrations / clicks) * 100 : 0;

    return {
      impressions,
      uniqueViewers: uniqueCount,
      clicks,
      linkClicks,
      registrations,
      ctr: parseFloat(ctr.toFixed(2)),
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      modalOpens,
      modalCloses,
      dismissCount: dismisses,
      dismissRate: parseFloat(dismissRate.toFixed(2)),
      averageViewTimeSeconds: parseFloat(averageViewTimeSeconds.toFixed(2)),
      daily,
      peakHours: peakHours.map((h) => ({ hour: h._id, impressions: h.count })),
      linkAnalytics,
      audienceByDept,
      audienceByProgram,
    };
  } catch (error) {
    console.error('[AdAnalyticsService] getAdAnalytics:', error);
    throw error;
  }
}

/**
 * Log an ad event
 */
async function logAdEvent(adId, userId, eventType, eventData = {}) {
  try {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const hourKey = now.getHours();

    const role = String(eventData.role || 'user').toLowerCase();
    const uid = eventData.uid || userId || 'anonymous';
    const userKey = `${role}:${uid}`;

    const log = new (require('../models/AdEventLog'))({
      ad_id: adId,
      user_key: userKey,
      event_type: eventType,
      day_key: dayKey,
      hour_key: hourKey,
      duration_seconds: eventData.duration_seconds || 0,
      link_destination: eventData.link_destination || null,
      source_route: eventData.source_route || null,
      user_agent: eventData.user_agent || null,
      ip_hash: eventData.ip_hash || null,
      metadata: eventData.metadata || {},
    });

    await log.save();
  } catch (error) {
    console.error('[AdAnalyticsService] logAdEvent:', error);
    // Don't throw - this should never block user experience
  }
}

module.exports = {
  getAdAnalytics,
  logAdEvent,
};
