import { Hono } from 'hono'
import { SHARE_COLUMNS, type Share } from '../types'
import { fail } from '../validation'

export const bills = new Hono<{ Bindings: Env }>()

const MAX_KEY_LENGTH = 200

bills.post('/:billId/shares/:shareId/pay', async (c) => {
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) fail(400, 'Idempotency-Key header is required')
  if (key.length > MAX_KEY_LENGTH) {
    fail(400, `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`)
  }

  const db = c.env.DB
  const { billId, shareId } = c.req.param()

  // The UPDATE only matches an unpaid share, and SQLite runs writes one at a time, so when
  // two requests race exactly one of them flips paid_at. The SELECT then reads whichever key
  // won. paid_at and idempotency_key never change after that, so the answer is stable.
  const [, selected] = await db.batch<Share & { idempotencyKey: string | null }>([
    db
      .prepare(
        `UPDATE shares SET paid_at = ?, idempotency_key = ?
         WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
      )
      .bind(new Date().toISOString(), key, shareId, billId),
    db
      .prepare(
        `SELECT ${SHARE_COLUMNS}, shares.idempotency_key AS idempotencyKey
         FROM shares WHERE id = ? AND bill_id = ?`,
      )
      .bind(shareId, billId),
  ])

  const row = selected?.results[0]
  if (!row) {
    const bill = await db.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()
    fail(404, bill ? 'Share not found in this bill' : 'Bill not found')
  }

  const { idempotencyKey, ...share } = row
  if (idempotencyKey !== key) fail(409, 'Share is already paid')
  return c.json(share, 200)
})
