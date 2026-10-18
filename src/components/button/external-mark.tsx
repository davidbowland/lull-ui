import React from 'react'

// A link-out mark: an arrow leaving its corner, drawn in the link's own ink. Hidden from the name,
// which already says where the link goes ("Look up pomelo on DuckDuckGo"). Drawn rather than typed
// for the reason CloseMark is: a font's "↗" changes weight, size and baseline from one system face
// to the next, and this sits beside the same 16-unit marks as the rest of the app.
export const ExternalMark = (): React.ReactNode => (
  <svg
    aria-hidden="true"
    className="shrink-0"
    fill="none"
    height="12"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 16 16"
    width="12"
  >
    <path d="M6 4h6v6M12 4 4 12" />
  </svg>
)
