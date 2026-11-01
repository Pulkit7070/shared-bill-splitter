import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { api } from '../api'
import { useAction } from '../useAction'

export const Route = createFileRoute('/')({
  component: Start,
})

function Start() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [homeId, setHomeId] = useState('')

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
      <h1>Bill Splitter</h1>

      <section className="card">
        <h2>Create a home</h2>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            void create.run()
          }}
        >
          <input
            aria-label="Home name"
            placeholder="Flat 4B"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={create.pending || !name.trim()}>
            {create.pending ? 'Creating...' : 'Create home'}
          </button>
        </form>
        {create.error && <p className="error">{create.error}</p>}
      </section>

      <section className="card">
        <h2>Open a home</h2>
        <form className="row" onSubmit={openHome}>
          <input
            aria-label="Home id"
            placeholder="Home id"
            value={homeId}
            onChange={(event) => setHomeId(event.target.value)}
          />
          <button type="submit" disabled={!homeId.trim()}>
            Open
          </button>
        </form>
      </section>
    </main>
  )
}
