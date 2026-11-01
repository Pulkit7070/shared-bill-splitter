import type { ReactNode } from 'react'

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Full-width message used for loading failures and not-found pages. */
export function StatePanel({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'neutral'
  title: string
  children: ReactNode
}) {
  return (
    <div
      className={`state-panel state-panel-${tone}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h2>{title}</h2>
      {children}
    </div>
  )
}
