/**
 * Calendar export as an iCalendar (.ics) file, which Google Calendar, Outlook and
 * Apple Calendar all import. Events carry only the pseudonymous case ID and the
 * task type: no name, diagnosis or clinical detail leaves the app in a calendar.
 */

export interface CalendarTask {
  uid: string;
  caseId: string;
  title: string;
  due: string;
}

const crlf = '\r\n';
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compactDate = (d: string) => d.replace(/-/g, '');

/** Lines longer than 75 octets are folded, as RFC 5545 requires. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join(`${crlf} `);
}

export function buildIcs(tasks: CalendarTask[], stamp: Date): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dhakira prototype//Follow-up export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const task of tasks) {
    const start = compactDate(task.due);
    const next = new Date(`${task.due}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.uid}@dhakira.prototype`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${compactDate(next.toISOString().slice(0, 10))}`,
      `SUMMARY:${escapeText(`${task.title} (${task.caseId})`)}`,
      `DESCRIPTION:${escapeText('Open this patient in Dhakira for details. No clinical information is stored in this calendar entry.')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(crlf) + crlf;
}
