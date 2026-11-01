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

const TIMEOUT_MS = 10_000

/** status is 0 when the request never got an HTTP answer (offline, timeout). */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }

  /** The request may or may not have reached the server, so retrying with the same key is safe. */
  get outcomeUnknown(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return typeof body.error === 'string' ? body.error : undefined
  }
  return undefined
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  let text: string
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    text = await response.text()
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new ApiError(
      timedOut ? 'The server took too long to answer.' : 'Could not reach the server.',
      0,
    )
  }

  const body = parseJson(text)
  if (!response.ok) {
    throw new ApiError(
      errorMessage(body) ?? `Request failed with status ${response.status}.`,
      response.status,
    )
  }
  if (body === undefined) throw new ApiError('The server sent an unreadable answer.', 0)
  // The API is ours and returns these shapes; checking them again here would add little.
  return body as T
}

const post = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), headers })

export const api = {
  createHome: (name: string) => post<Home>('/api/homes', { name }),
  getHome: (homeId: string) => request<Home & { members: Member[] }>(`/api/homes/${homeId}`),
  addMember: (homeId: string, name: string) =>
    post<Member>(`/api/homes/${homeId}/members`, { name }),
  listBills: (homeId: string) => request<{ bills: Bill[] }>(`/api/homes/${homeId}/bills`),
  addBill: (homeId: string, title: string, totalCents: number) =>
    post<Bill>(`/api/homes/${homeId}/bills`, { title, totalCents }),
  balances: (homeId: string) => request<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`),
  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    post<Share>(`/api/bills/${billId}/shares/${shareId}/pay`, undefined, {
      'Idempotency-Key': idempotencyKey,
    }),
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
