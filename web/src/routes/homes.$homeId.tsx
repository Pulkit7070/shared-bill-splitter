import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api, type Balance, type Bill, messageOf, type Share } from '../api'
import { Avatar, Icon, StatePanel } from '../components'
import { formatCents, parseDollars } from '../money'
import { rememberHome } from '../recentHomes'
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
  pendingComponent: Loading,
  errorComponent: LoadError,
  component: HomePage,
})

const paidAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const paidDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function BackLink() {
  return (
    <Link to="/" className="back-link">
      <Icon name="arrowLeft" size={16} />
      Your homes
    </Link>
  )
}

function Loading() {
  return (
    <main className="page" aria-busy="true">
      <p className="sr-only" role="status">
        Loading home...
      </p>
      <div className="skeleton skeleton-title" />
      <div className="stats">
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </main>
  )
}

function LoadError({ error }: { error: unknown }) {
  const router = useRouter()
  const notFound = error instanceof ApiError && error.status === 404

  return (
    <main className="page">
      <BackLink />
      {notFound ? (
        <StatePanel icon="search" tone="neutral" title="Home not found">
          <p>No home has this id. It may be mistyped, or the link may be incomplete.</p>
          <Link to="/" className="btn btn-primary">
            Create or open a home
          </Link>
        </StatePanel>
      ) : (
        <StatePanel icon="alert" tone="error" title="Could not load this home">
          <p>{messageOf(error)}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void router.invalidate()}
          >
            Try again
          </button>
        </StatePanel>
      )}
    </main>
  )
}

function HomePage() {
  const { home, bills, balances } = Route.useLoaderData()
  const memberName = new Map(home.members.map((member) => [member.id, member.name]))
  const outstanding = balances.reduce((total, balance) => total + balance.outstandingCents, 0)
  const paid = bills
    .flatMap((bill) => bill.shares)
    .reduce((total, share) => (share.paidAt ? total + share.amountCents : total), 0)

  useEffect(() => {
    rememberHome({ id: home.id, name: home.name })
  }, [home.id, home.name])

  return (
    <main className="page">
      <BackLink />
      <header className="home-header">
        <h1>{home.name}</h1>
        <CopyLink />
      </header>

      <dl className="stats">
        <div className="stat stat-highlight">
          <dt>Still owed</dt>
          <dd>{formatCents(outstanding)}</dd>
        </div>
        <div className="stat">
          <dt>Paid so far</dt>
          <dd>{formatCents(paid)}</dd>
        </div>
        <div className="stat">
          <dt>Bills</dt>
          <dd>{bills.length}</dd>
        </div>
      </dl>

      <div className="home-layout">
        <aside className="home-side">
          <People homeId={home.id} balances={balances} />
          <AddBill homeId={home.id} memberCount={home.members.length} />
        </aside>

        <section className="home-main" aria-labelledby="bills-heading">
          <h2 id="bills-heading" className="section-title">
            Bills
          </h2>
          {bills.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <Icon name="receipt" size={24} />
              </span>
              <p className="empty-title">No bills yet</p>
              <p>
                {home.members.length === 0
                  ? 'Add the people who share this home, then add your first bill.'
                  : 'Add a bill and it will be split between everyone in the home.'}
              </p>
            </div>
          ) : (
            bills.map((bill) => <BillCard key={bill.id} bill={bill} memberName={memberName} />)
          )}
        </section>
      </div>
    </main>
  )
}

function CopyLink() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the address bar still has the link.
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} size={16} />
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  )
}

