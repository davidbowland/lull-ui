import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { Keypad, UtilityKey } from './index'
import { ROWS } from './layout'

describe('Keypad', () => {
  const onPress = jest.fn()
  const onLeft = jest.fn()
  const onRight = jest.fn()

  // JSDOM 20 HAS NO POINTER CAPTURE, and the pad calls setPointerCapture on every press -- plainly,
  // so a real browser without it fails loudly. No-ops are enough: nothing here asserts capture, only
  // that a press does not throw on the way to the key. THE DELETE IS NOT OPTIONAL: an assignment to
  // a prototype outlives the suite that made it.
  beforeAll(() => {
    for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false, writable: true })
    }
  })

  afterAll(() => {
    for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
      delete (Element.prototype as unknown as Record<string, unknown>)[method]
    }
  })

  // NAMED FOR THEIR SLOTS, not for either bench's tools. `Delete goes left` is a convention this
  // component cannot enforce -- both slots take the same type -- so it is pinned in the two board
  // suites that actually make the promise, and the fixture here says only which end is which.
  // Calling these `Guess` and `Delete` would read as the pad guaranteeing an arrangement it does
  // not.
  const left: UtilityKey = { label: 'Left', onClick: onLeft, tone: 'left-tone' }
  const right: UtilityKey = { label: 'Right', onClick: onRight, tone: 'right-tone' }

  // The two benches name their keys very differently -- `A, on cipher Z` against `A, in the phrase,
  // fills word 1 letter 2` -- so the fixture names a key in neither voice. What is under test is
  // that the pad asks and uses the answer, never what either board says.
  const setup = (utility: readonly [UtilityKey, UtilityKey] = [left, right]) => {
    const user = userEvent.setup({ delay: null })
    render(
      <Keypad
        label="Letters and tools"
        letter={(plain) => ({ name: `${plain} key`, tone: 'letter-tone' })}
        onPress={onPress}
        utility={utility}
      />,
    )

    return { user }
  }

  const pad = (): HTMLElement => screen.getByRole('group', { name: 'Letters and tools' })

  // 26 letters plus two tools. The count is what stops a row being dropped or doubled by a future
  // edit to ROWS -- layout.test.ts holds the letters themselves, and this holds that the pad draws
  // all of them and exactly two other things.
  it('draws every letter and both tools', () => {
    setup()

    expect(within(pad()).getAllByRole('button')).toHaveLength(28)
  })

  // DOM ORDER IS TAB ORDER, and it is the one promise a name query cannot make on its own: every
  // key would still be found by name if the rows were built bottom-up or the utility keys drawn
  // first, and a keyboard player would walk the pad in an order that does not match what is on
  // screen. Read off the DOM rather than walked with 28 Tabs, which asserts the same fact and takes
  // 28 round trips to do it.
  it('lays the keys out in reading order', () => {
    setup()

    expect(
      within(pad())
        .getAllByRole('button')
        .map((key) => key.textContent),
    ).toEqual([...ROWS[0], ...ROWS[1], 'Left', ...ROWS[2], 'Right'])
  })

  // The tools stand at the two ENDS of the last row, which is what makes it nine cells wide like
  // the row above it. Asserted as position rather than as presence, because presence is already
  // covered above and position is the thing the tuple is for.
  it('stands a tool at each end of the last row', () => {
    setup()

    const keys = within(pad()).getAllByRole('button')

    expect(keys[19]).toHaveAccessibleName('Left')
    expect(keys[27]).toHaveAccessibleName('Right')
  })

  it('hands the pressed letter back', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'M key' }))

    expect(onPress).toHaveBeenCalledWith('M')
  })

  it.each([
    ['Left', onLeft, onRight],
    ['Right', onRight, onLeft],
  ])('runs only the %s tool own handler', async (name, pressed, other) => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name }))

    expect(pressed).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  // `Play again` does not fit a key and `Again` does, so 2.5.3 Label in Name is satisfied by a name
  // that CONTAINS the visible label. The pad has to let a board say both, and has to fall back to
  // the label when it says one -- a key named by an undefined `aria-label` would lose its name
  // outright and a role query would stop finding it.
  it('names a tool by its label when it is given no other name', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Right' })).toHaveTextContent('Right')
  })

  it('lets a tool be named something longer than it can show', () => {
    setup([{ label: 'Again', name: 'Play again', onClick: onLeft, tone: 'left-tone' }, right])

    expect(screen.getByRole('button', { name: 'Play again' })).toHaveTextContent('Again')
  })

  // NOTHING IS EVER DISABLED. A verdict is a paint and a name, never a change to what is reachable:
  // a player working the pad from a keyboard has to find the same 28 keys in the same order on
  // guess one and on guess twelve.
  //
  // BOTH ATTRIBUTES, because they fail differently and only one of them is what `toBeEnabled`
  // reads. `disabled` takes a key out of the tab order outright; `aria-disabled` leaves it
  // reachable and tells a screen reader it does nothing, which is the more tempting edit of the two
  // and the harder one to notice, since the key would go on working for everyone else.
  it('leaves every key live', () => {
    setup()

    const keys = within(pad()).getAllByRole('button')

    expect(keys.every((key) => !key.hasAttribute('disabled'))).toBe(true)
    expect(keys.every((key) => !key.hasAttribute('aria-disabled'))).toBe(true)
  })

  // The half-key indents at the ends of row two are scenery -- the reason a keyboard looks like a
  // keyboard -- and a screen reader working the pad must not stop on either of them.
  it('hides the indents from the accessibility tree', () => {
    setup()

    // Scoped to a row's own children, which is the only place an indent can be: every other
    // aria-hidden element in the pad -- the letter's box, a mark, a note -- lives inside a button.
    expect(pad().querySelectorAll('div > span[aria-hidden="true"]')).toHaveLength(2)
  })

  // The strike and the `= Z` are the two things the benches draw INSIDE a key, and the pad has to
  // place them without knowing what either one means: the mark goes over the letter and the note
  // goes under it.
  it('draws a mark over the letter and a note under it', () => {
    render(
      <Keypad
        label="Letters and tools"
        letter={(plain) => ({
          mark: <span data-mark="" key="mark" />,
          name: `${plain} key`,
          note: <span data-note="" key="note" />,
          tone: 'letter-tone',
        })}
        onPress={onPress}
        utility={[left, right]}
      />,
    )
    const key = screen.getByRole('button', { name: 'Q key' })

    // The mark is a child of the box the letter is in, so a rule through it is measured against the
    // glyph rather than against the whole key; the note is a sibling of that box.
    expect(key.querySelector('span > [data-mark]')).toBeInTheDocument()
    expect(key.querySelector(':scope > [data-note]')).toBeInTheDocument()
  })

  // THE GESTURE, with geometry. jsdom lays nothing out, so the rects are written here by hand: a pad
  // at y 500, rows 59 tall with 1px gridlines, letters 40 wide, a 20px indent at each end of row
  // two and 60px tools at each end of row three -- the real pad's proportions at a 400px width.
  describe('the press gesture', () => {
    const KEY_W = 40
    const ROW_H = 59
    const GAP = 1
    const PAD_TOP = 500
    const PAD_RECT = { bottom: PAD_TOP + 3 * ROW_H + 2 * GAP, left: 0, right: 409, top: PAD_TOP }

    const rect = ({ bottom, left, right, top }: typeof PAD_RECT): DOMRect =>
      ({
        bottom,
        height: bottom - top,
        left,
        right,
        toJSON: () => ({}),
        top,
        width: right - left,
        x: left,
        y: top,
      }) as DOMRect

    // Each row is a run of [key, width] laid left to right with a 1px gridline between.
    const rects = new Map<string, DOMRect>()
    const rows: (readonly [string, number])[][] = [
      ROWS[0].map((plain) => [plain, KEY_W] as const),
      [['indent', 20] as const, ...ROWS[1].map((plain) => [plain, KEY_W] as const)],
      [['utility-0', 60] as const, ...ROWS[2].map((plain) => [plain, KEY_W] as const), ['utility-1', 60] as const],
    ]
    rows.forEach((row, index) => {
      const top = PAD_TOP + index * (ROW_H + GAP)
      row.reduce((left, [key, width]) => {
        rects.set(key, rect({ bottom: top + ROW_H, left, right: left + width, top }))
        return left + width + GAP
      }, 0)
    })

    const rectOf = (element: Element): DOMRect =>
      element.getAttribute('role') === 'group'
        ? rect(PAD_RECT)
        : (rects.get(element.getAttribute('data-key') ?? '') as DOMRect)

    // The middle of a key, read off the same table the pad is given.
    const centerOf = (key: string): { clientX: number; clientY: number } => {
      const { height, left, top, width } = rects.get(key) as DOMRect
      return { clientX: left + width / 2, clientY: top + height / 2 }
    }

    const OUTSIDE = { clientX: 200, clientY: PAD_TOP - 80 }

    // THE CLOCK STANDS STILL unless a test moves it, so every click below lands at the instant its
    // gesture ended unless the test says how long after. `clock.at` is the pad's `now`.
    const renderPad = (): { at: number } => {
      const clock = { at: 0 }
      render(
        <Keypad
          label="Letters and tools"
          letter={(plain) => ({ name: `${plain} key`, tone: 'letter-tone' })}
          now={() => clock.at}
          onPress={onPress}
          rectOf={rectOf}
          utility={[left, right]}
        />,
      )
      return clock
    }

    // JSDOM HAS NO PointerEvent, and fireEvent.pointerDown builds a bare Event that carries no
    // coordinates and no pointer id. A MouseEvent carries clientX, clientY, button and detail
    // natively, and the pointer fields are defined on it -- React routes it by its type string, so
    // the pad's handler reads exactly these values.
    //
    // A REAL FINGER BY DEFAULT: a 20x20 contact at half pressure. Every gesture test below runs that
    // shape unless it says otherwise, because a shape the pad reads as VIRTUAL (0x0, or on Android
    // a 1x1 mouse with no pressure) skips the gesture entirely -- and a default that drifted into
    // one would turn every test here into a test of the click path without failing any of them.
    const pointer = (
      type: 'lostpointercapture' | 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
      target: Element,
      {
        button = 0,
        clientX,
        clientY,
        detail = 0,
        height = 20,
        pointerId = 1,
        pointerType = 'touch',
        pressure = 0.5,
        width = 20,
      }: {
        button?: number
        clientX: number
        clientY: number
        detail?: number
        height?: number
        pointerId?: number
        pointerType?: string
        pressure?: number
        width?: number
      },
    ): void => {
      const event = new MouseEvent(type, { bubbles: true, button, cancelable: true, clientX, clientY, detail })
      Object.defineProperty(event, 'pointerId', { value: pointerId })
      Object.defineProperty(event, 'pointerType', { value: pointerType })
      Object.defineProperty(event, 'width', { value: width })
      Object.defineProperty(event, 'height', { value: height })
      Object.defineProperty(event, 'pressure', { value: pressure })
      fireEvent(target, event)
    }

    // The click a browser sends after a pointer press. `detail: 1` is what marks it as a pointer's;
    // assistive technology clicks with 0.
    const pointerClick = (target: Element, detail = 1): void => {
      fireEvent(target, new MouseEvent('click', { bubbles: true, cancelable: true, detail }))
    }

    const key = (name: string): HTMLElement => screen.getByRole('button', { name })

    it('types a tapped key once, on release, and swallows the click that follows', () => {
      renderPad()

      pointer('pointerdown', key('S key'), centerOf('S'))
      expect(onPress).not.toHaveBeenCalled()
      pointer('pointerup', key('S key'), centerOf('S'))
      pointerClick(key('S key'))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith('S')
    })

    it('types the key a finger slides onto, and only that key', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), centerOf('G'))
      pointer('pointerup', key('F key'), centerOf('G'))
      pointerClick(key('F key'))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith('G')
    })

    it('types nothing when a finger slides off the pad before lifting', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), OUTSIDE)
      pointer('pointerup', key('F key'), OUTSIDE)
      pointerClick(key('F key'))

      expect(onPress).not.toHaveBeenCalled()
    })

    it('types the key a finger slides back onto after leaving the pad', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), OUTSIDE)
      pointer('pointermove', key('F key'), centerOf('H'))
      pointer('pointerup', key('F key'), centerOf('H'))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith('H')
    })

    // THE 6px LIFT. W spans x 41-81 on the top row and S spans x 62-102 on the next, so x 70 is over
    // both columns; y is 4px below the gridline between the rows. A finger there is read 6px higher
    // and lands on W; a mouse pointer is read where it is and lands on S.
    it.each([
      ['touch', 'W'],
      ['pen', 'W'],
      ['mouse', 'S'],
    ])('reads a %s press 4px under the row boundary as %s', (pointerType, typed) => {
      renderPad()
      const at = { clientX: 70, clientY: PAD_TOP + ROW_H + GAP + 4, pointerType }

      pointer('pointerdown', key('S key'), at)
      pointer('pointerup', key('S key'), at)

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith(typed)
    })

    // The lift carries a touch on the very top edge of the top row up out of the pad. The clamp
    // and nearest-key resolution both say where it lands, and it lands on the key it touched.
    it('keeps a touch on the top 3px of Q on Q', () => {
      renderPad()
      const at = { clientX: 20, clientY: PAD_TOP + 2 }

      pointer('pointerdown', key('Q key'), at)
      pointer('pointerup', key('Q key'), at)

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith('Q')
    })

    // A gridline or an indent belongs to the nearest key, so no part of the pad is a dead zone.
    it('gives a press on the row-two indent to A', () => {
      renderPad()
      const at = { clientX: 5, clientY: centerOf('A').clientY }

      pointer('pointerdown', key('A key'), at)
      pointer('pointerup', key('A key'), at)

      expect(onPress).toHaveBeenCalledWith('A')
    })

    it('runs a tool from a gesture, and only that tool', () => {
      renderPad()

      pointer('pointerdown', key('Right'), centerOf('utility-1'))
      pointer('pointerup', key('Right'), centerOf('utility-1'))
      pointerClick(key('Right'))

      expect(onRight).toHaveBeenCalledTimes(1)
      expect(onLeft).not.toHaveBeenCalled()
      expect(onPress).not.toHaveBeenCalled()
    })

    // A ROLLOVER: the second thumb lands before the first lifts. The first key counts on the second
    // press, the second on its own release, and the two clicks the browser sends afterwards count
    // neither again.
    it('commits the first key when a second finger lands, and counts each key once', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointerdown', key('J key'), { ...centerOf('J'), pointerId: 2 })
      expect(onPress.mock.calls).toEqual([['F']])
      pointer('pointerup', key('F key'), { ...centerOf('F'), pointerId: 1 })
      pointer('pointerup', key('J key'), { ...centerOf('J'), pointerId: 2 })
      pointerClick(key('F key'))
      pointerClick(key('J key'))

      expect(onPress.mock.calls).toEqual([['F'], ['J']])
    })

    it('commits nothing for a first finger that had slid off the pad when the second lands', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), OUTSIDE)
      pointer('pointerdown', key('J key'), { ...centerOf('J'), pointerId: 2 })
      pointer('pointerup', key('J key'), { ...centerOf('J'), pointerId: 2 })

      expect(onPress.mock.calls).toEqual([['J']])
    })

    // A canceled slide opens the same click window a tap does. Enter clicks with detail 0, and a
    // window never swallows a keyboard's press.
    it('lets Enter press a key after a canceled gesture', async () => {
      const user = userEvent.setup({ delay: null })
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), OUTSIDE)
      pointer('pointerup', key('F key'), OUTSIDE)
      key('K key').focus()
      await user.keyboard('{Enter}')

      expect(onPress.mock.calls).toEqual([['K']])
    })

    it('marks the key under the gesture as down, and only that key', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      expect([...pad().querySelectorAll('[data-down="true"]')]).toEqual([key('F key')])

      pointer('pointermove', key('F key'), centerOf('G'))
      expect([...pad().querySelectorAll('[data-down="true"]')]).toEqual([key('G key')])

      // The cancel state: off the pad, nothing is down.
      pointer('pointermove', key('F key'), OUTSIDE)
      expect(pad().querySelectorAll('[data-down="true"]')).toHaveLength(0)

      pointer('pointermove', key('F key'), centerOf('G'))
      pointer('pointerup', key('F key'), centerOf('G'))
      expect(pad().querySelectorAll('[data-down="true"]')).toHaveLength(0)
    })

    // The bubble is the only aria-hidden element that is a direct child of the pad: the rows are
    // not hidden, and the indents and every letter box sit a level further in.
    const bubble = (): Element | null => pad().querySelector(':scope > [aria-hidden="true"]')

    it.each(['touch', 'pen'])(
      'shows the pressed letter in a bubble hidden from assistive technology during a %s press',
      (pointerType) => {
        renderPad()

        expect(bubble()).toBeNull()
        pointer('pointerdown', key('F key'), { ...centerOf('F'), pointerType })
        expect(bubble()).toHaveTextContent('F')
        expect(bubble()).toHaveAttribute('aria-hidden', 'true')

        pointer('pointermove', key('F key'), { ...centerOf('G'), pointerType })
        expect(bubble()).toHaveTextContent('G')

        pointer('pointermove', key('F key'), { ...OUTSIDE, pointerType })
        expect(bubble()).toBeNull()

        pointer('pointermove', key('F key'), { ...centerOf('G'), pointerType })
        pointer('pointerup', key('F key'), { ...centerOf('G'), pointerType })
        expect(bubble()).toBeNull()
      },
    )

    it('shows a tool by its word in the bubble', () => {
      renderPad()

      pointer('pointerdown', key('Left'), centerOf('utility-0'))

      expect(bubble()).toHaveTextContent('Left')
    })

    it('draws the key mark and note in the bubble, so a verdict never rests on color', () => {
      render(
        <Keypad
          label="Letters and tools"
          letter={(plain) => ({
            mark: <span data-mark="" key="mark" />,
            name: `${plain} key`,
            note: <span key="note">= Z</span>,
            tone: 'letter-tone',
          })}
          onPress={onPress}
          rectOf={rectOf}
          utility={[left, right]}
        />,
      )

      pointer('pointerdown', key('F key'), centerOf('F'))

      expect(bubble()).toHaveTextContent('F= Z')
      expect(bubble()?.querySelector('[data-mark]')).toBeInTheDocument()
    })

    it('shows no bubble for a mouse', () => {
      renderPad()

      pointer('pointerdown', key('F key'), { ...centerOf('F'), pointerType: 'mouse' })

      expect(key('F key')).toHaveAttribute('data-down', 'true')
      expect(bubble()).toBeNull()
    })

    it('ends a gesture on pointercancel without typing', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointercancel', key('F key'), centerOf('F'))
      pointer('pointerup', key('F key'), centerOf('F'))

      expect(onPress).not.toHaveBeenCalled()
    })

    it('ends a gesture when the PAD loses capture, without typing', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('lostpointercapture', pad(), centerOf('F'))
      pointer('pointerup', key('F key'), centerOf('F'))

      expect(onPress).not.toHaveBeenCalled()
    })

    // A key losing the implicit capture it took at pointerdown -- which can happen when the pad takes
    // the pointer over -- bubbles up to the pad as `lostpointercapture` too. Read as the pad's own
    // loss, it would cancel every tap.
    it('keeps the gesture when a KEY loses capture, so the tap still types', () => {
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('lostpointercapture', key('F key'), centerOf('F'))
      pointer('pointerup', key('F key'), centerOf('F'))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith('F')
    })

    // The user agent a press is read under. The virtual-pointer test asks it once per pointerdown,
    // so each test below that cares answers that one question with mockReturnValueOnce.
    const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    const userAgent = (): jest.SpyInstance => jest.spyOn(window.navigator, 'userAgent', 'get')

    // A VIRTUAL POINTER is assistive technology pressing on the player's behalf, and it must type
    // the key ONCE. TalkBack's double-tap is a 1x1 `mouse` press with no pressure and detail 0, then
    // a click with detail 0; VoiceOver's virtual pointers are 0x0. Left to the gesture, the release
    // typed the key and the click typed it again. The VoiceOver case clicks with detail 1, the harder
    // of the two: only a press that started no gesture and recorded no time lets that click through.
    it.each([
      ['TalkBack', ANDROID, { height: 1, pointerType: 'mouse', pressure: 0, width: 1 }, 0],
      ['VoiceOver', IPHONE, { height: 0, pointerType: 'touch', pressure: 0, width: 0 }, 1],
    ])('types a key once for a %s virtual press and its click', (_, agent, shape, detail) => {
      userAgent().mockReturnValueOnce(agent)
      renderPad()
      const at = { ...centerOf('S'), ...shape }

      pointer('pointerdown', key('S key'), at)
      expect(key('S key')).not.toHaveAttribute('data-down')
      expect(bubble()).toBeNull()
      pointer('pointerup', key('S key'), at)
      pointerClick(key('S key'), detail)

      expect(onPress.mock.calls).toEqual([['S']])
    })

    // A 1x1 MOUSE WITH PRESSURE is a real mouse, not a virtual pointer -- it is exactly what
    // user-event sends for `user.click`, and the pad must still count it on release.
    it('treats a 1x1 mouse pressed at half pressure as a real pointer', () => {
      renderPad()
      const at = { ...centerOf('S'), height: 1, pointerType: 'mouse', pressure: 0.5, width: 1 }

      pointer('pointerdown', key('S key'), at)
      expect(key('S key')).toHaveAttribute('data-down', 'true')
      pointer('pointerup', key('S key'), at)
      pointerClick(key('S key'))

      expect(onPress.mock.calls).toEqual([['S']])
    })

    // DESKTOP SAFARI reports a real mouse's pressure as 0, so a 1x1 `mouse` with no pressure is not
    // enough to call a press virtual: its `detail` of 1 is what says a button really went down. Run
    // under Android, where the other three conditions WOULD make it virtual, so `detail` alone is
    // what this pins.
    it('treats a 1x1 mouse with no pressure but detail 1 as a real pointer', () => {
      userAgent().mockReturnValueOnce(ANDROID)
      renderPad()
      const at = { ...centerOf('S'), detail: 1, height: 1, pointerType: 'mouse', pressure: 0, width: 1 }

      pointer('pointerdown', key('S key'), at)
      expect(key('S key')).toHaveAttribute('data-down', 'true')
      pointer('pointerup', key('S key'), at)
      pointerClick(key('S key'))

      expect(onPress.mock.calls).toEqual([['S']])
    })

    // SOME ANDROID DEVICES report a real finger as 0x0. Read as virtual, every press on such a phone
    // would lose the lift and the bubble, so on Android a 0x0 touch is a real press.
    it('treats a 0x0 touch on Android as a real finger', () => {
      userAgent().mockReturnValueOnce(ANDROID)
      renderPad()
      const at = { ...centerOf('S'), height: 0, width: 0 }

      pointer('pointerdown', key('S key'), at)
      expect(key('S key')).toHaveAttribute('data-down', 'true')
      expect(bubble()).toHaveTextContent('S')
      pointer('pointerup', key('S key'), at)
      pointerClick(key('S key'))

      expect(onPress.mock.calls).toEqual([['S']])
    })

    // THE iOS LATE CLICK. iOS dispatches a tap's click on a separate path from its pointer events,
    // and it can land after the next finger is down. A count of clicks owed, reset at B's press,
    // spent B's allowance on A's late click and let B's own click through to type B again. Every
    // pointer click near a gesture is the gesture's, so each letter types once.
    it("types each key once when a tap's click arrives after the next finger lands", () => {
      const clock = renderPad()

      pointer('pointerdown', key('A key'), centerOf('A'))
      clock.at = 60
      pointer('pointerup', key('A key'), centerOf('A'))
      clock.at = 120
      pointer('pointerdown', key('B key'), centerOf('B'))
      clock.at = 150
      pointerClick(key('A key'))
      clock.at = 200
      pointer('pointerup', key('B key'), centerOf('B'))
      clock.at = 210
      pointerClick(key('B key'))

      expect(onPress.mock.calls).toEqual([['A'], ['B']])
    })

    // A SLIDE OFF THE PAD may produce no click at all, and the window is what keeps it from eating
    // a later one: past a second, a detail-1 click with no pointer events behind it is a press of
    // its own.
    it('types a pointer click that comes more than a second after a canceled slide', () => {
      const clock = renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointermove', key('F key'), OUTSIDE)
      pointer('pointerup', key('F key'), OUTSIDE)
      clock.at = 1500
      pointerClick(key('K key'))

      expect(onPress.mock.calls).toEqual([['K']])
    })

    // Inside the second, the same click is taken as the slide's own, late, and swallowed. This is
    // the recorded residual: assistive technology clicking with detail 1 this soon after a real
    // touch loses that one click.
    it('swallows a pointer click that comes within a second of a canceled slide', () => {
      const clock = renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointercancel', key('F key'), centerOf('F'))
      clock.at = 500
      pointerClick(key('K key'))

      expect(onPress).not.toHaveBeenCalled()
    })

    // A keyboard clicks with detail 0, and no window ever swallows it, however close it follows a
    // tap.
    it('lets Enter press a key straight after a tap', async () => {
      const user = userEvent.setup({ delay: null })
      renderPad()

      pointer('pointerdown', key('F key'), centerOf('F'))
      pointer('pointerup', key('F key'), centerOf('F'))
      pointerClick(key('F key'))
      key('K key').focus()
      await user.keyboard('{Enter}')

      expect(onPress.mock.calls).toEqual([['F'], ['K']])
    })

    // A RIGHT-BUTTON PRESS is no press at all: it types nothing and starts no gesture, so it opens
    // no window and a pointer click straight after it still types. A browser sends a right button
    // no click.
    it('ignores a right-button press and swallows no click for it', () => {
      renderPad()

      pointer('pointerdown', key('F key'), { ...centerOf('F'), button: 2, pointerType: 'mouse' })
      expect(key('F key')).not.toHaveAttribute('data-down')
      pointer('pointerup', key('F key'), { ...centerOf('F'), button: 2, pointerType: 'mouse' })
      expect(onPress).not.toHaveBeenCalled()
      pointerClick(key('K key'))

      expect(onPress.mock.calls).toEqual([['K']])
    })

    // A capture that throws still leaves the gesture it was capturing for, so the release types the
    // key the GESTURE reads. The press sits 4px under the W/S boundary, where the lift reads W and
    // the element under the finger is S: with no gesture, pointerup would do nothing and the click
    // would reach S's own onClick and type the key the player was not aiming at.
    //
    // React 19 does not rethrow an event handler's error to the dispatcher: it reports it to the
    // window as an uncaught error, which jest would fail the test on. The listener catches it there
    // and is what proves the throw went out loudly rather than being swallowed by the pad; the
    // console spy only quiets React's own report of it.
    it('still types the key when pointer capture throws', () => {
      const capture = jest.spyOn(Element.prototype, 'setPointerCapture').mockImplementationOnce(() => {
        throw new DOMException('No active pointer', 'NotFoundError')
      })
      const console_ = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const reported: unknown[] = []
      const report = (event: ErrorEvent): void => {
        event.preventDefault()
        reported.push(event.error)
      }
      window.addEventListener('error', report)
      renderPad()

      const at = { clientX: 70, clientY: PAD_TOP + ROW_H + GAP + 4 }

      pointer('pointerdown', key('S key'), at)
      window.removeEventListener('error', report)
      console_.mockRestore()
      expect(key('W key')).toHaveAttribute('data-down', 'true')
      pointer('pointerup', key('S key'), at)
      pointerClick(key('S key'))

      expect(capture).toHaveBeenCalledTimes(1)
      expect(reported).toEqual([expect.objectContaining({ message: 'No active pointer' })])
      expect(onPress.mock.calls).toEqual([['W']])
    })

    // THE TOOLS ARE NAMED BY POSITION. The guess bench swaps `Guess` for `Again` when the board is
    // over, and a press that began on the right-hand tool commits the right-hand tool on release --
    // whatever that tool has become.
    it('runs the right-hand tool by position when its label changes mid-gesture', () => {
      const onAgain = jest.fn()
      const { rerender } = render(
        <Keypad
          label="Letters and tools"
          letter={(plain) => ({ name: `${plain} key`, tone: 'letter-tone' })}
          onPress={onPress}
          rectOf={rectOf}
          utility={[left, right]}
        />,
      )

      pointer('pointerdown', key('Right'), centerOf('utility-1'))
      rerender(
        <Keypad
          label="Letters and tools"
          letter={(plain) => ({ name: `${plain} key`, tone: 'letter-tone' })}
          onPress={onPress}
          rectOf={rectOf}
          utility={[left, { label: 'Again', name: 'Play again', onClick: onAgain, tone: 'right-tone' }]}
        />,
      )
      expect(bubble()).toHaveTextContent('Again')
      pointer('pointerup', key('Play again'), centerOf('utility-1'))
      pointerClick(key('Play again'))

      expect(onAgain).toHaveBeenCalledTimes(1)
      expect(onRight).not.toHaveBeenCalled()
      expect(onLeft).not.toHaveBeenCalled()
    })

    // The bubble is fixed, not portaled: it lives inside the pad, so a board that unmounts mid-press
    // (the shell navigating away under a thumb) takes it along and leaves nothing on the page.
    it('removes the bubble when the pad unmounts mid-gesture', () => {
      const { unmount } = render(
        <Keypad
          label="Letters and tools"
          letter={(plain) => ({ name: `${plain} key`, tone: 'letter-tone' })}
          onPress={onPress}
          rectOf={rectOf}
          utility={[left, right]}
        />,
      )

      pointer('pointerdown', key('F key'), centerOf('F'))
      expect(bubble()).toHaveTextContent('F')
      unmount()

      expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull()
      expect(onPress).not.toHaveBeenCalled()
    })
  })

  // THE NO-LAYOUT PATH: no rectOf, so the pad's rect is jsdom's 0x0 and the key is the one the
  // press landed on. This is the path every board suite drives, and a `user.click` must go on
  // meaning "press this key" exactly once.
  describe('without layout', () => {
    it('types a clicked key exactly once', async () => {
      const { user } = setup()

      await user.click(screen.getByRole('button', { name: 'S key' }))

      expect(onPress.mock.calls).toEqual([['S']])
    })

    it('types once for Enter on a focused key', async () => {
      const { user } = setup()

      screen.getByRole('button', { name: 'S key' }).focus()
      await user.keyboard('{Enter}')

      expect(onPress.mock.calls).toEqual([['S']])
    })

    // A switch, or assistive technology that sends only a click: no pointer gesture at all.
    it('types once for a bare click', () => {
      setup()

      screen.getByRole('button', { name: 'S key' }).click()

      expect(onPress.mock.calls).toEqual([['S']])
    })
  })
})
