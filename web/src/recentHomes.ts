import type { Home } from './api'

const STORAGE_KEY = 'recent-homes'
const MAX_RECENT = 5

function isHome(value: unknown): value is Home {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}

/** Homes this browser opened before, newest first. Ids are hard to remember, so we keep them. */
export function loadRecentHomes(): Home[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isHome) : []
  } catch {
    return []
  }
}

export function rememberHome(home: Home): void {
  const others = loadRecentHomes().filter((recent) => recent.id !== home.id)
  const next = [{ id: home.id, name: home.name }, ...others].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be full or blocked (private mode). Recent homes are a convenience only.
  }
}
