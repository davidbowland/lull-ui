import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { UpNext } from './index'
import { Puzzle } from '@types'
import { UpNextPick } from '@utils/up-next'

const PICK: UpNextPick = {
  date: '2026-08-20',
  puzzle: { data: {}, difficulty: 1, estimatedSeconds: 180, id: '2026-08-20:cryptogram:aa', type: 'cryptogram' },
}

// 2026-08-25T12:00:00Z. Injected rather than read off the wall clock, because dayLabel prints the
// year only when the day is not in the reader's current year -- so a test that let the clock default
// would start printing "2026" on 1 January 2027 and fail on a machine, not on the code.
const AUGUST = () => Date.UTC(2026, 7, 25, 12)

// Every date literal below is what Intl actually emits for en-GB, which puts NO comma after the
// weekday and DOES put one before a year: 'Thursday 20 August' against 'Thursday, 20 August 2026'.
// Verified with node rather than copied from a copy table.
const EN = 'en-GB'

const renderUpNext = (overrides: Partial<React.ComponentProps<typeof UpNext>> = {}) =>
  render(
    <UpNext
      locale={EN}
      now={AUGUST}
      onPickAnother={jest.fn()}
      onPlay={jest.fn()}
      openCount={0}
      panelId="up-next"
      pick={PICK}
      poolState="spent"
      reason="app"
      {...overrides}
    />,
  )

