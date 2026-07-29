const ICONS = {
  home: (
    <>
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-7h5v7" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.8-4" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.8 4" />
      <path d="M20 20v-5h-5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h12" />
      <path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
      <circle cx="16" cy="13.5" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-9" />
      <path d="M15 6h6v6" />
    </>
  ),
  investments: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5c-.8-.7-1.9-1-3.1-1-1.8 0-3.2.9-3.2 2.3 0 3.3 6.4 1.7 6.4 5 0 1.5-1.4 2.7-3.5 2.7-1.3 0-2.6-.4-3.6-1.2" />
      <path d="M12 5.5v13" />
    </>
  ),
  debt: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 9h10M7 13h6" />
      <path d="M16 16.5h3.5M17.75 14.75v3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  bank: (
    <>
      <path d="m3 9 9-5 9 5" />
      <path d="M5 10h14M6 10v7M10 10v7M14 10v7M18 10v7M4 17h16M3 20h18" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="m7 15 4-5 3 2 5-6" />
    </>
  ),
  patrimony: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 15h2v2H7zM11 11h2v6h-2zM15 8h2v9h-2z" />
    </>
  ),
  export: (
    <>
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5" />
      <path d="M3 9h11" />
      <path d="m10 5 4 4-4 4" />
    </>
  ),
  transactions: (
    <>
      <path d="M4 7h14" />
      <path d="m15 4 3 3-3 3" />
      <path d="M20 17H6" />
      <path d="m9 14-3 3 3 3" />
    </>
  ),
  future: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  accounts: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M7 14h4" />
    </>
  ),
  categories: (
    <>
      <path d="M20 13 13 20 4 11V4h7l9 9Z" />
      <circle cx="8" cy="8" r="1.2" />
    </>
  ),
  integrations: (
    <>
      <path d="M8 12a4 4 0 0 1 4-4h3" />
      <path d="M16 5h3v3" />
      <path d="M16 12a4 4 0 0 1-4 4H9" />
      <path d="M8 19H5v-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3.2 7.7C2.7 8.3 2.5 8.8 2.5 8.8S6 15 12 15c1.1 0 2.1-.2 3-.5" />
      <path d="M9.2 4.3c.9-.2 1.8-.3 2.8-.3 6 0 9.5 6 9.5 6s-.9 1.6-2.6 3" />
      <path d="m3 3 18 18" />
      <path d="M10.2 10.2a2.8 2.8 0 0 0 3.6 3.6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
      <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      <path d="m5 14 1 2.8 2.8 1L6 18.8 5 22l-1-3.2-3-1 3-1L5 14Z" />
    </>
  ),
  arrow: <path d="m9 18 6-6-6-6" />,
}

export default function AppIcon({ name, size = 20, className = '' }) {
  const icon = ICONS[name] ?? ICONS.more

  return (
    <svg
      aria-hidden="true"
      className={`app-icon ${className}`.trim()}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {icon}
    </svg>
  )
}
