import { fetchPack, refreshPack } from './lull'
import {
  markSolved,
  readHints,
  readMeta,
  readPack,
  readProgress,
  writeHints,
  writePack,
  writeProgress,
} from './storage'
import { incompletePack, pack, packDate, puzzleId, quickPuzzleId } from '@test/__mocks__'

const mockGet = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn(() => ({ get: (...args: any[]) => mockGet(...args) })),
}))

// Storage is deliberately NOT mocked here. Cache-first is the behavior under test, and
// against a mock it would be a claim about a call rather than about what the device holds.
describe('fetchPack', () => {
  const setup = (): void => {
    window.localStorage.clear()
  }

  beforeAll(() => {
    console.error = jest.fn()
  })

  it('fetches a pack that is not on the device', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: pack })

    expect(await fetchPack(packDate)).toEqual(pack)
    expect(mockGet).toHaveBeenCalledWith(`/packs/${packDate}`)
  })

  it('stores the fetched pack', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: pack })

    await fetchPack(packDate)

    expect(readPack(packDate)).toEqual(pack)
  })

  // Cache-first. A complete pack never changes, so asking again spends a request on an
  // answer already on the device -- and offline it is the only answer there is.
  it('answers a complete cached pack without touching the network', async () => {
    setup()
    writePack(packDate, pack)

    expect(await fetchPack(packDate)).toEqual(pack)
    expect(mockGet).not.toHaveBeenCalled()
  })

  // Both halves of the incomplete-pack rule have a test, because they pull in opposite
  // directions and dropping either one breaks something real.

  // Cached: a partial day is still playable offline, which is the whole reason the
  // backend serves partial packs at all.
  it('stores an incomplete pack, so a partial day is playable offline', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: incompletePack })

    await fetchPack(packDate)

    expect(readPack(packDate)).toEqual(incompletePack)
  })

  // Re-requested: a day that fills in later has to stop being partial.
  it('re-requests a cached pack that is still incomplete', async () => {
    setup()
    writePack(packDate, incompletePack)
    mockGet.mockResolvedValueOnce({ data: pack })

    expect(await fetchPack(packDate)).toEqual(pack)
    expect(mockGet).toHaveBeenCalledWith(`/packs/${packDate}`)
  })

  it('keeps the incomplete cached pack when the re-request fails', async () => {
    setup()
    writePack(packDate, incompletePack)
    mockGet.mockRejectedValueOnce(new Error('Network Error'))

    expect(await fetchPack(packDate)).toEqual(incompletePack)
  })

  // Read again rather than reusing the miss above: the request took real time, and
  // another tab -- or the prefetch -- may have filled it meanwhile.
  it('re-reads the cache on failure rather than reusing the earlier miss', async () => {
    setup()
    mockGet.mockImplementationOnce(() => {
      writePack(packDate, pack)
      return Promise.reject(new Error('Network Error'))
    })

    expect(await fetchPack(packDate)).toEqual(pack)
  })

  it('throws when the request fails and nothing is on the device', async () => {
    setup()
    mockGet.mockRejectedValueOnce(new Error('Network Error'))

    await expect(fetchPack(packDate)).rejects.toThrow('Network Error')
  })
})

// Starting a day over. The fetch comes FIRST and nothing is cleared until it has answered with a
// pack that passes validation, so a failure -- offline, a timeout, a malformed body -- leaves the
// player's day exactly as it was.
describe('refreshPack', () => {
  // A puzzle on another day, so a test can show the clear stays inside the day it was asked about.
  const otherDayPuzzleId = '2026-08-17:gofigure:0d0d0d0d'

  const setup = (): void => {
    window.localStorage.clear()
    writePack(packDate, pack)
    writeProgress(puzzleId, '6+9')
    writeHints(puzzleId, 2)
    markSolved(quickPuzzleId)
    writeProgress(otherDayPuzzleId, '1+2')
    markSolved(otherDayPuzzleId)
  }

  beforeAll(() => {
    console.error = jest.fn()
  })

  // fetchPack answers a complete pack from the device and never asks. A refresh that did the same
  // would be a button that does nothing on exactly the days it exists for.
  it('asks the server even when a complete pack is on the device', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: pack })

    await refreshPack(packDate)

    expect(mockGet).toHaveBeenCalledWith(`/packs/${packDate}`)
  })

  it('replaces the stored pack with the one that came back', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: incompletePack })

    expect(await refreshPack(packDate)).toEqual(incompletePack)
    expect(readPack(packDate)).toEqual(incompletePack)
  })

  it('clears the progress, hints and solved marks of the day it replaced', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: pack })

    await refreshPack(packDate)

    expect(readProgress(puzzleId)).toBeNull()
    expect(readHints(puzzleId, 3)).toBe(0)
    expect(readMeta().solved).not.toContain(quickPuzzleId)
  })

  // The old pack and the new one need not hold the same puzzles. A puzzle that is only in the new
  // one can still have state on the device -- from before an earlier refresh, or another tab.
  it('clears a puzzle that is only in the new pack', async () => {
    setup()
    writePack(packDate, incompletePack)
    mockGet.mockResolvedValueOnce({ data: pack })

    await refreshPack(packDate)

    expect(readMeta().solved).not.toContain(quickPuzzleId)
  })

  // Another tab, or the prune, can take the pack away between the press and the answer.
  it('starts over on a day the device no longer holds', async () => {
    setup()
    window.localStorage.removeItem(`lull:pack:${packDate}`)
    mockGet.mockResolvedValueOnce({ data: pack })

    await refreshPack(packDate)

    expect(readPack(packDate)).toEqual(pack)
    expect(readProgress(puzzleId)).toBeNull()
  })

  it('leaves other days alone', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: pack })

    await refreshPack(packDate)

    expect(readProgress(otherDayPuzzleId)).toEqual('1+2')
    expect(readMeta().solved).toContain(otherDayPuzzleId)
  })

  it('changes nothing when the request fails', async () => {
    setup()
    mockGet.mockRejectedValueOnce(new Error('Network Error'))

    await expect(refreshPack(packDate)).rejects.toThrow('Network Error')
    expect(readPack(packDate)).toEqual(pack)
    expect(readProgress(puzzleId)).toEqual('6+9')
    expect(readHints(puzzleId, 3)).toBe(2)
    expect(readMeta().solved).toContain(quickPuzzleId)
  })

  it('changes nothing when the server answers with something that is not a pack', async () => {
    setup()
    mockGet.mockResolvedValueOnce({ data: { date: packDate } })

    await expect(refreshPack(packDate)).rejects.toThrow(`Malformed pack for ${packDate}`)
    expect(readPack(packDate)).toEqual(pack)
    expect(readProgress(puzzleId)).toEqual('6+9')
  })
})
