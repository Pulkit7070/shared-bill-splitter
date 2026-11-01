/**
 * Splits totalCents across members so the amounts always add up to totalCents.
 * Leftover cents go one each to the first members, in the order given.
 * Example: 1000 cents across 3 members gives 334, 333, 333.
 */
export function splitCents<T>(
  totalCents: number,
  members: readonly T[],
): { member: T; amountCents: number }[] {
  if (members.length === 0) throw new RangeError('Cannot split between zero members')

  const remainder = totalCents % members.length
  // Subtracting first keeps this exact integer division, even near Number.MAX_SAFE_INTEGER.
  const base = (totalCents - remainder) / members.length

  return members.map((member, index) => ({
    member,
    amountCents: index < remainder ? base + 1 : base,
  }))
}
