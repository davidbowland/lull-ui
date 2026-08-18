import '@testing-library/jest-dom'
import { toHaveNoViolations } from 'jest-axe'

// Registered once, globally. Every component test in this repo ends with
// `expect(await axe(container)).toHaveNoViolations()`, and a matcher that has to be
// installed per file fails as "not a function" in whichever file forgets it — which
// reads as a broken test rather than a missing import.
expect.extend(toHaveNoViolations)
