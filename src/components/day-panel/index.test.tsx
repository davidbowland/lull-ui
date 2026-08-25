import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { DayPanel } from './index'
import { DaySummary } from '@utils/day-summary'

const summary = (date: string, solvedCount: number, status: DaySummary['status']): DaySummary => ({
  date,
  solvedCount,
  status,
})

// The panel's clock, frozen. Every date label below is what Intl emits for en-GB relative to this
// instant -- and en-GB puts no comma after the weekday until a year is appended: 'Tue 25 Aug', but
// 'Wed, 31 Dec 2025'. Nothing here may read the wall clock, because a label that does spells a
// different string from 2027 onward.
const NOW = (): number => Date.UTC(2026, 7, 25, 12)

const SEVEN: DaySummary[] = [
  summary('2026-08-25', 6, 'allSolved'),
  summary('2026-08-24', 3, 'hasUnsolved'),
  summary('2026-08-23', 0, 'hasUnsolved'),
  summary('2026-08-22', 1, 'hasUnsolved'),
  summary('2026-08-21', 5, 'allSolved'),
  summary('2026-08-20', 2, 'hasUnsolved'),
  summary('2026-08-19', 2, 'hasUnsolved'),
]

// Past the spelled-out words. RETENTION_WINDOW is seven today, so the shelf cannot produce this --
// it is a constant somebody may raise, and a numeral beats a missing word.
const TEN: DaySummary[] = [
  ...SEVEN,
  summary('2026-08-18', 0, 'hasUnsolved'),
  summary('2026-08-17', 0, 'hasUnsolved'),
  summary('2026-08-16', 0, 'hasUnsolved'),
]

// Built rather than rendered, so a test can re-render the SAME panel with a new request and watch
// what the live region and the focused control do across the change. Several of the properties this
// component promises -- one status node for the whole run, focus that survives a 404 -- are only
// observable across a re-render.
const panel = (overrides: Partial<React.ComponentProps<typeof DayPanel>> = {}) => (
  <DayPanel
    days={SEVEN}
    isOnline
    locale="en-GB"
    now={NOW}
    onDismiss={jest.fn()}
    onRequestDay={jest.fn()}
    onSelectDay={jest.fn()}
    panelId="day-panel"
    request={null}
    solved={new Set()}
    todayDate="2026-08-25"
    {...overrides}
  />
)

const renderPanel = (overrides: Partial<React.ComponentProps<typeof DayPanel>> = {}) => render(panel(overrides))

