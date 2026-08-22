import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { HintBar } from './index'
import { readHints, writeHints } from '@services/storage'
import { HintLadder } from '@types'

jest.mock('@services/storage')

describe('HintBar', () => {
  const hints: HintLadder = [
    'It is about persistence.',
    'Robert Frost wrote a version of it.',
    "The last word is a preposition doing a verb's job.",
  ]
  const puzzleId = '2026-08-20:cryptogram:4b2c8a1d'

  beforeAll(() => {
    jest.mocked(readHints).mockReturnValue(0)
  })

  const renderBar = (variant?: 'docked' | 'inline'): ReturnType<typeof render> =>
    render(<HintBar hints={hints} puzzleId={puzzleId} variant={variant} />)

  const press = async (name: string): Promise<void> => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name }))
  }

  // Counted off the accessibility tree rather than the DOM: a rung inside the shut sheet is still
  // parsed and still findable by text, and what the sheet has to change is whether a reader can
  // reach it.
  const openRungs = (): string[] => screen.queryAllByRole('listitem').map((rung) => String(rung.textContent))

  const sheet = (): HTMLElement | null => screen.queryByRole('region', { name: 'Open hints' })

  describe('the ladder', () => {
    it('offers the first rung and shows none of them', () => {
      renderBar()

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
      expect(openRungs()).toHaveLength(0)
    })

    it('opens the rung it named', async () => {
      renderBar()

      await press('Open hint 1 of 3')

      expect(openRungs()).toEqual([hints[0]])
      expect(screen.getByRole('button', { name: 'Open hint 2 of 3' })).toBeInTheDocument()
    })

    it('persists the count it just opened', async () => {
      renderBar()

      await press('Open hint 1 of 3')

      expect(writeHints).toHaveBeenCalledWith(puzzleId, 1)
    })

    // Read once, at mount. The frame keys this component on the puzzle id, so re-reading on every
    // render would hand it back its own writes.
    it('reads the stored count once and never again', async () => {
      renderBar()

      await press('Open hint 1 of 3')

      expect(readHints).toHaveBeenCalledTimes(1)
    })

    // Storage holds the COUNT and nothing else, so the sheet has no memory to come back from. A
    // player who read a hint yesterday did not ask for it over the board again today -- the board
    // is what they came back for, and the rungs are one press away.
    it('comes back shut for a returning player', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(sheet()).not.toBeInTheDocument()
      expect(openRungs()).toHaveLength(0)
    })

    // Shut is not unopened, and this is the whole reason the control reads the sheet before it
    // reads the ladder. With the bar coming back shut, a control that only ever opened the NEXT
    // rung would charge a returning player a hint to re-read the two they had already paid for.
    it('offers a returning player the rungs they own rather than the next one', () => {
      jest.mocked(readHints).mockReturnValueOnce(2)

      renderBar()

      expect(screen.getByRole('button', { name: 'Show 2 hints' })).toBeInTheDocument()
    })

    it('hands those rungs back without spending another', async () => {
      jest.mocked(readHints).mockReturnValueOnce(2)
      renderBar()

      await press('Show 2 hints')

      expect(openRungs()).toEqual([hints[0], hints[1]])
      expect(writeHints).not.toHaveBeenCalled()
    })

    // With the sheet open there is nothing left for the control to reveal but the ladder, so it
    // goes back to being the ladder.
    it('offers the next rung once the sheet is open', async () => {
      jest.mocked(readHints).mockReturnValueOnce(2)
      renderBar()

      await press('Show 2 hints')

      expect(screen.getByRole('button', { name: 'Open hint 3 of 3' })).toBeInTheDocument()
    })

    it('counts one reopened rung in the singular', async () => {
      renderBar()
      await press('Open hint 1 of 3')

      await press('Hide')

      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    it('sets the bar inline when asked to', () => {
      renderBar('inline')

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })
  })

  describe('the spent ladder', () => {
    // Once there is nothing left to reveal the control becomes the sheet's toggle. It used to say
    // "All hints open" and refuse the press, which is a true statement of the state and a useless
    // control: the sheet covers the whole board on a phone, and Escape was its only other exit.
    it('turns into the sheet toggle and opens no new rung', async () => {
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press('Show 3 hints')

      await press('Hide hints')

      expect(screen.getByRole('button', { name: 'Show 3 hints' })).toBeInTheDocument()
      expect(writeHints).not.toHaveBeenCalled()
    })

    it('can be reopened by pointer after it is hidden', async () => {
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press('Show 3 hints')
      await press('Hide hints')

      await press('Show 3 hints')

      expect(screen.getByText('It is about persistence.')).toBeVisible()
    })

    // The relationship the old flowed drawer carried and the first version of this bar dropped.
    it('names the sheet it controls and reports whether it is open', async () => {
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()

      await press('Show 3 hints')

      expect(screen.getByRole('button', { name: 'Hide hints' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: 'Hide hints' })).toHaveAttribute('aria-controls')
    })

    it('reports the sheet shut before it is opened', () => {
      jest.mocked(readHints).mockReturnValueOnce(3)

      renderBar()

      expect(screen.getByRole('button', { name: 'Show 3 hints' })).toHaveAttribute('aria-expanded', 'false')
    })

    // Escape is the only way to reach a shut sheet with every rung open, and "All hints open" there
    // would be a dead end -- the control refuses the press, so nothing would bring them back.
    it('offers the open rungs back once the sheet is shut', async () => {
      const user = userEvent.setup({ delay: null })
      jest.mocked(readHints).mockReturnValueOnce(3)
      renderBar()
      await press('Show 3 hints')
      await user.keyboard('{Escape}')

      await press('Show 3 hints')

      expect(openRungs()).toEqual(hints)
    })
  })

  describe('the sheet', () => {
    it('opens when a rung opens', async () => {
      renderBar()

      await press('Open hint 1 of 3')

      expect(sheet()).toBeInTheDocument()
    })

    it('closes on Escape and hands focus back to the control that opened it', async () => {
      const user = userEvent.setup()
      renderBar()
      await press('Open hint 1 of 3')
      await user.click(screen.getByRole('region', { name: 'Open hints' }))

      await user.keyboard('{Escape}')

      expect(sheet()).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toHaveFocus()
    })

    it('stays open under any other key', async () => {
      const user = userEvent.setup()
      renderBar()
      await press('Open hint 1 of 3')

      await user.keyboard('{ArrowDown}')

      expect(sheet()).toBeInTheDocument()
    })

    // The gap this closed. The bar's own control is the LADDER, so while a rung is still unspent it
    // reads "Open hint 2 of 3" and opening is the only thing it can do -- which left a player who
    // simply wanted the phrase back with two exits: Escape, which a touch device does not have, or
    // spending every remaining hint to turn the control into "Hide hints". Wanting to see the board
    // again cost a hint.
    it('can be hidden while rungs are still unspent', async () => {
      renderBar()
      await press('Open hint 1 of 3')

      await press('Hide')

      expect(sheet()).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toBeInTheDocument()
    })

    it('hands focus back to the bar when it is hidden', async () => {
      renderBar()
      await press('Open hint 1 of 3')

      await press('Hide')

      expect(screen.getByRole('button', { name: 'Show 1 hint' })).toHaveFocus()
    })

    // Hiding is not spending. The rung stays open, so the next press of the bar's control offers
    // the rung AFTER it rather than re-charging for the one already read.
    it('opens no rung and spends nothing when it is hidden', async () => {
      renderBar()
      await press('Open hint 1 of 3')

      await press('Hide')

      expect(writeHints).toHaveBeenCalledTimes(1)
    })

    it('offers no way to hide a sheet with nothing in it', () => {
      renderBar()

      expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument()
    })

    it('ignores Escape while it is already shut', async () => {
      const user = userEvent.setup()
      renderBar()
      await user.tab()

      await user.keyboard('{Escape}')

      expect(screen.getByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    // role="status" carries an implicit aria-atomic="true" in ARIA 1.2, under which opening rung 3
    // re-reads rungs 1 and 2 with it. The explicit "false" is what makes one rung one announcement.
    it('announces the new rung rather than the whole ladder', async () => {
      renderBar()

      await press('Open hint 1 of 3')

      const region = screen.getByRole('status')
      expect(region).toHaveAttribute('aria-atomic', 'false')
      expect(region).toHaveTextContent(hints[0])
    })

    // A live region inserted with content already in it is routinely missed by NVDA and JAWS, which
    // announce changes inside a region they are already watching.
    it('mounts the live region empty', () => {
      renderBar()

      expect(screen.getByRole('status').textContent).toBe('')
    })

    it('names the bar', () => {
      renderBar()

      expect(screen.getByRole('region', { name: 'Hints' })).toBeInTheDocument()
    })

    it('has no violations', async () => {
      const { container } = renderBar()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no violations with every rung open', async () => {
      jest.mocked(readHints).mockReturnValueOnce(3)
      const { container } = renderBar()

      await press('Show 3 hints')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
