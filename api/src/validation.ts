import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const MAX_TEXT_LENGTH = 100

export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 400 when the body is not JSON at all, 422 when it is JSON but not an object. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    fail(400, 'Request body must be valid JSON')
  }
  if (!isRecord(body)) fail(422, 'Request body must be a JSON object')
  return body
}

/** A non-empty string, trimmed. */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') fail(422, `${field} must be a string`)
  const text = value.trim()
  if (text.length === 0) fail(422, `${field} must not be empty`)
  if (text.length > MAX_TEXT_LENGTH) {
    fail(422, `${field} must be at most ${MAX_TEXT_LENGTH} characters`)
  }
  return text
}

/** A positive whole number of cents that JavaScript can represent exactly. */
export function requireTotalCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail(422, 'totalCents must be a positive whole number of cents')
  }
  return value
}
