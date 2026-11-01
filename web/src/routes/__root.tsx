import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            Bill Splitter
          </Link>
        </div>
      </header>
      <Outlet />
    </>
  ),
})
