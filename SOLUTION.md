# Solution notes

These notes explain how the bill splitter works and why it is built this way. Read them next to
the code. Every claim here points at a file or a test you can open.

## 1. Architecture

```
Browser (React + TanStack Router, :5173)
   |  fetch /api/...   (Vite proxies /api to :8787 in dev)
   v
Hono app on a Cloudflare Worker (:8787)
   |  prepared SQL statements, D1 batch
   v
Cloudflare D1 (SQLite), binding DB
```

API files:

| File                           | What it does                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `api/src/index.ts`             | Creates the Hono app, mounts the routers, turns every error into `{ "error": "..." }`. |
| `api/src/routes/homes.ts`      | Create home, get home, add member, create bill, list bills, balances.                  |
| `api/src/routes/bills.ts`      | Pay a share.                                                                           |
| `api/src/split.ts`             | The pure split function. No database, easy to test.                                    |
| `api/src/validation.ts`        | Reads the JSON body and checks names, titles and amounts.                              |
| `api/src/types.ts`             | Response types shared by the routes.                                                   |
| `api/migrations/0001_init.sql` | The schema.                                                                            |

Web files:

| File                               | What it does                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `web/src/api.ts`                   | Typed fetch wrapper: timeout, JSON parsing, `ApiError`.                               |
| `web/src/routes/index.tsx`         | Start page: create a home or open one by id.                                          |
| `web/src/routes/homes.$homeId.tsx` | The main page: members, balances, add bill, bills with pay buttons.                   |
| `web/src/useAction.ts`             | Small hook for "run an async action, track pending and error".                        |
| `web/src/money.ts`                 | Format cents as dollars, parse a dollar string into cents without floats.             |
| `web/src/components.tsx`           | Inline SVG icons, member avatar, and the panel used for error and not-found states.   |
| `web/src/recentHomes.ts`           | Remembers the last 5 opened homes in `localStorage`, so nobody has to keep a home id. |

Data flow for paying a share: the button calls `api.payShare` with an Idempotency-Key, the Worker
runs one D1 batch (UPDATE then SELECT), returns the share, and the page calls
`router.invalidate()` so the route loader fetches fresh bills and balances.

## 2. Schema and named constraints

All tables are `STRICT`. In a normal SQLite table you can put the text `'abc'` in an INTEGER
column. STRICT makes SQLite reject it, so money columns can only hold integers.

| Constraint                     | Type        | What it stops                                                                                                                                 |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `homes_name_not_blank`         | CHECK       | A home whose name is empty or only spaces.                                                                                                    |
| `members_home_fk`              | FOREIGN KEY | A member that points at a home that does not exist.                                                                                           |
| `members_home_position_unique` | UNIQUE      | Two members in one home with the same join position. Without it the split order could be ambiguous.                                           |
| `members_name_not_blank`       | CHECK       | A blank member name.                                                                                                                          |
| `bills_home_fk`                | FOREIGN KEY | A bill for a home that does not exist.                                                                                                        |
| `bills_total_positive`         | CHECK       | A bill of 0 or a negative amount.                                                                                                             |
| `bills_title_not_blank`        | CHECK       | A blank bill title.                                                                                                                           |
| `shares_bill_fk`               | FOREIGN KEY | A share for a bill that does not exist.                                                                                                       |
| `shares_member_fk`             | FOREIGN KEY | A share for a member that does not exist.                                                                                                     |
| `shares_bill_member_unique`    | UNIQUE      | Two shares for the same member on the same bill (charging someone twice).                                                                     |
| `shares_amount_not_negative`   | CHECK       | A negative share. Zero is allowed: 2 cents across 3 members is 1, 1, 0.                                                                       |
| `shares_paid_with_key`         | CHECK       | A share marked paid without the key that paid it, or a key without a payment. `paid_at` and `idempotency_key` are set together or not at all. |

The API validates input before it reaches the database, so in normal use these constraints never
fire. They are the last line of defence against a bug in the code or a manual SQL write.
`api/test/schema.test.ts` writes bad rows straight into D1 and checks that the database refuses
them.

The index `bills_home_created_idx` makes "bills of this home, newest first" fast.

## 3. The split algorithm

File: `api/src/split.ts`.

```
remainder = totalCents % memberCount
base      = (totalCents - remainder) / memberCount
member i gets base + 1 if i < remainder, otherwise base
```