describe('DayPanel', () => {
  it('names itself', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Choose a day' })).toBeInTheDocument()
  })

  it('lists every day it was given', () => {
    renderPanel()

    expect(screen.getAllByRole('listitem')).toHaveLength(7)
  })

  it('reports how many days are on the device', () => {
    renderPanel()

    expect(screen.getByText('Seven days are on this device.')).toBeInTheDocument()
  })

  // The one number in the feature that can be wrong. A hardcoded "Seven" lies on any device holding
  // fewer packs, which the copy review flagged as blocking.
  it('uses the singular when only one day is here', () => {
    renderPanel({ days: [summary('2026-08-25', 0, 'hasUnsolved')] })

    expect(screen.getByText('One day is on this device.')).toBeInTheDocument()
  })

  it('counts the days it actually has, not seven', () => {
    renderPanel({ days: SEVEN.slice(0, 3) })

    expect(screen.getByText('Three days are on this device.')).toBeInTheDocument()
  })

  it('falls back to a numeral past nine days', () => {
    renderPanel({ days: TEN })

    expect(screen.getByText('10 days are on this device.')).toBeInTheDocument()
  })

  // The copy table has no zero form, and the screen that reaches this state already carries the
  // shipping h1 "No puzzles on this device". A second sentence saying it again is noise.
  it('says nothing about the device when it holds no days', () => {
    renderPanel({ days: [] })

    expect(screen.queryByText(/on this device\.$/)).not.toBeInTheDocument()
  })

  it('opens a day when its row is pressed', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelectDay = jest.fn()
    renderPanel({ onSelectDay })

    await user.click(screen.getByRole('button', { name: 'Mon 24 Aug — 3 solved.' }))

    expect(onSelectDay).toHaveBeenCalledWith('2026-08-24')
  })

  // "All solved" is the same series as "3 solved" and reports a win. The row stops being a control
  // because there is nothing behind it -- see DayRow.
  it('reports a finished day as all solved and does not make it a control', () => {
    renderPanel()

    expect(screen.getByText('Fri 21 Aug — all solved.')).toBeInTheDocument()
    expect(screen.getAllByText('All solved')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Fri 21 Aug/ })).not.toBeInTheDocument()
  })

  // A day that IS on the device and has been left alone keeps its zero. It is a fact about the
  // player there -- this day is here and you have not touched it -- which is exactly what it is not
  // on a day the device has never held.
  it('keeps the zero on a day that is here and untouched', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Sun 23 Aug — 0 solved.' })).toBeInTheDocument()
  })

  it('marks today', () => {
    renderPanel({ days: [summary('2026-08-25', 3, 'hasUnsolved')] })

    expect(screen.getByRole('button', { name: 'Tue 25 Aug, today — 3 solved.' })).toHaveAttribute(
      'aria-current',
      'date',
    )
  })

  // The clock is injected and must reach the labels. crumbLabel adds a year only when the day's year
  // differs from the current one, so a panel calling it bare would read the wall clock -- passing
  // today and spelling a different string from 2027 on, with no test able to pin it.
  it('spells a day from an earlier year with its year', () => {
    renderPanel({ days: [summary('2025-12-31', 1, 'hasUnsolved')] })

    expect(screen.getByRole('button', { name: 'Wed, 31 Dec 2025 — 1 solved.' })).toBeInTheDocument()
  })

  it('dismisses', async () => {
    const user = userEvent.setup({ delay: null })
    const onDismiss = jest.fn()
    renderPanel({ onDismiss })

    await user.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // The panel is what a control elsewhere points aria-controls at, so its id has to be on the
  // element that actually holds the content. An aria-controls that resolves to nothing rots in
  // total silence -- every role query keeps passing. Asserted ON the region rather than by looking
  // the id up in the document, which would pass if any element anywhere carried it.
  it('carries the id it was given on the region', () => {
    renderPanel()

    expect(screen.getByRole('region', { name: 'Choose a day' })).toHaveAttribute('id', 'day-panel')
  })

  // The panel BUILDS its own aria-labelledby from panelId. That IDREF does contribute a name, so the
  // role query below fails when it breaks -- and the explicit resolution says which end broke.
  it('names the region from its heading', () => {
    renderPanel()

    const region = screen.getByRole('region', { name: 'Choose a day' })

    expect(document.getElementById(region.getAttribute('aria-labelledby') ?? '')).toHaveTextContent('Choose a day')
  })
})

