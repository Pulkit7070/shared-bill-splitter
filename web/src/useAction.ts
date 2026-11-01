import { useState } from 'react'
import { messageOf } from './api'

/** Runs one async action at a time and keeps its pending flag and error message. */
export function useAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(...args: Args) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await action(...args)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setPending(false)
    }
  }

  return { run, pending, error }
}
