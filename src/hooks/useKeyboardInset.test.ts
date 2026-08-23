import { renderHook } from '@testing-library/react'

import { setInset, useKeyboardInset } from './useKeyboardInset'

describe('useKeyboardInset', () => {
  const write = jest.fn()

  // jsdom implements no visualViewport at all, so every case builds one. An EventTarget rather
  // than a bare object because the hook subscribes to it, and the dispatch is how the tests
  // drive a keyboard opening.
  interface FakeViewport extends EventTarget {
    height: number
    offsetTop: number
    scale: number
  }

  const realInnerHeight = window.innerHeight

  const setup = (innerHeight: number, height: number, offsetTop: number, scale: number): FakeViewport => {
    const viewport = Object.assign(new EventTarget(), { height, offsetTop, scale }) as FakeViewport
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport, writable: true })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight, writable: true })
    return viewport
  }

  const setupWithoutViewport = (): void => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined, writable: true })
  }

  afterAll(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: realInnerHeight, writable: true })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined, writable: true })
  })

  // The whole of the hook's arithmetic, said as data. Each row is a state a real device
  // produces: nothing covered, a keyboard, a keyboard under a panned page, a retracted URL bar
  // leaving the visual viewport TALLER than the layout viewport, and a fractional device pixel
  // ratio, where the two sides of the subtraction are different kinds of number.
  it.each([
    [760, 760, 0, 1, 0],
    [760, 460, 0, 1, 300],
    [760, 460, 120, 1, 180],
    [760, 900, 0, 1, 0],
    [760, 459.6, 0, 1, 300],
  ])(
    'with a %ipx window and a %ipx viewport at %ipx, scale %i, reports %ipx covered',
    (innerHeight: number, height: number, offsetTop: number, scale: number, expected: number) => {
      setup(innerHeight, height, offsetTop, scale)

      renderHook(() => useKeyboardInset(write))

      expect(write).toHaveBeenCalledTimes(1)
      expect(write).toHaveBeenCalledWith(expected)
    },
  )

  it('does nothing where the browser has no visual viewport', () => {
    setupWithoutViewport()

    renderHook(() => useKeyboardInset(write))

    expect(write).not.toHaveBeenCalled()
  })

  // A pinch-zoom shrinks the visual viewport with no keyboard anywhere, so the subtraction would
  // read it as several hundred pixels of covered screen.
  it('says nothing at all while the page is pinch-zoomed', () => {
    setup(760, 460, 0, 2)

    renderHook(() => useKeyboardInset(write))

    expect(write).not.toHaveBeenCalled()
  })

  // And it HOLDS the last measurement rather than zeroing it. A player who pinches to re-read the
  // clue while the keyboard is up would otherwise have the bench grow back to full height behind
  // the keyboard, putting it straight back over the field they are typing in.
  it('holds the last measurement through a pinch-zoom', () => {
    const viewport = setup(760, 460, 0, 1)
    renderHook(() => useKeyboardInset(write))

    viewport.scale = 2
    viewport.height = 200
    viewport.dispatchEvent(new Event('resize'))

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenLastCalledWith(300)
  })

  // Every write sets an inline custom property on <html> that index.css reads in a max-height, so
  // an unguarded write is a document-wide style invalidation -- and the visual viewport's `scroll`
  // event fires per frame while a page pans.
  it('does not write a measurement that has not moved', () => {
    const viewport = setup(760, 460, 0, 1)
    renderHook(() => useKeyboardInset(write))

    viewport.dispatchEvent(new Event('scroll'))
    viewport.dispatchEvent(new Event('resize'))

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('measures again when the visual viewport resizes', () => {
    const viewport = setup(760, 760, 0, 1)
    renderHook(() => useKeyboardInset(write))

    viewport.height = 460
    viewport.dispatchEvent(new Event('resize'))

    expect(write).toHaveBeenLastCalledWith(300)
  })

  // iOS Safari reports a keyboard through `scroll` on the visual viewport rather than through
  // `resize`, so a hook that subscribed only to resize would be inert on the one platform that
  // has no interactive-widget key to fall back on.
  it('measures again when the visual viewport scrolls, which is how iOS reports a keyboard', () => {
    const viewport = setup(760, 760, 0, 1)
    renderHook(() => useKeyboardInset(write))

    viewport.height = 460
    viewport.dispatchEvent(new Event('scroll'))

    expect(write).toHaveBeenLastCalledWith(300)
  })

  it('puts the inset back when the surface unmounts', () => {
    setup(760, 460, 0, 1)
    const { unmount } = renderHook(() => useKeyboardInset(write))

    unmount()

    expect(write).toHaveBeenLastCalledWith(0)
  })

  it('stops listening when the surface unmounts', () => {
    const viewport = setup(760, 460, 0, 1)
    const { unmount } = renderHook(() => useKeyboardInset(write))
    unmount()
    const settled = write.mock.calls.length

    viewport.dispatchEvent(new Event('resize'))

    expect(write).toHaveBeenCalledTimes(settled)
  })

  // THE PRODUCTION WRITER, which every test above replaces with a spy. Both halves of what it
  // builds can be wrong in total silence, and they fail differently: a misspelled property name
  // leaves index.css reading the `0px` declared in :root, so the bench never moves, while a value
  // with no unit makes `calc(100dvh - 300)` invalid at computed-value time and takes the ceiling
  // away altogether. The keyboard covers the field either way, and every test above still passes,
  // because none of them ever calls this.
  describe('the property it publishes', () => {
    afterAll(() => document.documentElement.style.removeProperty('--lull-kb'))

    it('names the token index.css reads, and gives it a unit', () => {
      setInset(300)

      expect(document.documentElement.style.getPropertyValue('--lull-kb')).toBe('300px')
    })
  })
})
