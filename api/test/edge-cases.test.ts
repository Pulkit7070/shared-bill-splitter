import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key?: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: key === undefined ? {} : { 'Idempotency-Key': key },
  })
}

function balances(homeId: string) {
  return call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
}

async function rawPost(path: string, body: string) {
  const response = await exports.default.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
  return { status: response.status, body: await response.json() }
}

async function billWithShares(memberNames: string[], totalCents: number) {
  const { homeId, members } = await createHome(memberNames)
  const bill = await createBill(homeId, totalCents)
  return { homeId, members, bill: bill.body }
}

describe('input validation', () => {
  it.each(['', '   ', 42, null, 'x'.repeat(101)])('rejects the home name %j', async (name) => {
    const res = await call<{ error: string }>('POST', '/api/homes', { body: { name } })

    expect(res.status).toBe(422)
    expect(res.body.error).toEqual(expect.any(String))
  })

  it('trims names before saving them', async () => {
    const res = await call<{ name: string }>('POST', '/api/homes', { body: { name: '  Flat 4B ' } })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Flat 4B')
  })

  it('rejects a blank member name', async () => {
    const { homeId } = await createHome([])

    const res = await call('POST', `/api/homes/${homeId}/members`, { body: { name: ' ' } })

    expect(res.status).toBe(422)
  })

  it.each(['/api/homes', '/api/homes/x/members'])(
    'answers 400 to malformed JSON on %s',
    async (path) => {
      const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Home' } })

      const res = await rawPost(path.replace('x', home.body.id), '{"name": ')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String) })
    },
  )

  it('answers 400 to malformed JSON when creating a bill', async () => {
    const { homeId } = await createHome(['Asha'])

    const res = await rawPost(`/api/homes/${homeId}/bills`, 'not json')

    expect(res.status).toBe(400)
  })

  it.each(['[]', 'null', '"text"'])('answers 422 to the JSON body %s', async (body) => {
    const res = await rawPost('/api/homes', body)

    expect(res.status).toBe(422)
  })

  it.each([Number.MAX_SAFE_INTEGER + 1, 1e21, 0.01, -0, Number.NaN])(
    'rejects the amount %j',
    async (totalCents) => {
      const { homeId } = await createHome(['Asha'])

      const res = await call('POST', `/api/homes/${homeId}/bills`, {
        body: { title: 'Rent', totalCents },
      })

      expect(res.status).toBe(422)
    },
  )

  it('rejects a missing or blank title', async () => {
    const { homeId } = await createHome(['Asha'])

    const missing = await call('POST', `/api/homes/${homeId}/bills`, { body: { totalCents: 100 } })
    const blank = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: '  ', totalCents: 100 },
    })

    expect(missing.status).toBe(422)
    expect(blank.status).toBe(422)
  })

  it('answers unknown routes with a JSON 404', async () => {
    const res = await call('GET', '/api/nope')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String) })
  })
})

describe('splitting', () => {
  it('does not save a bill when the home has no members', async () => {
    const { homeId } = await createHome([])

    const res = await createBill(homeId, 1000)
    const list = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(res.status).toBe(422)
    expect(list.body.bills).toEqual([])
  })

  it('gives zero to the last members when there are fewer cents than members', async () => {
    const { bill } = await billWithShares(['Asha', 'Ben', 'Chitra'], 2)

    expect(bill.shares.map((share) => share.amountCents)).toEqual([1, 1, 0])
  })

  it('splits the largest safe amount exactly', async () => {
    const { bill } = await billWithShares(['Asha', 'Ben', 'Chitra'], Number.MAX_SAFE_INTEGER)

    const sum = bill.shares.reduce((total, share) => total + share.amountCents, 0)
    expect(sum).toBe(Number.MAX_SAFE_INTEGER)
    expect(bill.shares.map((share) => share.amountCents)).toEqual([
      3002399751580331, 3002399751580330, 3002399751580330,
    ])
  })

  it('keeps the join order for many members', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    const { members, bill } = await billWithShares(names, 1005)

    expect(bill.shares.map((share) => share.memberId)).toEqual(members.map((m) => m.id))
    expect(bill.shares.map((share) => share.amountCents)).toEqual([
      84, 84, 84, 84, 84, 84, 84, 84, 84, 83, 83, 83,
    ])
  })

  it('splits only between members of the same home', async () => {
    await createHome(['Other', 'Home'])
    const { members, bill } = await billWithShares(['Asha', 'Ben'], 100)

    expect(bill.shares.map((share) => share.memberId)).toEqual(members.map((m) => m.id))
  })

  it('lists bills with their shares', async () => {
    const { homeId, bill } = await billWithShares(['Asha', 'Ben'], 101)

    const list = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(list.status).toBe(200)
    expect(list.body.bills).toEqual([bill])
  })
})

