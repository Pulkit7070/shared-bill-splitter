import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/split'

const amounts = (total: number, count: number) =>
  splitCents(
    total,
    Array.from({ length: count }, (_, i) => i),
  ).map((s) => s.amountCents)

describe('splitCents', () => {
  it('gives leftover cents to the first members', () => {
    expect(amounts(1000, 3)).toEqual([334, 333, 333])
    expect(amounts(1001, 3)).toEqual([334, 334, 333])
  })

  it('keeps each member paired with their amount', () => {
    expect(splitCents(5, ['a', 'b'])).toEqual([
      { member: 'a', amountCents: 3 },
      { member: 'b', amountCents: 2 },
    ])
  })

  it('always sums to the total', () => {
    for (let total = 1; total <= 200; total++) {
      for (let count = 1; count <= 9; count++) {
        const parts = amounts(total, count)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('refuses to split between zero members', () => {
    expect(() => splitCents(100, [])).toThrow(RangeError)
  })
})
