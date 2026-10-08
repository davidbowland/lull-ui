import React from 'react'

// A Close button's mark: two strokes, drawn in the button's own ink. Hidden from the name, which is
// the button's own ("Close hints", "Close Backtrack"); nobody says "Close X". Shared by the hint
// sheet and goFigure's trail panel so the two popups close under one mark.
export const CloseMark = (): React.ReactNode => (
  <svg
    aria-hidden="true"
    className="shrink-0"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.75"
    viewBox="0 0 16 16"
    width="16"
  >
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
)
