import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import React from 'react'

import { Spine } from './index'

describe('Spine', () => {
  const trail = [{ href: '/', label: 'Lull' }, { href: '/', label: 'Wed 20 Aug' }, { label: 'Cryptogram' }]

  it('is a named breadcrumb landmark', () => {
    render(<Spine trail={trail} />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })

  it('links every crumb but the one you are on', () => {
    render(<Spine trail={trail} />)

    expect(screen.getByRole('link', { name: 'Lull' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Cryptogram' })).not.toBeInTheDocument()
  })

  it('marks the last crumb as the current page', () => {
    render(<Spine trail={trail} />)

    expect(screen.getByText('Cryptogram')).toHaveAttribute('aria-current', 'page')
  })

  it('draws one separator between each pair of crumbs', () => {
    const { container } = render(<Spine trail={trail} />)

    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  // The day surface renders "Lull > Wed 20 Aug" and a dead end may render only "Lull", so
  // a separator drawn from the crumb rather than from the gap between crumbs would leave a
  // chevron pointing at nothing.
  it('draws no separator before the first crumb', () => {
    const { container } = render(<Spine trail={[{ label: 'Lull' }]} />)

    expect(container.querySelectorAll('svg')).toHaveLength(0)
    expect(screen.getByText('Lull')).toHaveAttribute('aria-current', 'page')
  })

  it('has no violations', async () => {
    const { container } = render(<Spine trail={trail} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
