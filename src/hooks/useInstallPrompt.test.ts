import { act, renderHook } from '@testing-library/react'

import { useInstallPrompt } from './useInstallPrompt'
import * as storage from '@services/storage'

jest.mock('@services/storage')

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0'
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/129.0 Safari'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36'

const INSTALLED_DISPLAY_MODES = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'

type WindowWithDeferredPrompt = Window & { __deferredInstallPrompt?: unknown }

describe('useInstallPrompt', () => {
  interface SetupOptions {
    displayMode?: boolean
    installDismissed?: boolean
    maxTouchPoints?: number
    navigatorStandalone?: boolean
    userAgent?: string
  }

  // Named arrangement, called explicitly by every test, and the only place in this
  // file that stubs anything. Every fact the hook reads is written on every call, so
  // the order the tests run in cannot change an outcome.
  //
  // mockImplementation, never mockReturnValueOnce: clearMocks is mockClear, which
  // empties the call log but not a queue of once-values. A leftover once-value would
  // wait in the queue and surface in whichever later test mounts twice.
  const setup = ({
    displayMode = false,
    installDismissed = false,
    maxTouchPoints = 0,
    navigatorStandalone = false,
    userAgent = MAC,
  }: SetupOptions = {}): void => {
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: navigatorStandalone })
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent })
    jest.mocked(storage).readMeta.mockImplementation(() => ({ installDismissed, solved: [], v: 1 }))
    jest.mocked(window.matchMedia).mockImplementation(() => ({ matches: displayMode }) as MediaQueryList)
  }

  const makePrompt = (outcome: 'accepted' | 'dismissed' = 'accepted'): Event & { prompt: jest.Mock } =>
    Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: jest.fn().mockResolvedValue({ outcome }),
    })

  const firePrompt = (outcome: 'accepted' | 'dismissed' = 'accepted'): Event & { prompt: jest.Mock } => {
    const event = makePrompt(outcome)
    act(() => {
      window.dispatchEvent(event)
    })
    return event
  }

  // The shared default. An auto-mocked readMeta returns undefined rather than a
  // Meta, and the hook reads a property straight off it, so without this a test that
  // forgot setup() would die on a TypeError instead of reporting what it checked.
  beforeAll(() => {
    jest.mocked(storage).readMeta.mockImplementation(() => ({ installDismissed: false, solved: [], v: 1 }))
  })

  describe('mode', () => {
    it('offers nothing until the browser says the app can be installed', () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('none')
    })

    it('shows the card once beforeinstallprompt fires', () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      firePrompt()

      expect(result.current.mode).toBe('card')
    })

    it('shows the card on iOS without any prompt event', () => {
      setup({ userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('card')
    })

    it('keeps the browser from showing its own banner', () => {
      setup()

      renderHook(() => useInstallPrompt())

      expect(firePrompt().defaultPrevented).toBe(true)
    })

    it('offers nothing to a window already running in an installed display mode', () => {
      setup({ displayMode: true, userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('none')
    })

    // A manifest that later asks for minimal-ui or fullscreen would otherwise put the
    // installed app back in front of an offer to install itself.
    it('counts every display mode the browser can run an installed app in', () => {
      setup()

      renderHook(() => useInstallPrompt())

      expect(window.matchMedia).toHaveBeenCalledWith(INSTALLED_DISPLAY_MODES)
    })

    it('offers nothing to an installed iOS app, which reports itself on navigator', () => {
      setup({ navigatorStandalone: true, userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('none')
    })

    it('stops offering once the app reports itself installed', () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      firePrompt()
      act(() => {
        window.dispatchEvent(new Event('appinstalled'))
      })

      expect(result.current.mode).toBe('none')
    })

    // beforeinstallprompt is a Chromium event. Firefox for Android installs web apps
    // but never fires it, so gating the card on the event alone left the browser with
    // no route to installing and nothing on screen saying one exists.
    it('shows the card on Firefox for Android without any prompt event', () => {
      setup({ userAgent: FIREFOX_ANDROID })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('card')
    })

    it('offers nothing on a platform with no install route, dismissed or not', () => {
      setup({ installDismissed: true })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('none')
    })
  })

  describe('platform', () => {
    it('reports desktop for a machine with no touch screen', () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('desktop')
    })

    it('reports android when the user agent is android', () => {
      setup({ userAgent: ANDROID })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('android')
    })

    it('reports firefox-android for Firefox on android, which has its own install route', () => {
      setup({ userAgent: FIREFOX_ANDROID })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('firefox-android')
    })

    // Firefox on iOS is Safari underneath: it carries no Gecko engine and no browser
    // menu that installs anything. Only the Share sheet works there, so it must not
    // be swept up by a bare match on "Firefox".
    it('reports ios for Firefox on iOS, where only the Share sheet installs', () => {
      setup({ userAgent: FIREFOX_IOS })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('ios')
    })

    it('reports ios for an iPhone', () => {
      setup({ userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('ios')
    })

    // Both this test and the desktop one above send the same Mac user agent, because
    // that is what an iPad sends. Touch points are the only thing that separates them,
    // so the two tests together are what prove the touch check does the work.
    it('reports ios for a Mac user agent with a touch screen, which is how iPadOS reports itself', () => {
      setup({ maxTouchPoints: 5 })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.platform).toBe('ios')
    })
  })

  describe('install', () => {
    it('shows the stored prompt when install is pressed', async () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      const event = firePrompt()
      await act(async () => {
        result.current.install()
      })

      expect(event.prompt).toHaveBeenCalled()
    })

    it('leaves the card open when the browser dialog is accepted', async () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      firePrompt('accepted')
      await act(async () => {
        result.current.install()
      })

      expect(result.current.mode).toBe('card')
    })

    // A spent prompt rejects with InvalidStateError, so pressing twice used to throw
    // into the console and leave the card's only control inert for the session.
    it('shows the prompt once however many times install is pressed', async () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      const event = firePrompt('dismissed')
      await act(async () => {
        result.current.install()
        result.current.install()
      })

      expect(event.prompt).toHaveBeenCalledTimes(1)
    })

    it('collapses to the link when the browser dialog is turned down, and never to nothing', async () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      firePrompt('dismissed')
      await act(async () => {
        result.current.install()
      })

      expect(result.current.mode).toBe('link')
      expect(jest.mocked(storage).setInstallDismissed).toHaveBeenCalledWith(true)
    })

    it('collapses to the link when the browser refuses to show the prompt', async () => {
      setup()
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      const { result } = renderHook(() => useInstallPrompt())
      const event = firePrompt()
      event.prompt.mockRejectedValueOnce(new Error('InvalidStateError'))
      await act(async () => {
        result.current.install()
      })

      expect(result.current.mode).toBe('link')
      expect(consoleError).toHaveBeenCalled()
    })

    it('does nothing when there is no stored prompt to show', async () => {
      setup({ userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())
      await act(async () => {
        result.current.install()
      })

      expect(result.current.mode).toBe('card')
      expect(jest.mocked(storage).setInstallDismissed).not.toHaveBeenCalled()
    })
  })

  describe('dismissal', () => {
    it('records a dismissal and collapses to the link', () => {
      setup()

      const { result } = renderHook(() => useInstallPrompt())
      firePrompt()
      act(() => {
        result.current.dismiss()
      })

      expect(jest.mocked(storage).setInstallDismissed).toHaveBeenCalledWith(true)
      expect(result.current.mode).toBe('link')
    })

    it('reads a dismissal recorded on an earlier visit', () => {
      setup({ installDismissed: true, userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('link')
    })

    it('reopens after a dismissal, because the card is never destroyed', () => {
      setup({ installDismissed: true, userAgent: IPHONE })

      const { result } = renderHook(() => useInstallPrompt())
      act(() => {
        result.current.reopen()
      })

      expect(jest.mocked(storage).setInstallDismissed).toHaveBeenCalledWith(false)
      expect(result.current.mode).toBe('card')
    })
  })

  // output: 'export' means the page is static HTML that hydrates after load, so on a
  // slow phone the event can arrive before any listener exists. Losing it would leave
  // the card silently absent for the whole session with nothing to fall back on.
  describe('an event that arrived before hydration', () => {
    it('picks up a prompt the page parked before the hook mounted', () => {
      setup()
      ;(window as WindowWithDeferredPrompt).__deferredInstallPrompt = makePrompt()

      const { result } = renderHook(() => useInstallPrompt())

      expect(result.current.mode).toBe('card')
      expect((window as WindowWithDeferredPrompt).__deferredInstallPrompt).toBeUndefined()
    })

    it('shows a prompt that arrived before the hook mounted', async () => {
      setup()
      const event = makePrompt()
      ;(window as WindowWithDeferredPrompt).__deferredInstallPrompt = event

      const { result } = renderHook(() => useInstallPrompt())
      await act(async () => {
        result.current.install()
      })

      expect(event.prompt).toHaveBeenCalled()
    })
  })

  // Asserting expect.any(Function) here would pass even if the cleanup removed a
  // different function and leaked the real one on every mount. Comparing the
  // listeners actually handed to addEventListener against the ones handed to
  // removeEventListener is what makes leaking detectable.
  it.each(['appinstalled', 'beforeinstallprompt'])('stops listening for %s after unmount', (type: string) => {
    setup()
    const addEventListener = jest.spyOn(window, 'addEventListener')
    const removeEventListener = jest.spyOn(window, 'removeEventListener')

    renderHook(() => useInstallPrompt()).unmount()

    const added = addEventListener.mock.calls.filter(([name]) => name === type).map(([, listener]) => listener)
    const removed = removeEventListener.mock.calls.filter(([name]) => name === type).map(([, listener]) => listener)

    expect(added).toHaveLength(1)
    expect(removed).toEqual(added)
  })
})
