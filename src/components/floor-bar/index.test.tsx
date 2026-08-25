import { render, screen } from '@testing-library/react'
import React from 'react'

import { FloorBar } from './index'

describe('FloorBar', () => {
  const renderFloor = (message = '', resting?: string, detail?: string): ReturnType<typeof render> =>
    render(
      <FloorBar detail={detail} message={message} resting={resting}>
        <button type="button">A</button>
      </FloorBar>,
    )

  it('holds the instrument it is given', () => {
    renderFloor()

    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  })

  // NVDA and JAWS announce changes inside a region they are already watching, so a
  // role="status" element inserted with its message already in it is missed.
  it('mounts the live region empty', () => {
    renderFloor()

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces the message it is given', () => {
    renderFloor('Every Q is T. Three squares filled.')

    expect(screen.getByRole('status')).toHaveTextContent('Every Q is T. Three squares filled.')
  })

  it('does not re-read the whole region on every message', () => {
    renderFloor('Every Q is T.')

    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'false')
  })

  // THE HALF A SIGHTED PLAYER IS ALREADY LOOKING AT. The ribbon is two lines tall, and a bench whose
  // announcement ends in a per-letter transcript of its own board spent both of them on the
  // transcript and then trailed off in an ellipsis -- the clamp deciding badly what the caller
  // should have decided. A detail is announced with the message and drawn nowhere.
  describe('the detail', () => {
    // ONE UTTERANCE, so the region's whole text is the two joined -- with a space, because
    // textContent concatenates adjacent nodes with nothing between them and `HOT HAND.H no more of
    // this letter` is a defect only a screen reader would ever meet.
    it('announces it after the message', () => {
      renderFloor('HOT HAND.', undefined, 'H no more of this letter, O in place.')

      expect(screen.getByRole('status')).toHaveProperty(
        'textContent',
        'HOT HAND. H no more of this letter, O in place.',
      )
    })

    // Split into its OWN node, which is the whole mechanism: the visible span holds the head alone,
    // so the clamp has one short sentence to fit rather than a paragraph to truncate.
    it('leaves the message its own node to be drawn from', () => {
      renderFloor('HOT HAND.', undefined, 'H no more of this letter.')

      expect(screen.getByText('HOT HAND.')).toBeInTheDocument()
    })

    // NEVER ON ITS OWN, for the reason the accent dot is never on its own: text present in a
    // role="status" at mount is announced by nothing and costs the bench its first real
    // announcement. A detail with no message is a caller's mistake, and the band stays empty.
    it('says nothing without a message to attach to', () => {
      renderFloor('', undefined, 'H no more of this letter.')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // Every bench that predates the prop hands nothing, and the region has to read exactly as it did
    // -- no stray space, no empty node.
    it('changes nothing for a bench that hands none', () => {
      renderFloor('Every Q is T.')

      expect(screen.getByRole('status')).toHaveProperty('textContent', 'Every Q is T.')
    })
  })

  // The ribbon is reserved space and it is empty until the player's first move -- on a restored
  // board, for the whole visit. A bench that has something standing to say puts it here rather than
  // leaving 52px of near-black between the board and the instrument.
  describe('the resting line', () => {
    it('says it while there is no message', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByText('Tap a square first, then a letter.')).toBeInTheDocument()
    })

    it('yields the ribbon to a message when one arrives', () => {
      renderFloor('Every Q is T.', 'Tap a square first, then a letter.')

      expect(screen.queryByText('Tap a square first, then a letter.')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Every Q is T.')
    })

    // The whole announcement story rests on the live region being empty at mount: NVDA and JAWS
    // announce changes inside a region they are already watching. A standing line inside it would
    // cost the first message its announcement, so it sits beside the region rather than in it.
    it('stays out of the live region', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('leaves the ribbon empty when a bench has nothing standing to say', () => {
      renderFloor()

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // Out of the live region, but still in the accessibility tree. The line is drawn over the
    // ribbon rather than beside it, and taking it out of flow is a layout move -- hiding it from a
    // screen reader as well would leave the floor saying nothing at all to the player who has the
    // least else to go on, on the one board state where it has something to say.
    it('is read in place rather than hidden from a screen reader', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByText('Tap a square first, then a letter.').closest('[aria-hidden="true"]')).toBeNull()
    })
  })
})
