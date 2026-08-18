import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'

import { InstallCard } from '@components/install-card'
import { useInstallPrompt } from '@hooks/useInstallPrompt'
import { useOnline } from '@hooks/useOnline'
import { entryFor, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { cachedPackDates, readMeta, readPack, STORAGE_EVENT } from '@services/storage'
import { Pack, PackDate, Puzzle } from '@types'
import { toPackDate } from '@utils/pack-dates'

export interface ShelfProps {
  locale?: string
  now?: () => number
}

// Node 24 defines globalThis.navigator, so the export build reads the build machine's
// ICU default rather than throwing. That is still the wrong language for everyone else,
// which is why nothing formatted here survives the first render.
const defaultLocale = (): string => globalThis.navigator?.language ?? 'en-US'

// A PackDate is a plain YYYY-MM-DD string, and new Date() on one depends on the runtime
// zone. The fields are read out and rebuilt in UTC so the label can never name a
// different day than the key it was read from.
const dayLabel = (date: PackDate, locale: string): string => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: 'long',
  })
}

// Rounded, and never to zero: "About 0 min" reads as a bug, and the number is an
// estimate the backend already rounded once.
const lengthLabel = (estimatedSeconds: number): string => `About ${Math.max(1, Math.round(estimatedSeconds / 60))} min`

interface Snapshot {
  pack: Pack | null
  solved: string[]
}

// The newest pack the device holds that the local date has actually reached. Two rules
// in one line, because cachedPackDates comes back newest-first:
//
//   west of UTC, the prefetch stages TOMORROW's local pack before midnight -- it is on
//     the device on purpose, and showing it would hand out a day early;
//   east of UTC, the local date can run ahead of the newest pack the generator has made,
//     and the shelf falls back to the most recent one rather than reporting an empty day.
const shelfPack = (localToday: PackDate): Pack | null => {
  const date = cachedPackDates().find((cached) => cached <= localToday)
  return date === undefined ? null : readPack(date)
}

interface ShelfRowProps {
  isSolved: boolean
  onOpen: (puzzleId: string) => void
  puzzle: Puzzle
}

const ShelfRow = ({ isSolved, onOpen, puzzle }: ShelfRowProps): React.ReactNode => {
  const entry = entryFor(puzzle.type)

  // A type this build has never heard of. lull-api can ship a generator before the UI
  // that draws it, and a pack is JSON off the network -- so the row says what it cannot
  // do rather than destructuring undefined during a render with no error boundary
  // above it.
  if (entry === undefined) {
    return <li className="text-[var(--lull-ink-muted)]">{UNKNOWN_TYPE_MESSAGE}</li>
  }

  return (
    <li>
      <button
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--lull-border)] px-4 text-left text-[var(--lull-ink)] hover:bg-[var(--lull-accent)]/10"
        onClick={() => onOpen(puzzle.id)}
        type="button"
      >
        {/* Decoration beside the words, never instead of them. */}
        <svg
          aria-hidden="true"
          className="h-5 w-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d={entry.icon} />
        </svg>
        <span className="grow">{entry.label}</span>
        <span className="text-[var(--lull-ink-muted)]">{lengthLabel(puzzle.estimatedSeconds)}</span>
        {isSolved && <span className="text-[var(--lull-ink-muted)]">Solved</span>}
      </button>
    </li>
  )
}

export const Shelf = ({ locale = defaultLocale(), now = Date.now }: ShelfProps): React.ReactNode => {
  const router = useRouter()
  const isOnline = useOnline()
  const { dismiss, install, mode, platform, reopen } = useInstallPrompt()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // Frozen at mount on purpose. Depending on the now prop directly would re-run the
  // effect for any caller that passes an inline arrow, and the effect sets state.
  const [clock] = useState(() => now)

  useEffect(() => {
    const read = (): void => setSnapshot({ pack: shelfPack(toPackDate(new Date(clock()))), solved: readMeta().solved })
    read()

    // localStorage tells this tab nothing about its own writes, and every fact on this
    // screen is one of those writes: usePrefetch fills the device seconds after mount
    // and again on every reconnect and install, and a win lands through markSolved.
    // None of that moves a route, so the shelf listens to the writes themselves.
    window.addEventListener(STORAGE_EVENT, read)
    window.addEventListener('online', read)
    window.addEventListener('appinstalled', read)
    // Resume, not merely visibility. An installed app keeps its JS context across days,
    // so without this the shelf still names yesterday the next morning.
    document.addEventListener('visibilitychange', read)
    return () => {
      window.removeEventListener(STORAGE_EVENT, read)
      window.removeEventListener('online', read)
      window.removeEventListener('appinstalled', read)
      document.removeEventListener('visibilitychange', read)
    }
  }, [clock])

  const open = (puzzleId: string): void => {
    // Encoded, because a puzzle id carries colons. The id is opaque past its date
    // prefix, so it is passed along whole and never taken apart.
    void router.push(`/p/${encodeURIComponent(puzzleId)}`)
  }

  // Nothing above this line may depend on the date, the clock, or the device. This
  // component is rendered in Node at build time and shipped as HTML to everyone, so a
  // date resolved there freezes at the moment of deploy and a label formatted there is
  // in the build machine's language.
  if (snapshot === null) return <div aria-hidden="true" className="min-h-[320px]" />

  const { pack, solved } = snapshot
  const solvedIds = new Set(solved)
  const localToday = toPackDate(new Date(clock()))

  return (
    <section aria-label="Puzzles" className="flex flex-col gap-4">
      {/* Always mounted, empty while online. Going offline is the one transition this
          screen exists to report, and a role="status" inserted with its message already
          in it is routinely missed. */}
      <p className="text-[var(--lull-ink-muted)] empty:hidden" role="status">
        {isOnline ? '' : 'You’re offline. Only puzzles already here will open.'}
      </p>

      {pack === null ? (
        <>
          {/* True whether the device is empty because this is a first visit, because
              there is no connection, or because the request failed. The shelf cannot
              tell those apart and must not pretend to. */}
          <h2 className="text-xl text-[var(--lull-ink)]">No puzzles on this device</h2>
          <p className="text-[var(--lull-ink-muted)]">
            They arrive on their own while you’re online. If you just opened Lull, give it a moment.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl text-[var(--lull-ink)]">{dayLabel(pack.date, locale)}</h2>

          {pack.date !== localToday && (
            <p className="text-[var(--lull-ink-muted)]">
              Today’s puzzles aren’t ready yet. This is the most recent set.
            </p>
          )}

          {/* Sorted shortest first, and never by position in the pack: a puzzle id is
              opaque and carries no order. */}
          <ul className="flex flex-col gap-2">
            {pack.puzzles
              .toSorted((first, second) => first.estimatedSeconds - second.estimatedSeconds)
              .map((puzzle) => (
                <ShelfRow isSolved={solvedIds.has(puzzle.id)} key={puzzle.id} onOpen={open} puzzle={puzzle} />
              ))}
          </ul>

          {/* A partial day is served on purpose and everything in it is playable now.
              Saying so is the difference between "this is all there is" and "there is
              more coming". */}
          {!pack.complete && (
            <p className="text-[var(--lull-ink-muted)]">More puzzles for this day are still on the way.</p>
          )}
        </>
      )}

      {/* Not decoration, and not optional. usePrefetch gates the entire seven-day
          window on isInstalled(), so without something that asks, a first-time visitor
          gets one pack and the offline premise this app is built on never engages. */}
      <InstallCard mode={mode} onDismiss={dismiss} onInstall={install} onReopen={reopen} platform={platform} />
    </section>
  )
}
