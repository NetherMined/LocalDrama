import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api'

let ids: ReadonlySet<string> = new Set()
let loaded = false
let loading: Promise<void> | null = null
let generation = 0
const listeners = new Set<() => void>()

function publish(next: ReadonlySet<string>) {
  ids = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function ensureLoaded() {
  if (loaded || loading) return
  const gen = generation
  loading = api
    .favourites()
    .then((res) => {
      if (gen !== generation) return
      loaded = true
      publish(new Set(res.items.map((show) => show.bookId)))
    })
    .catch(() => undefined)
    .finally(() => {
      if (gen === generation) loading = null
    })
}

/**
 * Clears the cached list after a profile or account change. Mounted cards reload it straight away when `signedIn`
 * is true; a guest never fetches it. A response that arrives for an older generation is dropped.
 */
export function resetFavourites(signedIn: boolean) {
  generation += 1
  loaded = false
  loading = null
  publish(new Set())
  if (signedIn && listeners.size > 0) ensureLoaded()
}

/** Favourite book ids for the current profile. Loads once per page session and is shared by every card. */
export function useFavourites(signedIn = true): ReadonlySet<string> {
  useEffect(() => {
    if (signedIn) ensureLoaded()
  }, [signedIn])
  return useSyncExternalStore(subscribe, () => ids)
}

export async function setFavourite(bookId: string, on: boolean): Promise<void> {
  const prev = ids
  const next = new Set(prev)
  if (on) next.add(bookId)
  else next.delete(bookId)
  publish(next)
  try {
    if (on) await api.addFavourite(bookId)
    else await api.removeFavourite(bookId)
  } catch (err) {
    publish(prev)
    throw err
  }
}
