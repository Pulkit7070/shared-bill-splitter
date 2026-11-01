import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createBill, createHome } from './helpers'

// These bypass the API and write to D1 directly, to prove the database itself refuses bad data.
function run(sql: string, ...params: unknown[]) {
  return env.DB.prepare(sql)
    .bind(...params)
    .run()
}

describe('named constraints', () => {
  it('members_home_fk: a member must belong to an existing home', async () => {
    await expect(
      run(
        'INSERT INTO members (id, home_id, name, position) VALUES (?, ?, ?, 1)',
        'm',
        'nope',
        'A',
      ),
    ).rejects.toThrow(/FOREIGN KEY/)
  })

  it('members_home_position_unique: two members cannot share a join position', async () => {
    const { homeId } = await createHome(['Asha'])

    await expect(
      run(
        'INSERT INTO members (id, home_id, name, position) VALUES (?, ?, ?, 1)',
        crypto.randomUUID(),
        homeId,
        'Ben',
      ),
    ).rejects.toThrow(/UNIQUE/)
  })

  it('bills_total_positive: a bill total must be above zero', async () => {
    const { homeId } = await createHome([])

    await expect(
      run(
        "INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, 'T', 0, 'now')",
        crypto.randomUUID(),
        homeId,
      ),
    ).rejects.toThrow(/bills_total_positive/)
  })

  it('STRICT: a text amount cannot be stored in an integer column', async () => {
    const { homeId } = await createHome([])

    await expect(
      run(
        "INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, 'T', 'abc', 'now')",
        crypto.randomUUID(),
        homeId,
      ),
    ).rejects.toThrow()
  })

  it('shares_bill_member_unique: a member gets at most one share per bill', async () => {
    const { homeId, members } = await createHome(['Asha'])
    const bill = await createBill(homeId, 100)

    await expect(
      run(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, 1)',
        crypto.randomUUID(),
        bill.body.id,
        members[0]?.id,
      ),
    ).rejects.toThrow(/UNIQUE/)
  })

  it('shares_paid_with_key: a share cannot be paid without an idempotency key', async () => {
    const { homeId } = await createHome(['Asha'])
    const bill = await createBill(homeId, 100)

    await expect(
      run("UPDATE shares SET paid_at = 'now' WHERE bill_id = ?", bill.body.id),
    ).rejects.toThrow(/shares_paid_with_key/)
  })
})