Example: 1000 cents, 3 members. `remainder = 1000 % 3 = 1`, `base = (1000 - 1) / 3 = 333`.
Member 0 gets 334, members 1 and 2 get 333. Total 1000.

Why it always adds up: `base * count + remainder = totalCents` by the definition of division,
and exactly `remainder` members get one extra cent.

Why subtract first: `(total - remainder) / count` divides a number that is an exact multiple of
`count`, so the result is an exact integer even for very large totals. `Math.floor(total / count)`
can round the wrong way near `Number.MAX_SAFE_INTEGER` because of floating point.

Members are read `ORDER BY position`, so "first members" means "first to join".

The bill row and all share rows are inserted in one `db.batch([...])`. D1 runs a batch as one
transaction, so a failure leaves no half-created bill.

## 4. Idempotency and concurrency

File: `api/src/routes/bills.ts`.

Steps for `POST /api/bills/:billId/shares/:shareId/pay`:

1. No `Idempotency-Key` header, or only spaces: `400`.
2. Run this batch:

   ```sql
   UPDATE shares SET paid_at = ?, idempotency_key = ?
   WHERE id = ? AND bill_id = ? AND paid_at IS NULL;

   SELECT ... , idempotency_key FROM shares WHERE id = ? AND bill_id = ?;
   ```
3. No row from the SELECT: the share does not exist in this bill. Check whether the bill exists
   to choose the message, then `404`.
4. Stored key equals the request key: `200` with the stored share.
5. Stored key is different: `409`.

The statement that makes it safe is the UPDATE with `AND paid_at IS NULL`. SQLite (and so D1)
executes write statements one at a time. When two payments race, the first UPDATE flips
`paid_at` from NULL to a time. The second UPDATE then finds no row where `paid_at IS NULL`, so it
changes nothing. Both requests then read the row and see the first key. The first request gets
200, the second gets 409 (different key) or 200 with the same body (same key, a retry).

Why not "SELECT, check in code, then UPDATE": both requests could run the SELECT before either
UPDATE, both see "unpaid", and both pay. Moving the check into the WHERE clause of the write
removes that gap.

After a share is paid, `paid_at` and `idempotency_key` never change again, because every later
UPDATE fails the `paid_at IS NULL` test. That is why the same key always gets an identical answer,
including the original `paidAt`.

`AND bill_id = ?` in both statements means a share from another bill is treated as not found. It
cannot be paid through the wrong bill.

Proof that the guard matters: if you delete `AND paid_at IS NULL`, six tests fail, including both
concurrency tests. I ran this mutation to check.

## 5. Error handling map

All errors are `{ "error": "message" }`. Thrown `HTTPException`s are turned into JSON by
`app.onError`. Anything else is logged and returned as a generic 500, so internal details never
leak. Unknown routes go through `app.notFound`.

| Situation                                                                                | Status |
| ---------------------------------------------------------------------------------------- | ------ |
| Body is not valid JSON                                                                   | 400    |
| Missing or blank `Idempotency-Key`                                                       | 400    |
| Body is JSON but not an object (`[]`, `null`, `"text"`)                                  | 422    |
| Name or title missing, not a string, blank, or longer than 100 characters                | 422    |
| `totalCents` not a number, not an integer, 0 or less, or above `Number.MAX_SAFE_INTEGER` | 422    |
| Bill for a home with no members                                                          | 422    |
| Home, bill or share not found, or share not in that bill                                 | 404    |
| Share already paid with a different key                                                  | 409    |
| Unknown route                                                                            | 404    |
| Unexpected error                                                                         | 500    |

Order of checks: the home in the URL is looked up before the body is validated, so a request to
a missing home is 404 even if its body is also wrong.

## 6. Web state handling

- **Loading.** The route loader fetches home, bills and balances in parallel. If it takes longer
  than 150 ms the `pendingComponent` shows a skeleton of the page (grey blocks in the shape of the
  real content) plus a screen-reader-only "Loading home..." message.
- **Error.** If any of the three requests fails, the `errorComponent` shows the message and a
  "Try again" button that re-runs the loader. A 404 shows "Home not found" with a link back to
  the start page instead of a pointless retry.
- **Empty.** "No members yet" and "No bills yet" messages. The "Add bill" button is disabled with
  a hint while the home has no members.
