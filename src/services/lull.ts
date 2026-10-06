import axios from 'axios'

import { forgetPuzzles, isValidPack, readPack, writePack } from '@services/storage'
import { Pack, PackDate } from '@types'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_LULL_API_BASE_URL,
  timeout: 35_000, // 35 seconds
})

// fetchPackDates (GET /packs) is deliberately absent. Nothing in this slice consumes it
// -- the archive arrives with a later type -- and an unused client is an untested one.

// `response.data as Pack` is a cast, not a check. isValidPack lives in storage.ts
// because readPack shares it -- see the comment there for what a poisoned key does.
const requestPack = async (date: PackDate): Promise<Pack> => {
  const response = await api.get(`/packs/${date}`)
  if (!isValidPack(response.data, date)) {
    throw new Error(`Malformed pack for ${date}`)
  }
  return response.data
}

export const fetchPack = async (date: PackDate): Promise<Pack> => {
  const stored = readPack(date)

  // A complete pack never changes, so it is answered from the device and the request is
  // never made. An INCOMPLETE one falls through: the day can fill in later, and a client
  // that stopped asking would keep serving the partial version forever.
  //
  // "Never changes" is the rule, and refreshPack below is the player's way round it for the day
  // the backend breaks it.
  if (stored !== null && stored.complete) {
    return stored
  }

  try {
    const pack = await requestPack(date)
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

// START THIS DAY OVER: ask for the day again whatever the device holds, and put down everything the
// player left on it. A complete pack is answered from the device forever, so when lull-api regenerates
// or fixes a day this is the only way an installed app ever sees the new one.
//
// THE REQUEST COMES FIRST, and nothing is cleared until it has answered with a pack that passes
// validation. Clearing first would turn a dropped connection into a lost day: the boards and rungs
// gone, and no new pack to start over on. A failure here throws and leaves the device untouched.
//
// BOTH PACKS' PUZZLES ARE FORGOTTEN, old and new. Puzzle ids carry a random shortId, so a regenerated
// day usually shares none with the old one -- and an id only in the new pack can still have state
// here, from an earlier refresh or another tab. Forgotten before the write, so the shelf never reads
// the new day with the old day's marks on it.
export const refreshPack = async (date: PackDate): Promise<Pack> => {
  const pack = await requestPack(date)
  const replaced = readPack(date)?.puzzles ?? []
  forgetPuzzles([...replaced, ...pack.puzzles].map((puzzle) => puzzle.id))
  writePack(date, pack)
  return pack
}
