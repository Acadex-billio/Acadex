import { createCalendarInviteContent } from './calendarInvite';

test('calendar invites include the booking time, duration and reminder', () => {
  const content = createCalendarInviteContent({
    bookingId: 'booking-123',
    topic: 'Algebra lesson',
    scheduledFor: '2026-11-01T12:00:00.000Z',
    durationMinutes: 45,
  });

  expect(content).toContain('UID:acadex-booking-123@acadex');
  expect(content).toContain('DTSTART:20261101T120000Z');
  expect(content).toContain('DTEND:20261101T124500Z');
  expect(content).toContain('TRIGGER:-PT15M');
});

test('calendar invites escape text and reject invalid scheduled dates', () => {
  const content = createCalendarInviteContent({
    bookingId: 'booking-456',
    topic: 'Math, algebra; intro',
    scheduledFor: '2026-11-01T12:00:00.000Z',
    durationMinutes: 60,
  });

  expect(content).toContain('SUMMARY:Acadex video session: Math\\, algebra\\; intro');
  expect(() => createCalendarInviteContent({ scheduledFor: 'invalid' })).toThrow(
    'A valid scheduled date is required to create a calendar invite.'
  );
});
