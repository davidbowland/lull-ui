import { act, renderHook } from '@testing-library/react'

import { useOnline } from './useOnline'

describe('useOnline', () => {
  const setNavigatorOnLine = (value: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value, writable: true })
  }

  beforeAll(() => {
    setNavigatorOnLine(true)
  })

  it('reports the initial navigator state', () => {
    const { result } = renderHook(() => useOnline())

    expect(result.current).toBe(true)
  })

  it('reports false when the page loads while the navigator is already offline', () => {
    setNavigatorOnLine(false)

    const { result } = renderHook(() => useOnline())

    expect(result.current).toBe(false)

    setNavigatorOnLine(true)
  })

  it('reports false once an offline event fires', () => {
    const { result } = renderHook(() => useOnline())

    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)

    setNavigatorOnLine(true)
  })

  it('reports true again once an online event fires', () => {
    const { result } = renderHook(() => useOnline())

    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })

  it('removes the exact listeners it added on unmount', () => {
    const addEventListener = jest.spyOn(window, 'addEventListener')
    const removeEventListener = jest.spyOn(window, 'removeEventListener')
    const connectivityCalls = (calls: unknown[][]): unknown[][] =>
      calls.filter(([type]) => type === 'online' || type === 'offline')

    renderHook(() => useOnline()).unmount()

    // Compared by reference, so a cleanup that removes some other function —
    // leaking every listener the hook added — fails here.
    expect(connectivityCalls(addEventListener.mock.calls)).toHaveLength(2)
    expect(connectivityCalls(removeEventListener.mock.calls)).toEqual(connectivityCalls(addEventListener.mock.calls))
  })
})
