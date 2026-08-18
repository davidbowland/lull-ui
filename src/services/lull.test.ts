import { fetchPack } from './lull'
import { readPack, writePack } from './storage'
import { incompletePack, pack, packDate } from '@test/__mocks__'

const mockGet = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn(() => ({ get: (...args: any[]) => mockGet(...args) })),
}))

// Storage is deliberately NOT mocked here. Cache-first is the behaviour under test, and
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
