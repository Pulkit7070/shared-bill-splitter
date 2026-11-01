import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Icon } from '../components'

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Icon name="receipt" />
            </span>
            Bill Splitter
          </Link>
        </div>
      </header>
      <Outlet />
    </>
  ),
})
