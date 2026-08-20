import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { HintDrawer } from './index'
import { writeHints } from '@services/storage'
import { missingVowelsHints, missingVowelsPuzzleId } from '@test/__mocks__'

describe('HintDrawer', () => {
  const setup = (): void => {
    window.localStorage.clear()
  }

  const renderDrawer = (): ReturnType<typeof render> =>
    render(<HintDrawer hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

  const reveal = async (): Promise<void> => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Reveal hint/ }))
  }

  // The same control after the last rung opens. It is never unmounted, so it is still clickable and
  // still focusable -- which is the whole point of aria-disabled over `disabled`.
  const clickSpentReveal = async (): Promise<void> => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'All hints revealed' }))
  }

  // The compact variant, for a shell with no vertical space to give. Everything else about the
  // drawer is identical, which is the point -- it is a layout switch, not a second drawer.
  describe('compact', () => {
    it('drops the visible heading', () => {
      setup()

      render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      expect(screen.queryByRole('heading', { name: 'Hints' })).not.toBeInTheDocument()
    })

    // The heading goes; the NAME does not. A landmark a screen-reader user can still jump to and
    // still hear called "Hints" is what makes dropping the visible copy free.
    it('keeps the region named', () => {
      setup()

      render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      expect(screen.getByRole('region', { name: 'Hints' })).toBeInTheDocument()
    })

    it('still offers the ladder', () => {
      setup()

      render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      expect(screen.getByRole('button', { name: 'Reveal hint 1 of 3' })).toBeInTheDocument()
    })

    it('keeps the heading when it is not asked to drop it', () => {
      setup()

      renderDrawer()

      expect(screen.getByRole('heading', { name: 'Hints' })).toBeInTheDocument()
    })

    // The compact list is the only one that scrolls, and every rung in it is plain text -- so
    // nothing inside it can take focus and the list has to take focus itself, or the rungs below the
    // fold are reachable with a mouse and with nothing else. jest-axe cannot stand in for this:
    // jsdom lays nothing out, so scrollHeight is 0 and scrollable-region-focusable never fires.
    it('puts the scrolling list in the tab order', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)
      render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      // Opens the ladder and leaves focus on the toggle, so the next stop is the list itself.
      await toggleFold()
      await userEvent.tab()

      expect(screen.getByRole('list')).toHaveFocus()
    })

    // The flowed drawer does not scroll, so the list must NOT be a tab stop: a focusable element
    // that does nothing when focused is a stop a keyboard user pays for and gets nothing from.
    // The tab stop is also the only observable half of the pair here -- the max-height cannot be
    // asserted at all, since CLAUDE.md forbids style assertions and jsdom lays nothing out to
    // measure -- and both come off the same `compact` condition on the same element, so this is
    // what holds the bound to the docked layout too.
    it('leaves the flowed list out of the tab order', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)
      renderDrawer()

      await toggleFold()
      await userEvent.tab()

      expect(screen.getByRole('list')).not.toHaveFocus()
      expect(screen.getByRole('button', { name: 'All hints revealed' })).toHaveFocus()
    })

    it('has no axe violations', async () => {
      setup()

      const { container } = render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations with every rung open', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)
      const { container } = render(<HintDrawer compact hints={missingVowelsHints} puzzleId={missingVowelsPuzzleId} />)

      await toggleFold()

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  // Matches the toggle in both its states -- "Show 2 revealed hints" and "Hide 2 revealed hints"
  // are the same control, and a test that had to name the state could not press it twice.
  const toggleFold = async (): Promise<void> => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /revealed hint/ }))
  }

  // Counted off the accessibility tree, not the DOM: a folded rung is still parsed and still
  // findable by text, and what the fold has to change is whether a reader can reach it.
  const openRungs = (): HTMLElement[] => screen.queryAllByRole('listitem')

  describe('the ladder', () => {
    it('shows no rung before the player asks', () => {
      setup()

      renderDrawer()

      expect(screen.queryByText(missingVowelsHints[0])).not.toBeInTheDocument()
    })

    // "Reveal hint 1 of 3" at zero revealed: the label counts the rung about to open, not the ones
    // already open.
    it('names the rung the button will open', () => {
      setup()

      renderDrawer()

      expect(screen.getByRole('button', { name: 'Reveal hint 1 of 3' })).toBeInTheDocument()
    })

    it('opens the rungs in order', async () => {
      setup()
      renderDrawer()

      await reveal()

      expect(screen.getByText(missingVowelsHints[0])).toBeInTheDocument()
      expect(screen.queryByText(missingVowelsHints[1])).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reveal hint 2 of 3' })).toBeInTheDocument()
    })

    it('stops offering a reveal once every rung is open', async () => {
      setup()
      renderDrawer()

      await reveal()
      await reveal()
      await reveal()

      expect(screen.getByText(missingVowelsHints[2])).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Reveal hint/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'All hints revealed' })).toBeInTheDocument()
    })

    // The last press cannot be allowed to unmount the control it landed on: focus would fall to
    // <body> and the next Tab would restart at the top of the page.
    it('keeps focus on the reveal button after the last rung opens', async () => {
      setup()
      renderDrawer()

      await reveal()
      await reveal()
      await reveal()

      expect(screen.getByRole('button', { name: 'All hints revealed' })).toHaveFocus()
    })

    it('does nothing when the spent reveal button is pressed', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)
      renderDrawer()

      await clickSpentReveal()

      expect(openRungs()).toHaveLength(0)
      expect(window.localStorage.getItem(`lull:hints:${missingVowelsPuzzleId}`)).toBe('3')
      expect(screen.getByRole('button', { name: 'Show 3 revealed hints' })).toBeInTheDocument()
    })

    // Reveal state is written independently of solve state and is never cleared by solving, so
    // reopening a puzzle still owes the player the rungs they already paid for.
    it('restores the rungs already opened', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 2)
      renderDrawer()

      await toggleFold()

      expect(screen.getByText(missingVowelsHints[1])).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reveal hint 3 of 3' })).toBeInTheDocument()
    })

    // Under the docked layout the list is bounded and scrolls, because Cryptogram's phrase cap is
    // 98px at a 320 viewport against a 96px floor and three open rungs would push it under. What a
    // test can hold is that a full ladder costs nothing either way: every revealed hint is still in
    // the accessibility tree and still reachable, scrolled to or not. The height itself is
    // unassertable here -- CLAUDE.md forbids style assertions, and jsdom lays nothing out anyway.
    it('keeps every revealed hint reachable once the list is full', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)

      renderDrawer()
      await toggleFold()

      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(missingVowelsHints)
    })

    it('persists a reveal', async () => {
      setup()
      renderDrawer()

      await reveal()

      expect(window.localStorage.getItem(`lull:hints:${missingVowelsPuzzleId}`)).toBe('1')
    })
  })

  describe('folding', () => {
    it('offers nothing to fold while every rung is shut', () => {
      setup()

      renderDrawer()

      expect(screen.queryByRole('button', { name: /revealed hint/ })).not.toBeInTheDocument()
    })

    it('offers to fold the moment a rung opens', async () => {
      setup()
      renderDrawer()

      await reveal()

      expect(screen.getByRole('button', { name: 'Hide 1 revealed hint' })).toBeInTheDocument()
    })

    it('folds the open rungs away', async () => {
      setup()
      renderDrawer()
      await reveal()
      await reveal()

      await toggleFold()

      expect(openRungs()).toHaveLength(0)
    })

    // Folded is not lost. The control that folded them says how many are waiting, so the player is
    // never asked to remember what they opened.
    it('says how many rungs it folded away', async () => {
      setup()
      renderDrawer()
      await reveal()
      await reveal()

      await toggleFold()

      expect(screen.getByRole('button', { name: 'Show 2 revealed hints' })).toBeInTheDocument()
    })

    it('unfolds them again', async () => {
      setup()
      renderDrawer()
      await reveal()
      await toggleFold()

      await toggleFold()

      expect(openRungs()).toHaveLength(1)
    })

    // The count in lull:hints is the source of truth for what the player revealed, and folding is a
    // view. It must never look like a rung was handed back.
    it('un-reveals nothing', async () => {
      setup()
      renderDrawer()
      await reveal()
      await reveal()

      await toggleFold()

      expect(window.localStorage.getItem(`lull:hints:${missingVowelsPuzzleId}`)).toBe('2')
    })

    it('keeps offering the next rung while folded', async () => {
      setup()
      renderDrawer()
      await reveal()

      await toggleFold()

      expect(screen.getByRole('button', { name: 'Reveal hint 2 of 3' })).toBeInTheDocument()
    })

    // Revealing from a folded drawer has to show the rung it just opened, or the reveal button
    // reads as broken.
    it('unfolds when the player opens another rung', async () => {
      setup()
      renderDrawer()
      await reveal()
      await toggleFold()

      await reveal()

      expect(openRungs()).toHaveLength(2)
    })

    // The fold is view state and is not persisted. A returning player gets the board back at full
    // height and the ladder one tap away, named with its count.
    it('comes up folded when the player returns', () => {
      setup()
      writeHints(missingVowelsPuzzleId, 2)

      renderDrawer()

      expect(openRungs()).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Show 2 revealed hints' })).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    // A newly revealed rung is appended inside a region the reader is already watching. A
    // role="status" element inserted with its content already in it is routinely missed by NVDA and
    // JAWS, which is why the region is mounted empty from the start.
    it('announces newly revealed rungs in a live region', async () => {
      setup()
      renderDrawer()

      await reveal()

      expect(screen.getByRole('status')).toHaveTextContent(missingVowelsHints[0])
    })

    // role="status" carries an implicit aria-atomic="true" in ARIA 1.2, under which revealing rung
    // 3 re-reads rungs 1 and 2 with it. The explicit "false" is what makes one rung one
    // announcement.
    it('announces only the new rung rather than the whole ladder', () => {
      setup()
      writeHints(missingVowelsPuzzleId, 2)

      renderDrawer()

      expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'false')
    })

    // aria-disabled, never `disabled`: a browser blurs a disabled element, focus lands on <body>,
    // and the next Tab restarts at the top of the page.
    it('marks the spent reveal button disabled without removing it from the tab order', () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)

      renderDrawer()

      const button = screen.getByRole('button', { name: 'All hints revealed' })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).not.toHaveAttribute('disabled')
    })

    it('reports the fold state on the toggle', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 1)
      renderDrawer()

      const folded = screen.getByRole('button', { name: /revealed hint/ }).getAttribute('aria-expanded')
      await toggleFold()

      expect(folded).toBe('false')
      expect(screen.getByRole('button', { name: /revealed hint/ })).toHaveAttribute('aria-expanded', 'true')
    })

    it('points the toggle at the list it folds', () => {
      setup()
      writeHints(missingVowelsPuzzleId, 1)

      renderDrawer()

      const controls = screen.getByRole('button', { name: /revealed hint/ }).getAttribute('aria-controls')
      expect(document.getElementById(`${controls}`)).toBeInTheDocument()
    })

    it('has no axe violations', async () => {
      setup()

      const { container } = renderDrawer()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations folded', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)

      const { container } = renderDrawer()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations with every rung open', async () => {
      setup()
      writeHints(missingVowelsPuzzleId, 3)
      const { container } = renderDrawer()

      await toggleFold()

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
