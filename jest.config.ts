import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  clearMocks: true,
  collectCoverage: true,
  // public/sw.js is deliberately absent, and its absence is not an oversight. It is
  // exercised by test/sw-fetch.test.ts -- install, activate, and every branch of the
  // fetch handler -- but it has no module wrapper and is evaluated from a string with
  // `self`, `caches`, `fetch`, and `Response` injected, so istanbul cannot instrument it.
  // Listing it here would report a permanent 0% for a file with 19 tests against it,
  // which is more misleading than saying nothing. The mutation checks in that file's
  // header are what stand in for a coverage number.
  collectCoverageFrom: ['src/**/*'],
  coveragePathIgnorePatterns: ['.*\\.d\\.ts', 'config/*', 'types.ts', '_app.tsx', '_document.tsx'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 80,
    },
  },
  moduleNameMapper: {
    '.+\\.(css|styl|less|sass|scss)$': 'identity-obj-proxy',
    '.+\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|pdf|yaml)$':
      '<rootDir>/__mocks__/file-mock.js',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@heroui/react$': '<rootDir>/__mocks__/@heroui/react.js',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@registry$': '<rootDir>/src/registry',
    '^@rules/(.*)$': '<rootDir>/src/rules/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^@types$': '<rootDir>/src/types',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    // Both scopes. The variable fonts ship under @fontsource-variable, which the
    // narrower `@fontsource/` pattern does not match -- so jest reached the package's
    // real index.css and died on the first `@font-face`.
    '@fontsource(-variable)?/(.*)$': '<rootDir>/__mocks__/file-mock.js',
    '^framer-motion$': '<rootDir>/__mocks__/framer-motion.js',
  },
  // clearMocks alone leaves jest.spyOn installed on the prototype for the rest of
  // the file. restoreMocks puts the original back after every test.
  restoreMocks: true,
  setupFiles: ['<rootDir>/jest.setup-test-env.js'],
  // connections-ui has no after-env setup and imports @testing-library/jest-dom per
  // test file by convention. Lull registers it once here instead: every test file in
  // this repo uses its matchers, and a per-file import left to convention fails in
  // whichever file forgets it as "expect(...).toBeInTheDocument is not a function" --
  // which reads as a broken test rather than as a missing import.
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.ts'],
  testEnvironment: 'jsdom',
  // <rootDir>/.claude/ holds agent worktrees -- full checkouts of this repo. Without
  // this the suite discovers every worktree's copy of every test and reports failures
  // from whatever commit that worktree happens to sit on.
  testPathIgnorePatterns: ['node_modules', '\\.cache', '<rootDir>.*/out/', '<rootDir>/\\.claude/'],
}

export default createJestConfig(config)
