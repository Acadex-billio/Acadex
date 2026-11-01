const escapeIcsText = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\n|\r/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const formatIcsDate = (value) => new Date(value)
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}/, '');

export const createCalendarInviteContent = ({ bookingId, topic, scheduledFor, durationMinutes }) => {
  const startsAt = new Date(scheduledFor);
  if (!Number.isFinite(startsAt.getTime())) {
    throw new Error('A valid scheduled date is required to create a calendar invite.');
  }

  const parsedDuration = Number(durationMinutes || 60);
  const duration = Number.isFinite(parsedDuration) ? Math.max(15, parsedDuration) : 60;
  const endsAt = new Date(startsAt.getTime() + (duration * 60 * 1000));
  const uid = `acadex-${escapeIcsText(bookingId)}@acadex`;
  const summary = escapeIcsText(`Acadex video session: ${topic || 'Tutorship'}`);
  const description = escapeIcsText('Open Acadex and go to Tutorship Bookings to join the in-app video session.');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Acadex//Video Session//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'LOCATION:Acadex',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Acadex video session starts in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
};

export const downloadCalendarInvite = (booking) => {
  const content = createCalendarInviteContent({
    bookingId: booking.id,
    topic: booking.topic,
    scheduledFor: booking.scheduled_for,
    durationMinutes: booking.duration_minutes,
  });
  const file = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `acadex-session-${String(booking.id || 'booking').replace(/[^a-zA-Z0-9_-]/g, '')}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