describe('DayPanel, older days', () => {
  const openMarch = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-03')
  }

  it('offers a month control', () => {
    renderPanel()

    expect(screen.getByRole('combobox', { name: 'Month' })).toBeInTheDocument()
  })

  it('says what naming a day does', () => {
    renderPanel()

    expect(screen.getByText('Name a day and Lull brings the whole day back.')).toBeInTheDocument()
  })

  it('lists that month’s days once a month is chosen', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await openMarch(user)

    expect(screen.getByRole('heading', { name: 'March 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sat 14 Mar/ })).toBeInTheDocument()
  })

  // The month list BUILDS this IDREF from panelId. It names the list, so the role query fails when
  // it breaks -- and resolving it explicitly says which end did.
  it('names the month list from its heading', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await openMarch(user)
    const list = screen.getByRole('list', { name: 'March 2026' })

    expect(document.getElementById(list.getAttribute('aria-labelledby') ?? '')).toHaveTextContent('March 2026')
  })

  it('asks for a day that is not on the device', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    renderPanel({ onRequestDay })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: /Sat 14 Mar/ }))

    expect(onRequestDay).toHaveBeenCalledWith('2026-03-14')
  })

  // A month never played was thirty-one identical rows of "0 solved" -- a scorecard of failure
  // rather than a list of days that can be fetched -- and nothing in the name told a screen-reader
  // user that pressing one fetches a day. The row that costs a thirty-second round trip now says so.
  it('says what the press does instead of counting nothing on a day it never held', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await openMarch(user)
    const march = within(screen.getByRole('list', { name: 'March 2026' }))

    expect(march.getByRole('button', { name: 'Sat 14 Mar — bring this day back.' })).toBeInTheDocument()
    expect(march.queryByText('0 solved')).not.toBeInTheDocument()
  })

  // Solved ids outlive the packs they name, so a day with no pack anywhere still has a count. It is
  // read out of one pass over the whole solved set, shared by every row: summarizeDay is O(solved)
  // per call, and thirty-one calls against a set that is never pruned is the render this avoids.
  it('counts what was solved on a day it does not hold', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({
      solved: new Set(['2026-03-14:cryptogram:aa', '2026-03-14:gofigure:bb', '2026-03-02:phrazle:cc']),
    })

    await openMarch(user)
    const march = within(screen.getByRole('list', { name: 'March 2026' }))

    expect(march.getByRole('button', { name: 'Sat 14 Mar — 2 solved. Bring this day back.' })).toBeInTheDocument()
    expect(march.getByText('2 solved')).toBeInTheDocument()
  })

  it('says Lull began in January and offers nothing before it', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-01')

    expect(screen.getByText('Lull began on 1 January 2026. There is nothing before it.')).toBeInTheDocument()
  })

  it('says nothing about January under any other month', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await openMarch(user)

    expect(screen.queryByText(/Lull began on 1 January 2026/)).not.toBeInTheDocument()
  })

  // The live region is mounted EMPTY before any press and never hidden. A region inserted with its
  // message already in it is routinely missed by NVDA and JAWS, which is the trap both
  // components/shelf and components/puzzle-frame document.
  it('mounts an empty live region before anything is asked for', () => {
    renderPanel()

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces a request in flight', () => {
    renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    expect(screen.getByRole('status')).toHaveTextContent('Bringing back Saturday 14 March…')
  })

  // A REGION THAT REMOUNTS NEVER ANNOUNCES. Assertions on the node found after the change cannot see
  // that: they pass just as well against a fresh node inserted with its text already in it, which is
  // the case screen readers routinely miss. So the reference is taken BEFORE the request exists and
  // the same reference is asserted after.
  it('announces into the region it already mounted rather than a new one', () => {
    const { rerender } = renderPanel()
    const region = screen.getByRole('status')

    rerender(panel({ request: { date: '2026-03-14', state: 'pending' } }))

    expect(region).toHaveTextContent('Bringing back Saturday 14 March…')
    expect(region).toBe(screen.getByRole('status'))
  })

  it('warns the wait is long and says what still opens', () => {
    renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    expect(
      screen.getByText('This can take up to half a minute. The days already on this device still open right away.'),
    ).toBeInTheDocument()
  })

  // aria-busy rides the month list -- the thing whose rows are actually mid-update -- and the live
  // region is outside it. aria-busy on an ANCESTOR of a live region tells assistive technology to
  // hold announcements from inside it until the flag clears, so a region nested in the busy element
  // would go silent for exactly as long as it had something to say. Asserting the flag alone cannot
  // see that: it passes with the region moved back inside.
  it('marks the month list busy while a day is on its way and leaves the live region outside it', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    await openMarch(user)

    expect(screen.getByRole('list', { name: 'March 2026' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status').closest('[aria-busy]')).toBeNull()
  })

  it('leaves the month list idle when nothing was asked for', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await openMarch(user)

    expect(screen.getByRole('list', { name: 'March 2026' })).toHaveAttribute('aria-busy', 'false')
  })

  it('says a day is on its way in its own row', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    await openMarch(user)

    expect(screen.getByText('On its way')).toBeInTheDocument()
  })

  // WCAG 2.5.3: the visible text has to be CONTAINED IN the accessible name, and a request name
  // replaces the ordinary one outright -- so the row wearing a visible "Today" needs the word in its
  // name for the whole wait, or speech input loses its handle on it.
  //
  // The state is an ordinary morning east of UTC and not a corner: today's pack has not been
  // generated yet, so today is not among the days on the device, so today's row in the month list is
  // one that ASKS. Both ends are asserted here, because the visible tag and the spoken one are built
  // in two different files with nothing tying them together.
  it('keeps the visible Today tag in the name of a day being fetched', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ days: SEVEN.slice(1), request: { date: '2026-08-25', state: 'pending' } })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-08')
    const august = within(screen.getByRole('list', { name: 'August 2026' }))

    expect(august.getByRole('button', { name: 'Tue 25 Aug, today — on its way.' })).toBeInTheDocument()
    expect(august.getByText('Today')).toBeInTheDocument()
  })

  // THE PRESS NEVER UNMOUNTS ITS OWN TARGET. A day being fetched keeps its button: taking the
  // control away for the length of the wait replaces the <button> the keyboard is sitting on with a
  // <div>, and focus falls to <body> (WCAG 2.4.3). Pressing again just asks again.
  it('keeps a day that is being fetched pressable', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    renderPanel({ onRequestDay, request: { date: '2026-03-14', state: 'pending' } })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Sat 14 Mar — on its way.' }))

    expect(onRequestDay).toHaveBeenCalledWith('2026-03-14')
  })

  // The one transition where a control genuinely has to go: a 404 turns its row into a plain <div>.
  // Something has to catch the keyboard, or the next Tab restarts at the top of the document -- and
  // permanently, because a 404 never resolves.
  it('catches the keyboard when a 404 takes the row out from under it', async () => {
    const user = userEvent.setup({ delay: null })
    const { rerender } = renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Sat 14 Mar — on its way.' }))
    rerender(panel({ request: { date: '2026-03-14', state: 'empty' } }))

    expect(document.body).not.toHaveFocus()
    expect(screen.getByRole('status')).toHaveFocus()
  })

  // The other half of that guard, and the reason it is a guard rather than an unconditional move: a
  // request ending is not permission to take the keyboard off whatever the reader is doing. Focus
  // moves only where it was actually lost.
  it('leaves focus alone when a request ends without taking a control away', async () => {
    const user = userEvent.setup({ delay: null })
    const { rerender } = renderPanel({ request: { date: '2026-03-14', state: 'pending' } })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    rerender(panel({ request: { date: '2026-03-14', state: 'landed' } }))

    expect(screen.getByRole('button', { name: 'Never mind' })).toHaveFocus()
  })

  // THE SECOND TRANSITION THAT TAKES A CONTROL AWAY, and it takes it without anyone pressing
  // anything: the <select> is replaced by the offline button face, so a reader who had tabbed to the
  // field loses the keyboard to <body> and the next Tab restarts at the top of the document (WCAG
  // 2.4.3). The field is still there wearing another shape, so that is where the keyboard goes.
  it('catches the keyboard when the connection drops out from under the month field', async () => {
    const user = userEvent.setup({ delay: null })
    const { rerender } = renderPanel()

    await user.click(screen.getByRole('combobox', { name: 'Month' }))
    rerender(panel({ isOnline: false }))

    expect(document.body).not.toHaveFocus()
    expect(screen.getByRole('button', { name: 'Choose a month' })).toHaveFocus()
  })

  // The same drop with a month open, which unmounts the whole list rather than substituting one
  // control for another -- so the row holding the keyboard has no replacement of its own, and the
  // field it belongs under is the destination for both halves.
  it('catches the keyboard when the connection drops out from under the month list', async () => {
    const user = userEvent.setup({ delay: null })
    const { rerender } = renderPanel()

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Sat 14 Mar — bring this day back.' }))
    rerender(panel({ isOnline: false }))

    expect(document.body).not.toHaveFocus()
    expect(screen.getByRole('button', { name: 'Choose a month' })).toHaveFocus()
  })

  // The guard, and the reason it is a guard rather than an unconditional move: losing a connection is
  // not permission to take the keyboard off whatever the reader is doing. "Never mind" survives the
  // drop, so nothing is moved.
  it('leaves focus alone when the connection drops under a control that stays', async () => {
    const user = userEvent.setup({ delay: null })
    const { rerender } = renderPanel()

    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    rerender(panel({ isOnline: false }))

    expect(screen.getByRole('button', { name: 'Never mind' })).toHaveFocus()
  })

  it('announces a day that landed', () => {
    renderPanel({ request: { date: '2026-03-14', state: 'landed' } })

    expect(screen.getByRole('status')).toHaveTextContent('Saturday 14 March is here.')
  })

  it('says a landed day is here now in its own row', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ request: { date: '2026-03-14', state: 'landed' } })

    await openMarch(user)

    expect(screen.getByRole('button', { name: 'Sat 14 Mar — here now.' })).toBeInTheDocument()
    expect(screen.getByText('Here now')).toBeInTheDocument()
  })

  // `days` is the shelf's retention window, so a March day that has just arrived is not in it. Left
  // to fall through, the row reading "Here now" asked for the day a SECOND time and put it straight
  // back into flight.
  it('opens a day that has landed rather than asking for it again', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    const onSelectDay = jest.fn()
    renderPanel({ onRequestDay, onSelectDay, request: { date: '2026-03-14', state: 'landed' } })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Sat 14 Mar — here now.' }))

    expect(onSelectDay).toHaveBeenCalledWith('2026-03-14')
    expect(onRequestDay).not.toHaveBeenCalled()
  })

  // An empty day is PERMANENT -- get-pack-by-date answers 404 when nothing could be generated -- so
  // no retry is offered and the row stops being a control.
  it('says a retry will not help when the day is empty', () => {
    renderPanel({ request: { date: '2026-03-14', state: 'empty' } })

    expect(screen.getByRole('status')).toHaveTextContent('There are no puzzles for Saturday 14 March.')
    expect(screen.getByText('Trying again won’t help. Choose another day.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
  })

  it('stops the empty day being a control', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ request: { date: '2026-03-14', state: 'empty' } })

    await openMarch(user)

    expect(screen.getByText('Sat 14 Mar — no puzzles.')).toBeInTheDocument()
    expect(screen.getByText('No puzzles')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sat 14 Mar/ })).not.toBeInTheDocument()
  })

  // A dropped connection is TRANSIENT, so a retry is the right offer. The two failures must not
  // share words -- that is how a player learns to distrust a button.
  it('offers a retry when the connection dropped', () => {
    renderPanel({ request: { date: '2026-03-14', state: 'failed' } })

    expect(screen.getByRole('status')).toHaveTextContent('Saturday 14 March didn’t arrive.')
    expect(screen.getByText('The connection dropped before the day came back.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again — Saturday 14 March.' })).toBeInTheDocument()
  })

  it('keeps the day that did not arrive pressable', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel({ request: { date: '2026-03-14', state: 'failed' } })

    await openMarch(user)

    expect(screen.getByRole('button', { name: 'Sat 14 Mar — didn’t arrive. Try again.' })).toBeInTheDocument()
    expect(screen.getByText('Didn’t arrive')).toBeInTheDocument()
  })

  // A CONTROL THAT CANNOT DO THE THING IT NAMES IS WORSE THAN NO CONTROL -- the rule the month face
  // and the standing offer are already withheld on, applied to the last control that was exempt from
  // it. Offline this button round-trips through `pending` back to the identical failure in
  // milliseconds: it names a retry and delivers the refusal it was pressed to escape. The note under
  // the month face is on screen in exactly this state and says what the button could not do.
  it('withholds the retry offline and leaves the note to say why', () => {
    renderPanel({ isOnline: false, request: { date: '2026-03-14', state: 'failed' } })
    const face = screen.getByRole('button', { name: 'Choose a month' })

    expect(screen.queryByRole('button', { name: /^Try again/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saturday 14 March didn’t arrive.')
    expect(document.getElementById(face.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'Older days need a connection. Try again while you’re online.',
    )
  })

  it('asks again for the same day when the retry is pressed', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    renderPanel({ onRequestDay, request: { date: '2026-03-14', state: 'failed' } })

    await user.click(screen.getByRole('button', { name: 'Try again — Saturday 14 March.' }))

    expect(onRequestDay).toHaveBeenCalledWith('2026-03-14')
  })

  it('leaves every other row alone while one day is being asked for', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    renderPanel({ onRequestDay, request: { date: '2026-03-14', state: 'empty' } })

    await openMarch(user)
    await user.click(screen.getByRole('button', { name: 'Sun 15 Mar — bring this day back.' }))

    expect(onRequestDay).toHaveBeenCalledWith('2026-03-15')
  })

  // A native <select> ignores aria-disabled, so leaving it live offline would walk a screen-reader
  // user to a day the app cannot go and get.
  it('replaces the month select with an aria-disabled face when offline', () => {
    renderPanel({ isOnline: false })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a month' })).toHaveAttribute('aria-disabled', 'true')
  })

  // The caption is what makes the two states read as ONE field. The <label> is the combobox's name
  // online; offline the face carries its own name and the caption stays above it, so the control
  // does not go from "Month" to "Choose a month" with nothing over it the moment a connection drops.
  it('keeps the field’s caption when it goes offline', () => {
    renderPanel({ isOnline: false })

    expect(screen.getByText('Month')).toBeInTheDocument()
  })

  // aria-disabled, never disabled: a browser blurs an element that becomes disabled while it holds
  // focus, and focus falls to <body>.
  it('disables nothing in the DOM', () => {
    renderPanel({ isOnline: false })

    expect(document.querySelector('[disabled]')).toBeNull()
  })

  it('explains why older days cannot be reached offline', () => {
    renderPanel({ isOnline: false })

    const face = screen.getByRole('button', { name: 'Choose a month' })

    // aria-describedby contributes no name, so it can rot in total silence. Resolve it explicitly.
    expect(document.getElementById(face.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'Older days need a connection. Try again while you’re online.',
    )
  })

  it('still watches one live region when offline', () => {
    renderPanel({ isOnline: false })

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the seven days pressable offline', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelectDay = jest.fn()
    renderPanel({ isOnline: false, onSelectDay })

    await user.click(screen.getByRole('button', { name: 'Mon 24 Aug — 3 solved.' }))

    expect(onSelectDay).toHaveBeenCalledWith('2026-08-24')
  })

  // A day already here opens rather than being asked for twice.
  it('opens a month-list day that is already on the device', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    const onSelectDay = jest.fn()
    renderPanel({ onRequestDay, onSelectDay })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-08')
    await user.click(screen.getByRole('button', { name: 'Mon 24 Aug, here — 3 solved. Already on this device.' }))

    expect(onSelectDay).toHaveBeenCalledWith('2026-08-24')
    expect(onRequestDay).not.toHaveBeenCalled()
  })

  // The same day, in two lists, one press behavior. A finished day is not a control in the seven
  // above, so it must not become one in its own month -- and a row that is pressable in one list and
  // dead in the other teaches nothing about either.
  it('leaves a finished day dead in the month list too', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-08')

    expect(screen.getAllByText('Fri 21 Aug, here — all solved. Already on this device.')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Fri 21 Aug/ })).not.toBeInTheDocument()
  })

  // TODAY, ONCE TODAY IS FINISHED, is the state DayRow says matters most: a dead row that still has
  // to announce which day it is. aria-current rides the <li> on that branch, because the row element
  // inside it is a plain <div> whose generic role makes exposure of any ARIA state on it a coin
  // flip. Nothing looked at this row before, in either list.
  it('marks today in the month list even once it is dead', async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '2026-08')
    const august = within(screen.getByRole('list', { name: 'August 2026' }))

    expect(august.getByText('Tue 25 Aug, today — all solved.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tue 25 Aug, today — all solved.' })).not.toBeInTheDocument()
    expect(august.getByText('Tue 25 Aug, today — all solved.').closest('li')).toHaveAttribute('aria-current', 'date')
  })
})

