'use strict';

const EARLY_JOIN_GRACE_MINUTES = 5;

function getMeetingTimeline(bookingLike, now = new Date()) {
  const start = new Date(bookingLike?.scheduled_for || 0);
  const durationMinutes = Math.max(15, Number(bookingLike?.duration_minutes || 60));
  const end = new Date(start.getTime() + (durationMinutes * 60 * 1000));
  const opensAt = new Date(start.getTime() - (EARLY_JOIN_GRACE_MINUTES * 60 * 1000));
  const hasStarted = now.getTime() >= start.getTime();
  const hasOpened = now.getTime() >= opensAt.getTime();
  const hasEnded = now.getTime() >= end.getTime();
  const elapsedMinutes = hasStarted
    ? Math.min(durationMinutes, Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000)))
    : 0;
  const remainingMinutes = hasStarted
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 60000))
    : durationMinutes;

  return {
    start,
    opensAt,
    end,
    durationMinutes,
    now,
    hasStarted,
    hasOpened,
    hasEnded,
    elapsedMinutes,
    remainingMinutes,
  };
}

module.exports = { EARLY_JOIN_GRACE_MINUTES, getMeetingTimeline };
