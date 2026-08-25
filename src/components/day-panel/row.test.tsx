import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { DayRow } from './row'

describe('DayRow', () => {
  it('is a button when it can be opened', () => {
    render(
      <DayRow
        accessibleName="Wed, 19 Aug — 2 solved."
        countLabel="2 solved"
        label="Wed, 19 Aug"
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Wed, 19 Aug — 2 solved.' })).toBeInTheDocument()
  })

  // The name is the claim: the prop type is `() => void`, so the handler must not be handed React's
  // synthetic event. toHaveBeenCalledTimes(1) alone let `onClick={onSelect}` pass under this name.
  it('calls back with no argument when pressed', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelect = jest.fn()
    render(
      <DayRow accessibleName="Wed, 19 Aug — 2 solved." countLabel="2 solved" label="Wed, 19 Aug" onSelect={onSelect} />,
    )

    await user.click(screen.getByRole('button', { name: 'Wed, 19 Aug — 2 solved.' }))

    expect(onSelect).toHaveBeenCalledWith()
  })

  // A day with nothing to open is not a disabled button and not a link -- it is not a control at
  // all. Same rule ShelfRow follows for a puzzle the shell would refuse to mount: there is nothing
  // to press, so there is nothing to keep in the tab order.
  it('is not a control when it cannot be opened', () => {
    render(<DayRow accessibleName="Sun, 23 Aug — all solved." countLabel="All solved" label="Sun, 23 Aug" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // THE OTHER HALF OF THE REQUIREMENT, which "has no button role" does not cover. A
  // `<div tabIndex={0}>` carries no role and still sits in the tab order -- a stop that cannot be
  // acted on, which is the trap this branch exists to avoid. Tabbing past it onto the next control
  // is the only way to see that it is not there.
  it('holds no tab stop when it cannot be opened', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <>
        <DayRow accessibleName="Sun, 23 Aug — all solved." countLabel="All solved" label="Sun, 23 Aug" />
        <button type="button">after</button>
      </>,
    )

    await user.tab()

    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })

  it('still reads its facts when it is not a control', () => {
    render(<DayRow accessibleName="Sun, 23 Aug — all solved." countLabel="All solved" label="Sun, 23 Aug" />)

    expect(screen.getByText('Sun, 23 Aug')).toBeInTheDocument()
    expect(screen.getByText('All solved')).toBeInTheDocument()
  })

  // The row that cannot be pressed still has to SAY itself. Its visible cells are all aria-hidden,
  // so without this span the row is a container with a name and no accessible children -- which iOS
  // VoiceOver and Android TalkBack swipe straight past in silence, on the state a finished day
  // normally lands in.
  it('speaks its whole name when it is not a control', () => {
    render(<DayRow accessibleName="Sun, 23 Aug — all solved." countLabel="All solved" label="Sun, 23 Aug" />)

    expect(screen.getByText('Sun, 23 Aug — all solved.')).toBeInTheDocument()
  })

  // The argument that the visible cells and the spoken name "cannot drift apart" rests entirely on
  // the cells being hidden. Unpin it and the row reads its date twice.
  it('hides the visible cells from the accessible tree', () => {
    render(<DayRow accessibleName="Sun, 23 Aug — all solved." countLabel="All solved" label="Sun, 23 Aug" />)

    expect(screen.getByText('Sun, 23 Aug')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('All solved')).toHaveAttribute('aria-hidden', 'true')
  })

  // WCAG 2.5.3: every visible word is in the accessible name, so speech input has something to say.
  // The copy review caught this exact failure on the "Here" tag.
  it('keeps the visible Today tag inside the accessible name', () => {
    render(
      <DayRow
        accessibleName="Tue, 25 Aug, today — 6 solved."
        countLabel="6 solved"
        isToday
        label="Tue, 25 Aug"
        onSelect={jest.fn()}
      />,
    )

    const row = screen.getByRole('button', { name: 'Tue, 25 Aug, today — 6 solved.' })

    expect(within(row).getByText('Today')).toBeInTheDocument()
  })

  it('keeps the visible Here tag inside the accessible name', () => {
    render(
      <DayRow
        accessibleName="Wed, 19 Aug, here — 2 solved. Already on this device."
        countLabel="2 solved"
        isHere
        label="Wed, 19 Aug"
        onSelect={jest.fn()}
      />,
    )

    const row = screen.getByRole('button', { name: 'Wed, 19 Aug, here — 2 solved. Already on this device.' })

    expect(within(row).getByText('Here')).toBeInTheDocument()
  })

  // Today is routinely BOTH in the month list -- the parent passes isHere for every day whose pack
  // is on the device, and today's is. The parent's accessibleNameFor makes the same choice in
  // another file with nothing tying the two together, so if they drift the visible word stops being
  // in the name and 2.5.3 breaks with no failure anywhere. This is that file's half.
  it('shows Today, not Here, when the day is both', () => {
    render(
      <DayRow
        accessibleName="Tue, 25 Aug, today — 6 solved."
        countLabel="6 solved"
        isHere
        isToday
        label="Tue, 25 Aug"
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByText('Here')).not.toBeInTheDocument()
  })

  // aria-current="date" is the token for a date, not "true". The shelf's Spine uses aria-current
  // "page" for the same you-are-here job on a different kind of thing.
  it('marks today with aria-current', () => {
    render(
      <DayRow
        accessibleName="Tue, 25 Aug, today — 6 solved."
        countLabel="6 solved"
        isToday
        label="Tue, 25 Aug"
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /today/ })).toHaveAttribute('aria-current', 'date')
  })

  // TODAY, ALL SOLVED is the feature's headline state and it is the branch with no button in it, so
  // an aria-current that lives only on the button is dropped exactly where it matters most. On this
  // branch it rides the <li>, which has a role every screen reader maps.
  it('marks today with aria-current when today cannot be opened', () => {
    render(
      <DayRow accessibleName="Tue, 25 Aug, today — all solved." countLabel="All solved" isToday label="Tue, 25 Aug" />,
    )

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-current', 'date')
  })

  // The absence is the assertion. A row that emitted aria-current="date" unconditionally passed
  // every test above, and would have told a reader that every day in the list is today.
  it('leaves aria-current off a day that is not today', () => {
    render(
      <DayRow
        accessibleName="Wed, 19 Aug — 2 solved."
        countLabel="2 solved"
        label="Wed, 19 Aug"
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Wed, 19 Aug — 2 solved.' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-current')
  })
})