- **Slow API.** Every request uses `AbortSignal.timeout(10000)`. A timeout becomes an `ApiError`
  with "The server took too long to answer."
- **500 or non-JSON answers.** `request()` reads the body as text and parses it safely. A broken
  body never throws out of the client. Error statuses become an `ApiError` with the server's
  message or "Request failed with status N".
- **Paying.** The button is disabled while the request runs, so double clicks send one request.
  The share shows "Paid" only when fresh server data says so. If the payment fails, the share stays
  unpaid, a red banner under that row says "Payment failed: ... The share is still unpaid.", and
  the button turns orange and says "Retry".
- **One key per attempt.** The key is created on the first click and kept in a `useRef`. If the
  outcome is unknown (network error, timeout, or 5xx), the key is kept, so "Retry" sends the same
  key. If the first request actually reached the server, the retry gets the same 200 instead of
  paying twice. After success, or after a definite 4xx answer, the key is cleared and the next
  click makes a new one. A 409 also refreshes the page so the share shows as paid.

## 7. The seven required cases

| Case                                  | How it is handled                                                                                                          | Tests                                                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Home with no members               | `POST /bills` returns 422 and saves nothing. Balances return an empty list. The page disables "Add bill".                  | `bills.test.ts` "rejects a home with no members"; `edge-cases.test.ts` "does not save a bill when the home has no members", "returns an empty list for a home with no members"                                                     |
| 2. Zero, negative or non-whole amount | `requireTotalCents` needs a safe positive integer, else 422. `bills_total_positive` and STRICT back it up in the database. | `bills.test.ts` "rejects the amount %j"; `edge-cases.test.ts` "rejects the amount %j" (unsafe integers, 0.01, NaN); `schema.test.ts`                                                                                               |
| 3. Uneven amount                      | `splitCents` gives leftover cents to the first members in join order.                                                      | `bills.test.ts` extra cents and sum tests; `split.test.ts` "always sums to the total"; `edge-cases.test.ts` "gives zero to the last members...", "splits the largest safe amount exactly", "keeps the join order for many members" |
| 4. Same payment sent twice            | Same key returns the stored share with status 200. Nothing is paid twice.                                                  | `payments.test.ts` "returns the same answer when the same key is sent twice"; `edge-cases.test.ts` "returns exactly the same body for a repeated key"                                                                              |
| 5. Two payments at the same time      | The conditional UPDATE lets exactly one win.                                                                               | `edge-cases.test.ts` "lets exactly one of two concurrent payments with different keys succeed", "answers both concurrent retries of the same key with the same payment"                                                            |
| 6. Bill or share does not exist       | 404, including a real share used with the wrong bill.                                                                      | `payments.test.ts` 404 tests; `edge-cases.test.ts` "answers 404 when the share belongs to another bill"                                                                                                                            |
| 7. API returns 500 or is slow         | Timeouts, safe parsing, error component, inline payment errors.                                                            | No automated web test. Checked by hand: stopped the API (502 from the proxy), and ran a server that accepts connections but never answers (timeout after 10 s).                                                                    |

## 8. Trade-offs and what I would improve next

- **Idempotency keys are scoped to one share.** The same key sent for a different share pays that
  share. A stricter design (like Stripe) would store keys in their own table with a UNIQUE
  constraint and reject reuse for a different request. I kept it on the share to keep the model
  small, because the client creates a fresh key per payment attempt anyway.
- **The retry key lives in memory.** If the user reloads the page between a failed attempt and the
  retry, the old key is lost and the next click uses a new one. Storing the key in
  `sessionStorage` per share would close that gap.
- **The database does not check that a share's member belongs to the bill's home.** The code always
  builds shares from the bill's home. A composite foreign key (`home_id` on shares, referencing
  `(id, home_id)` on both bills and members) would enforce it in SQL.
- **A bill is split between the members at the moment it is created.** A member who joins later is
  not part of earlier bills. That matches the spec, but it is a product choice worth naming.
- **No pagination** on the bills list. Fine for a shared home, not for large data.
- **No web tests.** Next I would add a component test for the pay button with a mocked fetch that
  fails once and succeeds on retry, and check that both requests carry the same key.
- **No auth.** Anyone with a home id can see and pay its bills.
