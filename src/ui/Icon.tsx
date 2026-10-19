const paths = {
  open: 'M3 6h6l2 2h10v11H3z M3 6v13',
  save: 'M5 3h12l4 4v14H3V3h2z M7 3v6h9V3 M7 21v-7h10v7',
  export: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  undo: 'M9 7L4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 7l5 5-5 5 M20 12H9a5 5 0 0 0 0 10h3',
  transform: 'M4 4h6 M4 4v6 M20 4h-6 M20 4v6 M4 20h6 M4 20v-6 M20 20h-6 M20 20v-6 M8 8h8v8H8z',
  cursor: 'M5 3l14 8-6 2-2 6z',
  zoomIn: 'M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M15 15l6 6 M10 7v6 M7 10h6',
  zoomOut: 'M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M15 15l6 6 M7 10h6',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17v.5',
  language: 'M4 5h10 M9 3v2 M6 5c1 4 4 7 8 8 M12 5c-1 4-4 7-8 8 M13 21l4-10 4 10 M14.5 18h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.6 M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 7.5-2',
  folder: 'M3 6h6l2 2h10v11H3z',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  group: 'M3 6h6l2 2h10v11H3z M12 11v6 M9 14h6',
  ungroup: 'M3 6h6l2 2h10v11H3z M9 14h6',
  duplicate: 'M8 8h12v12H8z M4 16V4h12',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12 M18 6L6 18',
  clip: 'M7 4v10a5 5 0 0 0 10 0V7 M10 4v10a2 2 0 0 0 4 0V7',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v6 M12 7.5V8',
  error: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M9 9l6 6 M15 9l-6 6',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
