/**
 * Ad Analytics Service
 * Aggregates event logs and delivery logs into comprehensive performance metrics
 */
const mongoose = require('mongoose');
const AdEventLog = require('../models/AdEventLog');
const AdDeliveryLog = require('../models/AdDeliveryLog');
const User = require('../models/User');
const Ad = require('../models/Ad');

/**
 * Get comprehensive performance analytics for an ad
 */
async function getAdAnalytics(adId, dateRange = null) {
  try {
    // Ensure ad_id is matched as an ObjectId to existing event documents
    let adObjectId = adId;
    try {
      adObjectId = new mongoose.Types.ObjectId(String(adId));
    } catch (err) {
      // fall back to original value if conversion fails
    }
    const match = { ad_id: adObjectId };
    
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
    // Count both 'click' and 'link_click' towards total clicks (primary + secondary)
    const clicks = (eventMap['click'] || 0) + (eventMap['link_click'] || 0);
    const modalOpens = eventMap['modal_open'] || 0;
    const modalCloses = eventMap['modal_close'] || 0;
    const dismisses = eventMap['dismiss'] || 0;
    const linkClicks = eventMap['link_click'] || 0;
    const registrationEvents = eventMap['registration'] || 0;

    // 2. Unique viewers based on impression events
    const uniqueViewersResult = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'impression' } },
      { $group: { _id: '$user_key' } },
      { $count: 'unique' },
    ]);
    const uniqueCount = uniqueViewersResult?.[0]?.unique || 0;
    // If no unique viewers found in event logs, fallback to AdDeliveryLog (legacy tracking)
    let uniqueCountFallback = 0;
    if (uniqueCount === 0) {
      try {
        const agg = await AdDeliveryLog.aggregate([
          { $match: { ad_id: adObjectId, impressions: { $gt: 0 } } },
          { $group: { _id: '$user_key' } },
          { $count: 'unique' },
        ]);
        uniqueCountFallback = agg?.[0]?.unique || 0;
      } catch (e) {
        // ignore fallback errors
      }
    }

    // If there are no events in AdEventLog, fall back to legacy AdDeliveryLog for impressions/clicks/daily
    let deliveryImpressions = 0;
    let deliveryClicks = 0;
    let deliveryDaily = [];
    if (impressions === 0 && typeof adObjectId !== 'undefined') {
      try {
        const dlAgg = await AdDeliveryLog.aggregate([
          { $match: { ad_id: adObjectId } },
          { $group: { _id: '$day_key', impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } },
          { $sort: { _id: 1 } },
        ]);
        deliveryDaily = dlAgg.map((d) => ({ day: d._id, impressions: d.impressions, clicks: d.clicks }));
        deliveryImpressions = deliveryDaily.reduce((s, d) => s + (d.impressions || 0), 0);
        deliveryClicks = deliveryDaily.reduce((s, d) => s + (d.clicks || 0), 0);
      } catch (e) {
        // ignore
      }
    }

    // 3. Unique registrations
    const uniqueRegistrationsResult = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'registration' } },
      { $group: { _id: '$user_key' } },
      { $count: 'unique' },
    ]);
    const distinctRegistrations = uniqueRegistrationsResult?.[0]?.unique || 0;

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
    // If no daily data from event logs, use delivery daily
    const finalDaily = daily.length > 0 ? daily : deliveryDaily;

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
    // Prefer average view time for modal_close events where an action was taken (metadata.actionTaken = true).
    const avgViewTimeAction = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'modal_close', duration_seconds: { $exists: true }, 'metadata.actionTaken': true } },
      { $group: { _id: null, avgSeconds: { $avg: '$duration_seconds' } } },
    ]);
    const avgViewTimeAny = await AdEventLog.aggregate([
      { $match: { ...match, event_type: 'modal_close', duration_seconds: { $exists: true } } },
      { $group: { _id: null, avgSeconds: { $avg: '$duration_seconds' } } },
    ]);
    const averageViewTimeSeconds = avgViewTimeAction?.[0]?.avgSeconds ?? avgViewTimeAny?.[0]?.avgSeconds ?? 0;

    // 7. Audience demographics (candidate departments and programs)
    const impressionLogs = await AdEventLog.find({ ...match, event_type: 'impression' })
      .select('user_key')
      .limit(100000)
      .lean();
    const uniqueCandidateKeys = Array.from(
      new Set(
        impressionLogs
          .map((l) => String(l.user_key || ''))
          .filter((key) => key.startsWith('candidate:'))
      )
    );
    const candidateIds = uniqueCandidateKeys
      .map((key) => key.split(':').slice(1).join(':'))
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
    const finalImpressions = impressions || deliveryImpressions;
    const finalClicks = clicks || deliveryClicks;
    const ctr = finalImpressions > 0 ? (finalClicks / finalImpressions) * 100 : 0;
    const dismissRate = modalOpens > 0 ? (dismisses / modalOpens) * 100 : 0;
    const conversionRate = clicks > 0 ? (distinctRegistrations / clicks) * 100 : 0;
    const peakImpression = daily.length > 0 ? Math.max(...daily.map((d) => d.impressions || 0)) : 0;

    return {
      impressions: finalImpressions,
      uniqueViewers: Math.max(uniqueCount || 0, uniqueCountFallback || 0),
      clicks: finalClicks,
      linkClicks,
      registrations: distinctRegistrations,
      registrationEvents,
      ctr: parseFloat(ctr.toFixed(2)),
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      modalOpens,
      modalCloses,
      dismissCount: dismisses,
      dismissRate: parseFloat(dismissRate.toFixed(2)),
      averageViewTimeSeconds: parseFloat(averageViewTimeSeconds.toFixed(2)),
      daily: finalDaily,
      peakImpression,
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

    const saved = await log.save();
    // helpful debug log when running locally
    try { console.debug('[AdAnalyticsService] logAdEvent saved', { ad: String(adId), event: eventType, user_key: userKey, id: saved._id }); } catch (e) {}
  } catch (error) {
    console.error('[AdAnalyticsService] logAdEvent:', error);
    // Don't throw - this should never block user experience
  }
}

module.exports = {
  getAdAnalytics,
  logAdEvent,
};
