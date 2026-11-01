import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api } from '../api'
import { loadRecentHomes } from '../recentHomes'
import { useAction } from '../useAction'

export const Route = createFileRoute('/')({
  component: Start,
})

function Start() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [homeId, setHomeId] = useState('')
  const [recentHomes] = useState(loadRecentHomes)

  const create = useAction(async () => {
    const home = await api.createHome(name)
    await navigate({ to: '/homes/$homeId', params: { homeId: home.id } })
  })

  function openHome(event: FormEvent) {
    event.preventDefault()
    const id = homeId.trim()
    if (id) void navigate({ to: '/homes/$homeId', params: { homeId: id } })
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>Split shared bills, fairly to the cent.</h1>
        <p className="lead">
          Create a home, add the people who live there, and every bill is split between them. Each
          person pays their own share.
        </p>
      </section>

      <div className="start-grid">
        <section className="card">
          <h2>Create a home</h2>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              void create.run()
            }}
          >
            <label className="field">
              <span>Home name</span>
              <input
                placeholder="Flat 4B"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.pending || !name.trim()}
            >
              {create.pending ? 'Creating...' : 'Create home'}
            </button>
          </form>
          {create.error && <p className="form-error">{create.error}</p>}
        </section>

        <section className="card">
          <h2>Open a home</h2>
          <form className="stack" onSubmit={openHome}>
            <label className="field">
              <span>Home id</span>
              <input
                placeholder="Paste a home id"
                value={homeId}
                onChange={(event) => setHomeId(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-secondary" disabled={!homeId.trim()}>
              Open
            </button>
          </form>
          {recentHomes.length > 0 && (
            <div className="recent">
              <h3>Recently opened</h3>
              <ul>
                {recentHomes.map((home) => (
                  <li key={home.id}>
                    <Link to="/homes/$homeId" params={{ homeId: home.id }}>
                      {home.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="steps" aria-labelledby="steps-heading">
        <h2 id="steps-heading">How it works</h2>
        <ol>
          <li>
            <strong>Create a home</strong>
            <span>Give it a name and share the link with everyone who lives there.</span>
          </li>
          <li>
            <strong>Add people and bills</strong>
            <span>Each bill is split evenly. Leftover cents go to whoever joined first.</span>
          </li>
          <li>
            <strong>Everyone pays their share</strong>
            <span>See who has paid and who still owes, per bill and in total.</span>
          </li>
        </ol>
      </section>
    </main>
  )
}
