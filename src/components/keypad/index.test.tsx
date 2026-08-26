import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { Keypad, UtilityKey } from './index'
import { ROWS } from './layout'

describe('Keypad', () => {
  const onPress = jest.fn()
  const onLeft = jest.fn()
  const onRight = jest.fn()

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
})
