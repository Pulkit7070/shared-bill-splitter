import type { ReactNode } from 'react'

// Paths from Lucide (lucide.dev, ISC license), inlined to avoid an icon dependency.
const ICONS = {
  receipt: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
}

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Full-width message used for loading failures and not-found pages. */
export function StatePanel({
  icon,
  tone,
  title,
  children,
}: {
  icon: keyof typeof ICONS
  tone: 'error' | 'neutral'
  title: string
  children: ReactNode
}) {
  return (
    <div
      className={`state-panel state-panel-${tone}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <span className="state-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  )
}
