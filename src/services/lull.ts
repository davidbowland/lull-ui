import axios from 'axios'

import { isValidPack, readPack, writePack } from '@services/storage'
import { Pack, PackDate } from '@types'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_LULL_API_BASE_URL,
  timeout: 35_000, // 35 seconds
})

// fetchPackDates (GET /packs) is deliberately absent. Nothing in this slice consumes it
// -- the archive arrives with a later type -- and an unused client is an untested one.

// `response.data as Pack` is a cast, not a check. isValidPack lives in storage.ts
// because readPack shares it -- see the comment there for what a poisoned key does.
export const fetchPack = async (date: PackDate): Promise<Pack> => {
  const stored = readPack(date)

  // A complete pack never changes, so it is answered from the device and the request is
  // never made. An INCOMPLETE one falls through: the day can fill in later, and a client
  // that stopped asking would keep serving the partial version forever.
  if (stored !== null && stored.complete) {
    return stored
  }

  try {
    const response = await api.get(`/packs/${date}`)
    if (!isValidPack(response.data, date)) {
      throw new Error(`Malformed pack for ${date}`)
    }
    const pack = response.data
    // Stored even when incomplete. A partial day is still playable offline, which is the
    // entire reason the backend serves partial packs rather than waiting for a full one.
    writePack(date, pack)
    return pack
  } catch (error: unknown) {
    // Read again rather than reusing the `stored` above: the request took real time, and
    // another tab -- or the prefetch -- may have filled it meanwhile. This is also what
    // keeps an incomplete cached pack playable when the refresh fails.
    const fallback = readPack(date)
    if (fallback !== null) {
      // readPack already validated and self-healed, so anything non-null is sound.
      return fallback
    }
    throw error
  }
}