describe('UpNext, deferred', () => {
  // The option's best idea and the one most likely to be lost in a build: a recommendation shown
  // over unfinished work is a distraction, so the panel refuses to make one.
  it('holds its tongue while the day still has puzzles open', () => {
    renderUpNext({ openCount: 5 })

    expect(
      screen.getByText('Five puzzles are still open on this day. Another one is waiting when you finish.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument()
  })

  it('offers the pick anyway behind a disclosure', async () => {
    const user = userEvent.setup({ delay: null })
    renderUpNext({ openCount: 5 })

    await user.click(screen.getByRole('button', { name: 'Show it anyway' }))

    expect(screen.getByRole('button', { name: 'Play Cryptogram' })).toBeInTheDocument()
  })

  it('reports its disclosure state', async () => {
    const user = userEvent.setup({ delay: null })
    renderUpNext({ openCount: 5 })
    const toggle = screen.getByRole('button', { name: 'Show it anyway' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Hide it again' })).toHaveAttribute('aria-expanded', 'true')
  })

  // aria-controls contributes nothing to a name, so it rots in total silence -- every role query
  // keeps passing while the relationship it asserts is gone. Resolve it explicitly.
  it('points its disclosure at a region that exists', async () => {
    const user = userEvent.setup({ delay: null })
    renderUpNext({ openCount: 5 })

    await user.click(screen.getByRole('button', { name: 'Show it anyway' }))
    const toggle = screen.getByRole('button', { name: 'Hide it again' })

    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
  })

  // The other end of the same IDREF. The card is UNMOUNTED while the disclosure is shut, so an
  // aria-controls left on the control would point at nothing -- which is the dangling reference the
  // test above exists to catch, arrived at from the opposite direction.
  it('claims no relationship while it has nothing to point at', () => {
    renderUpNext({ openCount: 5 })

    expect(screen.getByRole('button', { name: 'Show it anyway' })).not.toHaveAttribute('aria-controls')
  })

  // Collapsing unmounts the card, not the control that collapsed it, so focus stays where the
  // player put it (WCAG 2.4.3). The install card has to move focus by hand for exactly the case
  // this one avoids by construction, so it is worth pinning that it stays avoided.
  it('keeps the keyboard on the disclosure when the card closes again', async () => {
    const user = userEvent.setup({ delay: null })
    renderUpNext({ openCount: 5 })
    await user.click(screen.getByRole('button', { name: 'Show it anyway' }))

    await user.click(screen.getByRole('button', { name: 'Hide it again' }))

    expect(screen.getByRole('button', { name: 'Show it anyway' })).toHaveFocus()
  })

  it('uses the singular for one open puzzle', () => {
    renderUpNext({ openCount: 1 })

    expect(
      screen.getByText('One puzzle is still open on this day. Another one is waiting when you finish.'),
    ).toBeInTheDocument()
  })

  // Ten and up fall back to digits. NOTHING IN THIS BUILD BOUNDS THE COUNT: a pack is JSON off the
  // network, the registry carries no per-day quota, and how many puzzles a day holds is lull-api's
  // decision -- six today, and not a number this repo may assume. So the count arrives as a plain
  // number and the alternative to a fallback is a sentence beginning "undefined puzzles".
  it('prints a count past nine as a number', () => {
    renderUpNext({ openCount: 12 })

    expect(
      screen.getByText('12 puzzles are still open on this day. Another one is waiting when you finish.'),
    ).toBeInTheDocument()
  })

  // The strip is still a named region a reader can jump to, which is the whole difference between
  // holding its tongue and not being there. The heading it takes that name from is sr-only in this
  // branch -- three shouts in a row to say "nothing yet" is not restraint -- so this query is what
  // stands between "quiet" and "unnamed".
  it('still names itself while it is deferring', () => {
    renderUpNext({ openCount: 5 })

    expect(screen.getByRole('region', { name: 'Up next' })).toBeInTheDocument()
  })

  // The revealed card is the ONE place the two branches share a code path, so it is the one place a
  // deferred-only regression in the card's own copy could hide. `reason` picks the second sentence
  // and nothing else asserts it from this side.
  it('gives the revealed card the sentence for the day the player chose', async () => {
    const user = userEvent.setup({ delay: null })
    renderUpNext({ openCount: 5, reason: 'day' })

    await user.click(screen.getByRole('button', { name: 'Show it anyway' }))

    expect(screen.getByText('From Thursday 20 August. The gentlest one you have left there.')).toBeInTheDocument()
  })
})

describe('UpNext, open', () => {
  it('names the puzzle', () => {
    renderUpNext()

    expect(screen.getByRole('button', { name: 'Play Cryptogram' })).toBeInTheDocument()
  })

  // The section takes its name from the heading, so breaking that IDREF costs the region its name
  // and this query fails -- which is why an aria-labelledby needs no separate resolution and an
  // aria-controls does.
  //
  // Level 2, and the number is a claim rather than a default: the shelf spends its one h1 on the
  // day, and this panel sits beside the day's rows rather than under them.
  it('names itself and offers the heading as a landmark', () => {
    renderUpNext()

    expect(screen.getByRole('region', { name: 'Up next' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Up next' })).toBeInTheDocument()
  })

  // The date is a FACT printed beside the pick, never a control to operate. That is the whole thesis.
  it('prints the date as a fact and not as a control', () => {
    renderUpNext()

    expect(screen.getByText('From Thursday 20 August. The gentlest puzzle you haven’t solved.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /20 August/ })).not.toBeInTheDocument()
  })

  // The clock reaches dayLabel rather than being left to default. Letting it default would read the
  // wall clock, which no test can pin and which this repo's non-determinism rule forbids -- and the
  // only observable difference is the year, so this is the assertion that catches it.
  it('gives the day its year once the year has turned', () => {
    renderUpNext({ now: () => Date.UTC(2027, 0, 4, 12) })

    expect(
      screen.getByText('From Thursday, 20 August 2026. The gentlest puzzle you haven’t solved.'),
    ).toBeInTheDocument()
  })

  it('changes its sentence for a day the player chose', () => {
    renderUpNext({ reason: 'day' })

    expect(screen.getByText('From Thursday 20 August. The gentlest one you have left there.')).toBeInTheDocument()
  })

  // The disclosure belongs to the deferred branch and to nothing else. With the day finished the
  // card IS the panel, and an implementation that wrapped it in a "Show it anyway" toggle would
  // satisfy every other assertion in this file while hiding the offer the panel exists to make.
  it('offers no disclosure once the day is finished', () => {
    renderUpNext()

    expect(screen.queryByRole('button', { name: /Show it/ })).not.toBeInTheDocument()
  })

  // The same two facts every other surface prints about a puzzle, in the same words, from the same
  // function -- the shelf row a player might have chosen this from says exactly this.
  it('says what the puzzle costs before it is opened', () => {
    renderUpNext()

    expect(screen.getByText('Gentle · About 3 min')).toBeInTheDocument()
  })

  it('plays the puzzle', async () => {
    const user = userEvent.setup({ delay: null })
    const onPlay = jest.fn()
    renderUpNext({ onPlay })

    await user.click(screen.getByRole('button', { name: 'Play Cryptogram' }))

    expect(onPlay).toHaveBeenCalledWith('2026-08-20:cryptogram:aa')
  })

  it('offers a way to choose instead', async () => {
    const user = userEvent.setup({ delay: null })
    const onPickAnother = jest.fn()
    renderUpNext({ onPickAnother })

    await user.click(screen.getByRole('button', { name: 'Pick another' }))

    expect(onPickAnother).toHaveBeenCalledTimes(1)
  })

  // NEVER NAME A PUZZLE IT CANNOT OPEN. lull-api can ship a generator before the UI that draws it,
  // so a pack off the network can carry a type this build has no registry entry for. Naming it would
  // offer a Play button that lands on a board the shell refuses to mount -- and reading `entry.label`
  // off the undefined entry would throw during render, which ErrorBoundary answers by replacing the
  // whole app.
  it('says nothing about a kind of puzzle it cannot draw', () => {
    const { container } = renderUpNext({
      pick: { date: '2026-08-20', puzzle: { ...PICK.puzzle, type: 'sudoku' as Puzzle['type'] } },
    })

    expect(container).toBeEmptyDOMElement()
  })
})

// The answers to "there is nothing to recommend", which is ONE predicate with several outcomes and
// was one test asserting an empty container. That test pinned the gap rather than the behavior: it
// read as "no pick means nothing to show", and the whole point of this state is that it does not.
describe('UpNext, nothing left to recommend', () => {
  // THE ONE THAT MATTERS MOST, and the state an active daily player reaches first. `pick` is drawn
  // with the day on screen excluded, so a null pick means "everything OUTSIDE today is solved" --
  // sweep the other six days with five rows still open here and the panel would otherwise announce
  // a clean sweep directly above the work.
  it('makes no claim about a sweep while the day on screen has work open', () => {
    const { container } = renderUpNext({ openCount: 5, pick: null, poolState: 'spent' })

    expect(container).toBeEmptyDOMElement()
  })

  // No pack at all. The shelf's own empty state is the screen in this case, and there is nothing for
  // this panel to be next to.
  it('renders nothing on a device holding no packs', () => {
    const { container } = renderUpNext({ pick: null, poolState: 'none' })

    expect(container).toBeEmptyDOMElement()
  })

  it('names a request once it has no puzzle to name', () => {
    renderUpNext({ pick: null, poolState: 'spent' })

    expect(screen.getByRole('region', { name: 'Up next' })).toBeInTheDocument()
    expect(
      screen.getByText('You’ve solved everything on this device. Lull can bring back an earlier day.'),
    ).toBeInTheDocument()
  })

  // The panel names the offer; the day panel performs it. Month-to-day targeting is not duplicated
  // into a second component, so this control does exactly what "Pick another" does from the card.
  it('hands the request to the day panel', async () => {
    const user = userEvent.setup({ delay: null })
    const onPickAnother = jest.fn()
    renderUpNext({ onPickAnother, pick: null, poolState: 'spent' })

    await user.click(screen.getByRole('button', { name: 'Bring back an earlier day' }))

    expect(onPickAnother).toHaveBeenCalledTimes(1)
  })

  // THE APP CANNOT KNOW THE ARCHIVE IS FINISHED, so this panel never says it. The sentence once read
  // "You've solved every puzzle Lull has made. New ones arrive each morning." -- a claim about all
  // 236 of them, drawn from one date that came back 404. Only GET /packs could support it and §2 of
  // the design keeps that endpoint undeployed, so the claim has no source and the copy stops at what
  // is on the device.
  it('never claims the archive is finished', () => {
    renderUpNext({ pick: null, poolState: 'spent' })

    expect(screen.queryByText(/every puzzle Lull has made/)).not.toBeInTheDocument()
  })

  // THE PANEL NEVER REPORTS A REQUEST. It printed "There was nothing for that day. Pick another day."
  // after a 404, in the one branch where it also withheld the button -- so the reader was told to
  // pick another day by the component that had just taken away the control for picking one, while
  // the day panel was saying the same thing about the same press in its own words. Requests belong
  // to the panel that makes them; this one speaks only about what is left to play.
  it('leaves every word about a request to the panel that made it', () => {
    renderUpNext({ pick: null, poolState: 'spent' })

    expect(screen.queryByText(/There was nothing for that day/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bring back an earlier day' })).toBeInTheDocument()
  })
})