describe('paying', () => {
  it('treats a blank Idempotency-Key as missing', async () => {
    const { bill } = await billWithShares(['Asha'], 100)

    const res = await pay(bill.id, bill.shares[0]?.id ?? '', '   ')

    expect(res.status).toBe(400)
  })

  it('returns exactly the same body for a repeated key', async () => {
    const { bill } = await billWithShares(['Asha', 'Ben'], 100)
    const shareId = bill.shares[0]?.id ?? ''
    const key = crypto.randomUUID()

    const first = await pay(bill.id, shareId, key)
    const second = await pay(bill.id, shareId, key)

    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
  })

  it('lets exactly one of two concurrent payments with different keys succeed', async () => {
    const { homeId, bill } = await billWithShares(['Asha', 'Ben'], 1000)
    const shareId = bill.shares[0]?.id ?? ''

    const results = await Promise.all([
      pay(bill.id, shareId, crypto.randomUUID()),
      pay(bill.id, shareId, crypto.randomUUID()),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const outstanding = await balances(homeId)
    expect(outstanding.body.balances.map((b) => b.outstandingCents)).toEqual([0, 500])
  })

  it('answers both concurrent retries of the same key with the same payment', async () => {
    const { bill } = await billWithShares(['Asha'], 1000)
    const shareId = bill.shares[0]?.id ?? ''
    const key = crypto.randomUUID()

    const results = await Promise.all([pay(bill.id, shareId, key), pay(bill.id, shareId, key)])

    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(results[0]?.body).toEqual(results[1]?.body)
  })

  it('answers 404 when the share belongs to another bill', async () => {
    const first = await billWithShares(['Asha'], 100)
    const second = await billWithShares(['Ben'], 100)
    const otherShareId = second.bill.shares[0]?.id ?? ''

    const res = await pay(first.bill.id, otherShareId, crypto.randomUUID())

    expect(res.status).toBe(404)
    const outstanding = await balances(second.homeId)
    expect(outstanding.body.balances.map((b) => b.outstandingCents)).toEqual([100])
  })

  it('answers 404 with a JSON error when neither bill nor share exists', async () => {
    const res = await call('POST', '/api/bills/nope/shares/nope/pay', {
      headers: { 'Idempotency-Key': 'k' },
    })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it('still answers 409 for a different key after a successful retry', async () => {
    const { bill } = await billWithShares(['Asha'], 100)
    const shareId = bill.shares[0]?.id ?? ''
    const key = crypto.randomUUID()
    await pay(bill.id, shareId, key)
    await pay(bill.id, shareId, key)

    const res = await pay(bill.id, shareId, crypto.randomUUID())

    expect(res.status).toBe(409)
  })
})

describe('balances', () => {
  it('lists members with nothing owed as zero', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])

    const res = await balances(homeId)

    expect(res.body.balances.map((b) => b.outstandingCents)).toEqual([0, 0])
  })

  it('returns an empty list for a home with no members', async () => {
    const { homeId } = await createHome([])

    const res = await balances(homeId)

    expect(res.status).toBe(200)
    expect(res.body.balances).toEqual([])
  })

  it('reaches zero when every share is paid', async () => {
    const { homeId, bill } = await billWithShares(['Asha', 'Ben', 'Chitra'], 1000)
    for (const share of bill.shares) await pay(bill.id, share.id, crypto.randomUUID())

    const res = await balances(homeId)

    expect(res.body.balances.map((b) => b.outstandingCents)).toEqual([0, 0, 0])
  })
})
