import React from 'react'

export interface EnclosureProps {
  children: React.ReactNode
  className?: string
}

/**
 * The nested double-bezel: a container that carries weight sits in a shell rather than
 * flat on the background.
 *
 * This goes ONLY on the plates that carry weight -- the date plate on the day directory
 * and the goal plate on the tile bench. Bezelling every container turns the technique
 * into background noise, which is the failure it exists to avoid: if everything is
 * raised, nothing is.
 *
 * `Shell` and `Plate` are separate rather than one component with a prop because the
 * plate is sometimes used alone, flat on the ground, where the surrounding surface is
 * already doing the enclosing.
 */
export const Shell = ({ children, className = '' }: EnclosureProps): React.ReactNode => (
  <div
    className={`rounded-[var(--lull-r-xl)] border border-[var(--lull-rule)] bg-[var(--lull-ground)] p-[5px] ${className}`}
  >
    {children}
  </div>
)

/**
 * The inner container. Its radius is CONCENTRIC rather than equal -- the outer 22px
 * minus the 5px of padding between them -- so the two curves stay parallel. Matching
 * radii would make the inner corner read as pinched, which is the tell that separates a
 * considered enclosure from two nested rounded rectangles.
 *
 * The inset highlight is a hairline of light along the top edge only, which is what
 * makes the plate read as lifted rather than as a lighter patch. It is weaker in dark
 * mode because a bright inner edge on a dark ground reads as a seam rather than a lift.
 */
export const Plate = ({ children, className = '' }: EnclosureProps): React.ReactNode => (
  <div
    className={`rounded-[calc(var(--lull-r-xl)-5px)] bg-[var(--lull-plate)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)] ${className}`}
  >
    {children}
  </div>
)
