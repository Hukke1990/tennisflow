function BaseIcon({ children, className = 'h-4 w-4', strokeWidth = 1.8, viewBox = '0 0 24 24' }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconCalendar({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </BaseIcon>
  );
}

export function IconCoin({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <ellipse cx="12" cy="6" rx="6" ry="3" />
      <path d="M6 6v6c0 1.66 2.69 3 6 3s6-1.34 6-3V6" />
      <path d="M6 12c0 1.66 2.69 3 6 3s6-1.34 6-3" />
    </BaseIcon>
  );
}

export function IconPin({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </BaseIcon>
  );
}

export function IconArrowRight({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function IconSpark({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </BaseIcon>
  );
}

export function IconTrophy({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a3 3 0 0 0 3 3" />
      <path d="M16 6h3a3 3 0 0 1-3 3" />
      <path d="M12 11v4" />
      <path d="M9 19h6" />
      <path d="M8 21h8" />
    </BaseIcon>
  );
}

export function IconMailbox({ className = 'h-7 w-7' }) {
  return (
    <BaseIcon className={className}>
      <path d="M5 21V9a4 4 0 0 1 4-4h3" />
      <path d="M5 14h8" />
      <path d="M13 5v16" />
      <path d="M13 9h4a2 2 0 0 1 2 2v8h-6" />
      <path d="m16 5 4 3-4 3" />
    </BaseIcon>
  );
}

export function IconClose({ className = 'h-4 w-4' }) {
  return (
    <BaseIcon className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </BaseIcon>
  );
}

export function IconStarFill({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 2.7 14.6 8l5.9.9-4.3 4.2 1 5.9-5.2-2.7-5.3 2.7 1-5.9L3.4 9l5.9-.9L12 2.7z" />
    </svg>
  );
}

export function IconMedal({ className = 'h-5 w-5', tone = 'gold' }) {
  const toneMap = {
    gold: { top: '#f59e0b', bottom: '#d97706', dot: '#fcd34d' },
    silver: { top: '#94a3b8', bottom: '#64748b', dot: '#e2e8f0' },
    bronze: { top: '#b45309', bottom: '#92400e', dot: '#f59e0b' },
  };
  const c = toneMap[tone] || toneMap.gold;

  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 3h3l2 4H9L7 3zm10 0h-3l-2 4h3l2-4z" fill="#3b82f6" />
      <circle cx="12" cy="14" r="6" fill={c.bottom} />
      <circle cx="12" cy="14" r="3" fill={c.dot} />
      <circle cx="12" cy="14" r="5.5" fill="none" stroke={c.top} strokeWidth="1" />
    </svg>
  );
}

export function IconRuler({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M4 17 17 4l3 3L7 20l-3-3z" />
      <path d="M12 6l2 2" />
      <path d="M9 9l2 2" />
      <path d="M6 12l2 2" />
    </BaseIcon>
  );
}

export function IconScale({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M12 4v14" />
      <path d="M7 8h10" />
      <path d="M5 20h14" />
      <path d="m7 8-3 5h6l-3-5z" />
      <path d="m17 8-3 5h6l-3-5z" />
    </BaseIcon>
  );
}

export function IconHand({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M9 11V5a1 1 0 1 1 2 0v5" />
      <path d="M11 10V4a1 1 0 1 1 2 0v6" />
      <path d="M13 11V6a1 1 0 1 1 2 0v7" />
      <path d="M15 12V8a1 1 0 1 1 2 0v7" />
      <path d="M9 11 7.8 9.8a1 1 0 0 0-1.4 1.4l2.2 2.2a6 6 0 0 0 4.2 1.8h1.7a4.5 4.5 0 0 0 4.5-4.5" />
    </BaseIcon>
  );
}

export function IconRacket({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <ellipse cx="10" cy="10" rx="5" ry="7" />
      <path d="M7 7h6" />
      <path d="M6 10h8" />
      <path d="M7 13h6" />
      <path d="m13.5 15.5 5.5 5.5" />
      <path d="m12 17 2-2" />
    </BaseIcon>
  );
}

export function IconTennisBall({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#22c55e" stroke="#15803d" strokeWidth="1.5" />
      <path d="M6.6 6.5a6.8 6.8 0 0 1 0 11" stroke="#ecfeff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17.4 6.5a6.8 6.8 0 0 0 0 11" stroke="#ecfeff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconSingles({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <ellipse cx="8.8" cy="8.8" rx="3.8" ry="5.2" />
      <path d="M6.4 7.2h4.8" />
      <path d="M5.9 9h5.8" />
      <path d="M6.4 10.8h4.8" />
      <path d="m11.9 13.2 4.6 4.6" />
      <path d="m10.5 14.6 1.8-1.8" />
      <circle cx="17.5" cy="6.5" r="1.8" />
    </BaseIcon>
  );
}

export function IconDoubles({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <ellipse cx="8.3" cy="8.8" rx="3.1" ry="4.6" transform="rotate(-24 8.3 8.8)" />
      <ellipse cx="15.7" cy="8.8" rx="3.1" ry="4.6" transform="rotate(24 15.7 8.8)" />
      <path d="m10.7 12.8 3.5 4.6" />
      <path d="m13.3 12.8-3.5 4.6" />
      <circle cx="12" cy="6" r="1.5" />
    </BaseIcon>
  );
}

export function IconLock({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </BaseIcon>
  );
}

export function IconAlertTriangle({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="m12 3 9 16H3l9-16z" />
      <path d="M12 9v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function IconCheckCircle({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.2 2.2 4.8-4.8" />
    </BaseIcon>
  );
}

export function IconXCircle({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </BaseIcon>
  );
}

export function IconUser({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </BaseIcon>
  );
}

export function IconUsers({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="9" cy="8.5" r="2.5" />
      <circle cx="16" cy="9.5" r="2.1" />
      <path d="M4.5 20a5.5 5.5 0 0 1 9 0" />
      <path d="M13.5 20a4.2 4.2 0 0 1 6 0" />
    </BaseIcon>
  );
}

export function IconCourt({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
      <path d="M3 12h18" />
      <path d="M7 7h10" />
      <path d="M7 17h10" />
    </BaseIcon>
  );
}

export function IconSearch({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </BaseIcon>
  );
}

export function IconChartBars({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M4 20V10" />
      <path d="M10 20V6" />
      <path d="M16 20V13" />
      <path d="M22 20V4" />
      <path d="M3 20h20" />
    </BaseIcon>
  );
}

export function IconTag({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function IconSettings({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
    </BaseIcon>
  );
}

export function IconSave({ className = 'h-5 w-5' }) {
  return (
    <BaseIcon className={className}>
      <path d="M5 3h12l2 2v16H5z" />
      <path d="M8 3v6h8V3" />
      <rect x="8" y="14" width="8" height="5" rx="1" />
    </BaseIcon>
  );
}
