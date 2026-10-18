import { render, screen } from '@testing-library/react'
import React from 'react'

import { LookUp } from './index'

describe('LookUp', () => {
  const originalFetch = globalThis.fetch
  const fetchMock = jest.fn()

  beforeAll(() => {
    globalThis.fetch = fetchMock
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  const hrefOf = (answer: string): URL => {
    render(<LookUp answer={answer} />)
    return new URL(screen.getByRole('link').getAttribute('href') ?? '')
  }

  it.each([
    ['Rock & Roll', 'Rock & Roll'],
    ["Who's There?", "Who's There?"],
    ['Café', 'Café'],
    ['50% #1', '50% #1'],
    ['a+b=c', 'a+b=c'],
    // A lone surrogate would make encodeURIComponent throw; it arrives as U+FFFD instead.
    ['\uD800', '�'],
  ])('searches for %j and nothing else', (answer, expected) => {
    const url = hrefOf(answer)

    expect(url.searchParams.get('q')).toBe(expected)
    expect([...url.searchParams.keys()]).toEqual(['q'])
  })

  it('builds the exact DuckDuckGo address', () => {
    render(<LookUp answer="Rock & Roll" />)

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.duckduckgo.com/?q=Rock%20%26%20Roll')
  })

  it('is a link named for the answer and the destination', () => {
    render(<LookUp answer="pomelo" />)

    expect(screen.getByRole('link', { name: 'Look up pomelo on DuckDuckGo' })).toBeInTheDocument()
  })

  it('opens in a new tab without handing the page an opener', () => {
    render(<LookUp answer="pomelo" />)

    const link = screen.getByRole('link', { name: 'Look up pomelo on DuckDuckGo' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('requests nothing until the tap', () => {
    render(<LookUp answer="pomelo" />)

    expect(document.querySelector('link')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
