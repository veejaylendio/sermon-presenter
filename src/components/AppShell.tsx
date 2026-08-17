import Link from 'next/link'
import type { ReactNode } from 'react'
import { getInitials } from '@/utils/formatName'
import { BookIcon, SwatchIcon, GearIcon } from '@/components/icons'

export type ShellSection = 'sermons' | 'themes' | 'settings'

const NAV_ITEMS: { key: ShellSection; href: string; label: string; Icon: typeof BookIcon }[] = [
  { key: 'sermons', href: '/sermons', label: 'Sermons', Icon: BookIcon },
  { key: 'themes', href: '/themes', label: 'Themes', Icon: SwatchIcon },
  { key: 'settings', href: '/settings', label: 'Settings', Icon: GearIcon },
]

interface AppShellProps {
  active: ShellSection
  displayName: string
  title: string
  children: ReactNode
}

export default function AppShell({ active, displayName, title, children }: AppShellProps) {
  return (
    <div className="shell-root">
      <aside className="shell-rail">
        <Link href="/sermons" className="shell-rail-mark" aria-label="SermonPresenter">
          <BookIcon size={16} />
        </Link>

        {NAV_ITEMS.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            className={`shell-rail-icon${active === key ? ' is-active' : ''}`}
            title={label}
            aria-label={label}
            aria-current={active === key ? 'page' : undefined}
          >
            <Icon size={18} />
          </Link>
        ))}

        <div className="shell-rail-spacer" />
        <div className="shell-rail-avatar" title={displayName}>
          {getInitials(displayName)}
        </div>
      </aside>

      <div className="shell-main">
        <div className="shell-topbar">
          <span className="shell-brand">SermonPresenter</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {displayName}
          </span>
        </div>

        <main className="shell-content">
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '1.75rem' }}>
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  )
}
