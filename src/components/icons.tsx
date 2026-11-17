/**
 * Navigation icons drawn for this app rather than imported from an icon library.
 * They share the logo's rounded 2px line so the menu reads as one family with the
 * brain-and-trend mark, and each glyph shows what its page holds.
 */

export type IconName =
  | 'queue' | 'patient' | 'summary' | 'check' | 'signoff' | 'record' | 'monitoring'
  | 'programme' | 'validation' | 'how' | 'docs'
  | 'chevron' | 'collapse' | 'menu' | 'close' | 'signout' | 'reset' | 'play';

const PATHS: Record<IconName, string[]> = {
  // A list of people waiting: three rows, each with a person dot.
  queue: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  patient: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5'],
  // A clipboard: the prepared summary a clinician reads first.
  summary: ['M9 4h6v3H9z', 'M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16', 'M8.5 12h7', 'M8.5 16h5'],
  // Four tiles, like the sequence task in the check.
  check: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  // A pen over a signature line: the doctor's sign-off.
  signoff: ['M4 20h16', 'M14.5 4.5l5 5L10 19H5v-5z'],
  record: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  // A level line that falls: the same idea as the logo.
  monitoring: ['M3 20h18', 'M4 9l5 0 4 1 3 0 4 6'],
  programme: ['M4 7h16v12H4z', 'M9 7V5h6v2'],
  // Bars with an interval: validation by subgroup.
  validation: ['M5 20V12', 'M12 20V6', 'M19 20v-9', 'M3.5 12h3', 'M10.5 6h3', 'M17.5 11h3'],
  // Connected stages of the workflow.
  how: ['M5 7a2 2 0 1 0 0-.01', 'M19 7a2 2 0 1 0 0-.01', 'M12 18a2 2 0 1 0 0-.01', 'M7 7h10', 'M6 9l5 7', 'M18 9l-5 7'],
  docs: ['M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z', 'M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z'],
  chevron: ['M8 10l4 4 4-4'],
  collapse: ['M15 6l-6 6 6 6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  signout: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
  reset: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v4h4'],
  play: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M10 8.5v7l5.5-3.5z'],
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
