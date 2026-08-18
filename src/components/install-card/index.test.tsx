import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import React from 'react'

import { InstallCard } from './index'
import { InstallMode, InstallPlatform } from '@hooks/useInstallPrompt'

describe('InstallCard', () => {
  const onDismiss = jest.fn()
  const onInstall = jest.fn()
  const onReopen = jest.fn()

  const renderCard = (mode: InstallMode = 'card', platform: InstallPlatform = 'desktop'): ReturnType<typeof render> =>
    render(
      <InstallCard mode={mode} onDismiss={onDismiss} onInstall={onInstall} onReopen={onReopen} platform={platform} />,
    )

  describe('what the card offers', () => {
    it('says what installing buys', () => {
      renderCard()

      expect(screen.getByRole('heading', { name: 'Take the week with you' })).toBeInTheDocument()
    })

    // The reason the card exists at all: usePrefetch gates the whole seven-day window on
    // isInstalled(), so a visitor who never installs gets one day and the offline
    // premise never engages.
    it('says what the device keeps either way', () => {
      renderCard()

      expect(
        screen.getByText(
          'Only the days you open stay on this device. Install Lull and the last seven days stay too — no connection needed.',
        ),
      ).toBeInTheDocument()
    })

    it('asks the browser to install when pressed', async () => {
      const user = userEvent.setup()
      renderCard()

      await user.click(screen.getByRole('button', { name: 'Install' }))

      expect(onInstall).toHaveBeenCalledTimes(1)
    })

    it('collapses when turned down', async () => {
      const user = userEvent.setup()
      renderCard()

      await user.click(screen.getByRole('button', { name: 'Not now' }))

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    // A desktop has no home screen, so one label cannot serve both.
    it.each([
      ['android', 'Add to home screen'],
      ['firefox-android', 'Add to home screen'],
      ['desktop', 'Install'],
      ['ios', 'Install'],
    ])('names the offer for %s', (platform: string, label: string) => {
      renderCard('link', platform as InstallPlatform)

      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    })
  })

  describe('the platforms with no install event', () => {
    // Safari has no install API. The gesture happens in the browser's own chrome, where
    // there is no button to put, so the only honest offer is to name the steps.
    it('names Safari on iOS, because no other iOS browser can install anything', () => {
      renderCard('card', 'ios')

      expect(screen.getByText('Open this page in Safari.')).toBeInTheDocument()
    })

    it('names the Share sheet without claiming where it sits', () => {
      renderCard('card', 'ios')

      expect(screen.getByText('Tap Share, then Add to Home Screen.')).toBeInTheDocument()
    })

    // Firefox lists Add to Home screen as a SEPARATE item that makes an ordinary
    // shortcut -- it opens in a tab and Android never counts it as installed -- so a
    // step naming only that would send the reader to the one item that cannot work.
    // Older Firefox called the install item Add to Home screen itself, which is why the
    // second name still has to appear.
    it('names Install first on Firefox for Android, and its old name second', () => {
      renderCard('card', 'firefox-android')

      expect(screen.getByText('Tap Install. Older versions call it Add to Home screen.')).toBeInTheDocument()
    })

    it.each(['firefox-android', 'ios'])('offers no button on %s, which has none to offer', (platform: string) => {
      renderCard('card', platform as InstallPlatform)

      expect(screen.queryByRole('button', { name: /^(Install|Add to home screen)$/ })).not.toBeInTheDocument()
    })
  })

  describe('collapsing and reopening', () => {
    // Dismissing collapses the card; it never destroys it. iOS fires no
    // beforeinstallprompt, so this link is the only route back and a one-way door would
    // make installing unreachable after a stray tap.
    it('reopens from the collapsed link', async () => {
      const user = userEvent.setup()
      renderCard('link')

      await user.click(screen.getByRole('button', { name: 'Install' }))

      expect(onReopen).toHaveBeenCalledTimes(1)
    })

    it('reports the collapsed link as collapsed', () => {
      renderCard('link')

      expect(screen.getByRole('button', { name: 'Install' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders nothing at all for a platform with no route in', () => {
      const { container } = renderCard('none')

      expect(container).toBeEmptyDOMElement()
    })

    // Collapsing unmounts the control the keyboard was sitting on. Focus then falls to
    // <body>, the next Tab restarts at the top of the page, and a screen reader
    // announces nothing -- so the card reads as gone rather than collapsed (WCAG 2.4.3).
    it('moves focus to the collapsed link when the card closes', () => {
      const { rerender } = renderCard('card')

      rerender(
        <InstallCard mode="link" onDismiss={onDismiss} onInstall={onInstall} onReopen={onReopen} platform="desktop" />,
      )

      expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus()
    })

    it('moves focus into the card when it reopens', () => {
      const { rerender } = renderCard('link')

      rerender(
        <InstallCard mode="card" onDismiss={onDismiss} onInstall={onInstall} onReopen={onReopen} platform="desktop" />,
      )

      expect(screen.getByRole('button', { name: 'Install' })).toHaveFocus()
    })

    // No install button to take focus, so the title takes it instead of dropping it
    // back onto <body>.
    it('announces the reopened card by its title where there is no button', () => {
      const { rerender } = renderCard('link', 'ios')

      rerender(
        <InstallCard mode="card" onDismiss={onDismiss} onInstall={onInstall} onReopen={onReopen} platform="ios" />,
      )

      expect(screen.getByRole('heading', { name: 'Take the week with you' })).toHaveFocus()
    })

    // A card that appears because the browser finally fired its event must not snatch
    // focus from whatever the reader is doing.
    it('leaves focus alone when the card appears on its own', () => {
      const { rerender } = renderCard('none')

      rerender(
        <InstallCard mode="card" onDismiss={onDismiss} onInstall={onInstall} onReopen={onReopen} platform="desktop" />,
      )

      expect(screen.getByRole('button', { name: 'Install' })).not.toHaveFocus()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderCard()

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations while collapsed', async () => {
      const { container } = renderCard('link')

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations with steps instead of a button', async () => {
      const { container } = renderCard('card', 'ios')

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
