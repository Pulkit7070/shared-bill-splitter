export type Home = { id: string; name: string }
export type Member = { id: string; homeId: string; name: string }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }

/** Columns aliased to the camelCase response shape of a Share. */
export const SHARE_COLUMNS =
  'shares.id AS id, shares.member_id AS memberId, shares.amount_cents AS amountCents, shares.paid_at AS paidAt'
