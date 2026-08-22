import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import React from 'react'

import { Plate, Shell } from './index'

describe('Enclosure', () => {
  it('wraps its children in a shell', () => {
    render(
      <Shell>
        <Plate>Today</Plate>
      </Shell>,
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders a plate on its own, for a surface that is already enclosing', () => {
    render(<Plate>Make 154</Plate>)

    expect(screen.getByText('Make 154')).toBeInTheDocument()
  })

  // The escape hatch both halves carry, so a caller can add layout without the
  // enclosure growing a prop for every surface that uses it.
  it('lets a caller add its own classes to either half', () => {
    render(
      <Shell className="shell-extra">
        <Plate className="plate-extra">Today</Plate>
      </Shell>,
    )
    const plate = screen.getByText('Today')

    expect(plate).toHaveClass('plate-extra')
    expect(plate.parentElement).toHaveClass('shell-extra')
  })

  // Neither half is a landmark, a region, or a group: this is a drawn edge and nothing
  // more, so it must add no structure a screen reader has to walk past.
  it('adds no landmark or role of its own', async () => {
    const { container } = render(
      <Shell>
        <Plate>Today</Plate>
      </Shell>,
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
