import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { ApiError, api, type Bill, type Member, messageOf, type Share } from '../api'
import { formatCents, parseDollars } from '../money'
import { useAction } from '../useAction'

export const Route = createFileRoute('/homes/$homeId')({
  loader: async ({ params }) => {
    const [home, { bills }, { balances }] = await Promise.all([
      api.getHome(params.homeId),
      api.listBills(params.homeId),
      api.balances(params.homeId),
    ])
    return { home, bills, balances }
  },
  pendingMs: 150,
  pendingComponent: () => (
    <main className="page">
      <p className="muted" role="status">
        Loading home...
      </p>
    </main>
  ),
  errorComponent: LoadError,
  component: HomePage,
})

function LoadError({ error }: { error: unknown }) {
  const router = useRouter()
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <main className="page">
      <Link to="/">Back</Link>
      <div className="card" role="alert">
        <h2>{notFound ? 'Home not found' : 'Could not load this home'}</h2>
        <p className="error">{notFound ? 'Check the home id and try again.' : messageOf(error)}</p>
        {!notFound && (
          <button type="button" onClick={() => void router.invalidate()}>
            Try again
          </button>
        )}
      </div>
    </main>
  )
}

function HomePage() {
  const { home, bills, balances } = Route.useLoaderData()
  const memberName = new Map(home.members.map((member) => [member.id, member.name]))

  return (
    <main className="page">
      <Link to="/">Back</Link>
      <h1>{home.name}</h1>
      <p className="muted">
        Home id: <code>{home.id}</code>
      </p>

      <div className="grid">
        <Members homeId={home.id} members={home.members} />
        <section className="card">
          <h2>Balances</h2>
          {balances.length === 0 ? (
            <p className="muted">No members yet.</p>
          ) : (
            <ul className="list">
              {balances.map((balance) => (
                <li key={balance.memberId}>
                  <span>{balance.name}</span>
                  <span>{formatCents(balance.outstandingCents)} owed</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AddBill homeId={home.id} hasMembers={home.members.length > 0} />

      <section>
        <h2>Bills</h2>
        {bills.length === 0 ? (
          <p className="muted card">No bills yet.</p>
        ) : (
          bills.map((bill) => <BillCard key={bill.id} bill={bill} memberName={memberName} />)
        )}
      </section>
    </main>
  )
}

function Members({ homeId, members }: { homeId: string; members: Member[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const add = useAction(async () => {
    await api.addMember(homeId, name)
    setName('')
    await router.invalidate()
  })

  return (
    <section className="card">
      <h2>Members</h2>
      {members.length === 0 ? (
        <p className="muted">No members yet. Add someone before creating a bill.</p>
      ) : (
        <ol className="list">
          {members.map((member) => (
            <li key={member.id}>{member.name}</li>
          ))}
        </ol>
      )}
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          void add.run()
        }}
      >
        <input
          aria-label="Member name"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={add.pending || !name.trim()}>
          {add.pending ? 'Adding...' : 'Add member'}
        </button>
      </form>
      {add.error && <p className="error">{add.error}</p>}
    </section>
  )
}

function AddBill({ homeId, hasMembers }: { homeId: string; hasMembers: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const totalCents = parseDollars(amount)

  const add = useAction(async () => {
    if (totalCents === null) throw new Error('Enter an amount like 12.50.')
    await api.addBill(homeId, title, totalCents)
    setTitle('')
    setAmount('')
    await router.invalidate()
  })

  return (
    <section className="card">
      <h2>Add a bill</h2>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          void add.run()
        }}
      >
        <input
          aria-label="Bill title"
          placeholder="Electricity"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Amount in dollars"
          placeholder="100.00"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="submit"
          disabled={add.pending || !hasMembers || !title.trim() || totalCents === null}
        >
          {add.pending ? 'Adding...' : 'Add bill'}
        </button>
      </form>
      {!hasMembers && <p className="muted">Add a member first. A bill needs someone to pay it.</p>}
      {amount.trim() && totalCents === null && (
        <p className="error">Enter a positive amount with at most 2 decimals.</p>
      )}
      {add.error && <p className="error">{add.error}</p>}
    </section>
  )
}

function BillCard({ bill, memberName }: { bill: Bill; memberName: Map<string, string> }) {
  return (
    <article className="card">
      <header className="bill-header">
        <h3>{bill.title}</h3>
        <span>{formatCents(bill.totalCents)}</span>
      </header>
      <table>
        <tbody>
          {bill.shares.map((share) => (
            <tr key={share.id}>
              <td>{memberName.get(share.memberId) ?? 'Unknown member'}</td>
              <td>{formatCents(share.amountCents)}</td>
              <td className="pay-cell">
                <ShareStatus billId={bill.id} share={share} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

function ShareStatus({ billId, share }: { billId: string; share: Share }) {
  const router = useRouter()
  // One key per payment attempt. It survives a failed try whose outcome is unknown, so
  // "Retry" cannot pay twice even if the first request did reach the server.
  const attemptKey = useRef<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (share.paidAt) {
    return <span className="paid">Paid {new Date(share.paidAt).toLocaleString()}</span>
  }

  async function pay() {
    if (paying) return
    attemptKey.current ??= crypto.randomUUID()
    setPaying(true)
    setError(null)
    try {
      await api.payShare(billId, share.id, attemptKey.current)
      attemptKey.current = null
      await router.invalidate()
    } catch (err) {
      const unknownOutcome = err instanceof ApiError && err.outcomeUnknown
      if (!unknownOutcome) attemptKey.current = null
      setError(messageOf(err))
      if (err instanceof ApiError && err.status === 409) void router.invalidate()
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => void pay()} disabled={paying}>
        {paying ? 'Paying...' : error ? 'Retry' : 'Pay'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
