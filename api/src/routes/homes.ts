import { Hono } from 'hono'
import { splitCents } from '../split'
import {
  type Balance,
  type Bill,
  type Home,
  type Member,
  SHARE_COLUMNS,
  type Share,
} from '../types'
import { fail, readJsonObject, requireText, requireTotalCents } from '../validation'

export const homes = new Hono<{ Bindings: Env }>()

async function requireHome(db: D1Database, homeId: string): Promise<Home> {
  const home = await db
    .prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<Home>()
  if (!home) fail(404, 'Home not found')
  return home
}

function listMembers(db: D1Database, homeId: string) {
  return db
    .prepare('SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY position')
    .bind(homeId)
    .all<Member>()
}

homes.post('/', async (c) => {
  const body = await readJsonObject(c)
  const home: Home = { id: crypto.randomUUID(), name: requireText(body.name, 'name') }

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(home.id, home.name, new Date().toISOString())
    .run()

  return c.json(home, 201)
})

homes.get('/:homeId', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const { results: members } = await listMembers(c.env.DB, home.id)
  return c.json({ ...home, members })
})

homes.post('/:homeId/members', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))
  const body = await readJsonObject(c)
  const member: Member = {
    id: crypto.randomUUID(),
    homeId: home.id,
    name: requireText(body.name, 'name'),
  }

  // Computing the next position inside the INSERT keeps it a single atomic statement.
  // The UNIQUE (home_id, position) constraint rejects a duplicate position if that ever fails.
  await db
    .prepare(
      `INSERT INTO members (id, home_id, name, position)
       SELECT ?, ?, ?, COALESCE(MAX(position), 0) + 1 FROM members WHERE home_id = ?`,
    )
    .bind(member.id, home.id, member.name, home.id)
    .run()

  return c.json(member, 201)
})

homes.post('/:homeId/bills', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))
  const body = await readJsonObject(c)
  const title = requireText(body.title, 'title')
  const totalCents = requireTotalCents(body.totalCents)

  const { results: members } = await listMembers(db, home.id)
  if (members.length === 0) fail(422, 'Cannot split a bill in a home with no members')

  const billId = crypto.randomUUID()
  const shares: Share[] = splitCents(totalCents, members).map(({ member, amountCents }) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents,
    paidAt: null,
  }))

  // A D1 batch runs as one transaction: either the bill and all its shares exist, or none do.
  await db.batch([
    db
      .prepare(
        'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(billId, home.id, title, totalCents, new Date().toISOString()),
    ...shares.map((share) =>
      db
        .prepare('INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)')
        .bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ])

  const bill: Bill = { id: billId, homeId: home.id, title, totalCents, shares }
  return c.json(bill, 201)
})

homes.get('/:homeId/bills', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))

  const [billRows, shareRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, home_id AS homeId, title, total_cents AS totalCents
         FROM bills WHERE home_id = ? ORDER BY created_at DESC, id`,
      )
      .bind(home.id)
      .all<Omit<Bill, 'shares'>>(),
    db
      .prepare(
        `SELECT ${SHARE_COLUMNS}, shares.bill_id AS billId
         FROM shares
         JOIN bills ON bills.id = shares.bill_id
         JOIN members ON members.id = shares.member_id
         WHERE bills.home_id = ?
         ORDER BY members.position`,
      )
      .bind(home.id)
      .all<Share & { billId: string }>(),
  ])

  const sharesByBill = new Map<string, Share[]>()
  for (const { billId, ...share } of shareRows.results) {
    const list = sharesByBill.get(billId) ?? []
    list.push(share)
    sharesByBill.set(billId, list)
  }

  const bills: Bill[] = billRows.results.map((bill) => ({
    ...bill,
    shares: sharesByBill.get(bill.id) ?? [],
  }))
  return c.json({ bills })
})

homes.get('/:homeId/balances', async (c) => {
  const db = c.env.DB
  const home = await requireHome(db, c.req.param('homeId'))

  // LEFT JOIN keeps members who owe nothing; COALESCE turns their NULL sum into 0.
  const { results: balances } = await db
    .prepare(
      `SELECT members.id AS memberId, members.name AS name,
              COALESCE(SUM(shares.amount_cents), 0) AS outstandingCents
       FROM members
       LEFT JOIN shares ON shares.member_id = members.id AND shares.paid_at IS NULL
       WHERE members.home_id = ?
       GROUP BY members.id
       ORDER BY members.position`,
    )
    .bind(home.id)
    .all<Balance>()

  return c.json({ balances })
})