/** Members in join order with what each one still owes, plus the form to add a member. */
function People({ homeId, balances }: { homeId: string; balances: Balance[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const add = useAction(async () => {
    await api.addMember(homeId, name)
    setName('')
    await router.invalidate()
  })

  return (
    <section className="card">
      <h2 className="card-title">
        People <span className="count">{balances.length}</span>
      </h2>
      {balances.length === 0 ? (
        <p className="muted">No one yet. Add the people who share this home.</p>
      ) : (
        <ol className="people">
          {balances.map((balance) => (
            <li key={balance.memberId}>
              <Avatar name={balance.name} />
              <span className="grow">{balance.name}</span>
              {balance.outstandingCents === 0 ? (
                <span className="badge badge-paid">Settled</span>
              ) : (
                <span className="owed">
                  <span className="amount">{formatCents(balance.outstandingCents)}</span> owed
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          void add.run()
        }}
      >
        <label className="field">
          <span className="sr-only">Member name</span>
          <input
            placeholder="Add a person"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={add.pending || !name.trim()}>
          {add.pending ? 'Adding...' : 'Add'}
        </button>
      </form>
      {add.error && <p className="form-error">{add.error}</p>}
    </section>
  )
}

function AddBill({ homeId, memberCount }: { homeId: string; memberCount: number }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const totalCents = parseDollars(amount)
  const amountInvalid = amount.trim() !== '' && totalCents === null

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
        className="bill-form"
        onSubmit={(event) => {
          event.preventDefault()
          void add.run()
        }}
      >
        <label className="field">
          <span>Title</span>
          <input
            placeholder="Electricity"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Amount</span>
          <span className="money-input">
            <span aria-hidden="true">$</span>
            <input
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              aria-invalid={amountInvalid}
              onChange={(event) => setAmount(event.target.value)}
            />
          </span>
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={add.pending || memberCount === 0 || !title.trim() || totalCents === null}
        >
          {add.pending ? 'Adding...' : 'Add bill'}
        </button>
      </form>
      <p className="hint">
        {memberCount === 0
          ? 'Add a person first. A bill needs someone to pay it.'
          : `Split evenly between ${memberCount} ${memberCount === 1 ? 'person' : 'people'}. Leftover cents go to whoever joined first.`}
      </p>
      {amountInvalid && (
        <p className="form-error">Enter a positive amount with at most 2 decimals.</p>
      )}
      {add.error && <p className="form-error">{add.error}</p>}
    </section>
  )
}

function BillCard({ bill, memberName }: { bill: Bill; memberName: Map<string, string> }) {
  const paidCount = bill.shares.filter((share) => share.paidAt).length
  const settled = paidCount === bill.shares.length

  return (
    <article className="card bill">
      <header className="bill-header">
        <div>
          <h3>{bill.title}</h3>
          <p className="muted small">
            Split {bill.shares.length} {bill.shares.length === 1 ? 'way' : 'ways'} · {paidCount} of{' '}
            {bill.shares.length} paid
          </p>
        </div>
        <div className="bill-total">
          <span className="amount-lg">{formatCents(bill.totalCents)}</span>
          {settled && <span className="badge badge-paid">Settled</span>}
        </div>
      </header>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${bill.title} payment progress`}
        aria-valuemin={0}
        aria-valuemax={bill.shares.length}
        aria-valuenow={paidCount}
      >
        <span style={{ width: `${(paidCount / bill.shares.length) * 100}%` }} />
      </div>
      <ul className="shares">
        {bill.shares.map((share) => {
          const name = memberName.get(share.memberId) ?? 'Unknown member'
          return (
            <li key={share.id} className="share">
              <Avatar name={name} />
              <span className="grow">{name}</span>
              <span className="amount">{formatCents(share.amountCents)}</span>
              <ShareStatus billId={bill.id} share={share} memberName={name} />
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function ShareStatus({
  billId,
  share,
  memberName,
}: {
  billId: string
  share: Share
  memberName: string
}) {
  const router = useRouter()
  // One key per payment attempt. It survives a failed try whose outcome is unknown, so
  // "Retry" cannot pay twice even if the first request did reach the server.
  const attemptKey = useRef<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (share.paidAt) {
    return (
      <span className="share-action">
        <span className="badge badge-paid">
          <Icon name="check" size={14} />
          Paid
          <time dateTime={share.paidAt} title={paidAtFormat.format(new Date(share.paidAt))}>
            {paidDayFormat.format(new Date(share.paidAt))}
          </time>
        </span>
      </span>
    )
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
      <span className="share-action share-action-pay">
        <button
          type="button"
          className={error ? 'btn btn-warning btn-sm' : 'btn btn-primary btn-sm'}
          onClick={() => void pay()}
          disabled={paying}
        >
          {paying ? 'Paying...' : error ? 'Retry' : 'Pay'}
          <span className="sr-only"> for {memberName}</span>
        </button>
      </span>
      {error && (
        <p className="share-error" role="alert">
          <Icon name="alert" size={16} />
          <span>Payment failed: {error} The share is still unpaid.</span>
        </p>
      )}
    </>
  )
}
