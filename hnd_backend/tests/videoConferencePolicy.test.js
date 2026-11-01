'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EARLY_JOIN_GRACE_MINUTES, getMeetingTimeline } = require('../services/videoConferencePolicy');

const scheduledFor = new Date('2026-11-01T12:00:00.000Z');
const booking = { scheduled_for: scheduledFor, duration_minutes: 60 };

test('opens conference access exactly five minutes before the booking', () => {
  const opensAt = new Date(scheduledFor.getTime() - (EARLY_JOIN_GRACE_MINUTES * 60 * 1000));
  const before = getMeetingTimeline(booking, new Date(opensAt.getTime() - 1));
  const at = getMeetingTimeline(booking, opensAt);

  assert.equal(before.hasOpened, false);
  assert.equal(at.hasOpened, true);
  assert.equal(at.hasEnded, false);
});

test('keeps the original booking end time when the lecturer starts early', () => {
  const earlyStart = new Date(scheduledFor.getTime() - (4 * 60 * 1000));
  const timeline = getMeetingTimeline(booking, earlyStart);

  assert.equal(timeline.hasStarted, false);
  assert.equal(timeline.hasOpened, true);
  assert.equal(timeline.end.getTime(), scheduledFor.getTime() + (60 * 60 * 1000));
  assert.equal(timeline.remainingMinutes, 60);
});

test('closes the conference at the scheduled end boundary', () => {
  const end = new Date(scheduledFor.getTime() + (60 * 60 * 1000));
  const timeline = getMeetingTimeline(booking, end);

  assert.equal(timeline.hasEnded, true);
  assert.equal(timeline.remainingMinutes, 0);
});
