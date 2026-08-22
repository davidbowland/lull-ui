import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { Button } from './index'

describe('Button', () => {
  const onClick = jest.fn()

  it('calls back when pressed', async () => {
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Check</Button>)

    await user.click(screen.getByRole('button', { name: 'Check' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('presses without a handler', async () => {
    const user = userEvent.setup()
    render(<Button>Check</Button>)

    await user.click(screen.getByRole('button', { name: 'Check' }))

    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
  })

  it('refuses the press when aria-disabled without leaving the tab order', async () => {
    const user = userEvent.setup()
    render(
      <Button aria-disabled onClick={onClick}>
        All hints open
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'All hints open' })

    await user.click(button)

    expect(onClick).not.toHaveBeenCalled()
    expect(button).not.toBeDisabled()
  })

  // The keyboard is where the aria-disabled choice earns itself: the control is still a tab stop,
  // so focus stays where the reader left it instead of falling to <body>.
  it('stays focusable when aria-disabled', async () => {
    const user = userEvent.setup()
    render(
      <Button aria-disabled onClick={onClick}>
        All hints open
      </Button>,
    )

    await user.tab()

    expect(screen.getByRole('button', { name: 'All hints open' })).toHaveFocus()
  })

  // The escape hatch, for the rare control that is genuinely inert and is not holding focus.
  it('refuses the press when truly disabled', async () => {
    const user = userEvent.setup()
    render(
      <Button disabled onClick={onClick}>
        Check
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Check' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled()
  })

  it('keeps the visible label inside the accessible name', () => {
    render(<Button aria-label="Undo the last tile">Undo</Button>)

    expect(screen.getByRole('button', { name: 'Undo the last tile' })).toHaveTextContent('Undo')
  })

  it('never submits the form it sits in', () => {
    render(<Button>Check</Button>)

    expect(screen.getByRole('button', { name: 'Check' })).toHaveAttribute('type', 'button')
  })

  it('names the region a disclosure controls', () => {
    render(
      <Button aria-controls="hints" aria-expanded={true} variant="quiet">
        Hide hints
      </Button>,
    )

    expect(screen.getByRole('button', { expanded: true })).toHaveAttribute('aria-controls', 'hints')
  })

  describe('the trailing nub', () => {
    it('leaves the accessible name to the label alone', () => {
      render(<Button trailing={<span>→</span>}>Install</Button>)

      expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    })

    it('hides itself from assistive technology', () => {
      render(<Button trailing={<span data-testid="arrow">→</span>}>Install</Button>)

      expect(screen.getByTestId('arrow').parentElement).toHaveAttribute('aria-hidden', 'true')
    })
  })

  // One label per variant and size, because a variant is a face and not a different control: the
  // press and the name have to survive the change of clothes.
  describe('faces', () => {
    it.each(['default', 'primary', 'quiet'] as const)('presses as the %s variant', async (variant) => {
      const user = userEvent.setup()
      render(
        <Button onClick={onClick} variant={variant}>
          Check
        </Button>,
      )

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it.each(['md', 'sm'] as const)('presses at the %s size', async (size) => {
      const user = userEvent.setup()
      render(
        <Button onClick={onClick} size={size}>
          Check
        </Button>,
      )

      await user.click(screen.getByRole('button', { name: 'Check' }))

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('takes a caller class without losing the label', () => {
      render(<Button className="w-full">Check</Button>)

      expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no violations', async () => {
      const { container } = render(<Button trailing={<span>→</span>}>Install</Button>)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no violations as the one filled control', async () => {
      const { container } = render(
        <Button size="sm" variant="primary">
          Check
        </Button>,
      )

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no violations when aria-disabled', async () => {
      const { container } = render(
        <Button aria-disabled variant="quiet">
          All hints open
        </Button>,
      )

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