// There is no pack, therefore no date plate, therefore nowhere for the disclosure control to live:
// the shelf renders this panel in the open and it becomes the screen. Every difference is derived
// from an empty `days`, because two of the four pieces are inside this layout -- a wrapper supplying
// them would leave a panel headed "Choose a day" under a second heading reading "Bring a day back".
describe('DayPanel, on a device with no days', () => {
  it('leads with bringing a day back rather than choosing one', () => {
    renderPanel({ days: [] })

    expect(screen.getByRole('heading', { name: 'Bring a day back' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Choose a day' })).not.toBeInTheDocument()
    expect(screen.getByText('Any day')).toBeInTheDocument()
    expect(screen.queryByText('Older days')).not.toBeInTheDocument()
  })

  it('says the wait is optional and how far back the field reaches', () => {
    renderPanel({ days: [] })

    expect(
      screen.getByText('You don’t have to wait. Name a day and Lull brings the whole day back.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Any day back to 1 January 2026.')).toBeInTheDocument()
  })

  // An empty <ul> is still a list to a screen reader -- "list, 0 items" -- and this is the one
  // screen where there would be nothing in it.
  it('renders no list at all rather than an empty one', () => {
    renderPanel({ days: [] })

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('asks for today from its one primary', async () => {
    const user = userEvent.setup({ delay: null })
    const onRequestDay = jest.fn()
    renderPanel({ days: [], onRequestDay })

    await user.click(screen.getByRole('button', { name: 'Bring back today, Tuesday 25 August.' }))

    expect(onRequestDay).toHaveBeenCalledWith('2026-08-25')
  })

  // The accent is spent once per surface. A failed request means a request was already made, so the
  // standing offer stands down and the retry is the one filled control on the screen.
  it('stands the standing offer down while a retry is on screen', () => {
    renderPanel({ days: [], request: { date: '2026-03-14', state: 'failed' } })

    expect(screen.queryByRole('button', { name: /Bring back today/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again — Saturday 14 March.' })).toBeInTheDocument()
  })

  // It stays through the wait, for the same reason the row being fetched stays a button: unmounting
  // the control that was just pressed drops focus to <body>.
  it('keeps the offer on screen while today is on its way', () => {
    renderPanel({ days: [], request: { date: '2026-08-25', state: 'pending' } })

    expect(screen.getByRole('button', { name: 'Bring back today, Tuesday 25 August.' })).toBeInTheDocument()
  })

  // A CONTROL THAT CANNOT DO THE THING IT NAMES IS WORSE THAN NO CONTROL -- the same argument the
  // offline month face and the stood-down standing offer are already made on, applied to the one
  // control left that could not keep its promise.
  //
  // On this screen the panel IS the page: there is no date plate above it, nothing hidden behind
  // it, and no control it was disclosed from. "Never mind" had nowhere to go back to, so the press
  // closed nothing, revealed nothing and moved the keyboard nowhere.
  it('offers no way to dismiss the screen it has become', () => {
    renderPanel({ days: [] })

    expect(screen.queryByRole('button', { name: 'Never mind' })).not.toBeInTheDocument()
  })

  // Offline the month face refuses the press and says why. A live primary a few pixels above it,
  // promising the same trip, would be the same broken promise the face exists to refuse.
  it('offers nothing it cannot fetch when offline', () => {
    renderPanel({ days: [], isOnline: false })

    expect(screen.queryByRole('button', { name: /Bring back today/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a month' })).toHaveAttribute('aria-disabled', 'true')
  })
})
