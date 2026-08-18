// Fleet ESLint flat config — UI (React / CRA / Next-style TypeScript) flavor.
// ESLint 9 + typescript-eslint 8 + eslint-plugin-react. Translated from the
// former .eslintrc.json, preserving original intent.
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import react from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 1) Build artifacts and generated files never linted.
  {
    ignores: [
      '**/__mocks__/',
      '**/__snapshots__/',
      // Parallel-agent worktrees are full checkouts of this repo. Without this,
      // `npm run lint` lints every worktree's copy of every file and reports
      // errors from whatever commit that worktree sits on.
      '.claude/',
      '.cache/',
      '.next/',
      '.swc/',
      'build/',
      'coverage/',
      'deploy/',
      'dist/',
      'node_modules/',
      'out/',
      'public/',
      'static/',
      'next-env.d.ts',
      '**/*.min.*',
      'jest.*.*',
    ],
  },

  // 2) Base recommended sets.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,

  // 3) Language options + fleet rule intent.
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '_', ignoreRestSiblings: true, varsIgnorePattern: '_' },
      ],
      'no-negated-condition': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-curly-brace-presence': ['error', { children: 'never', propElementValues: 'always', props: 'never' }],
      'react/jsx-sort-props': 'error',
      'sort-vars': 'error',
    },
  },

  // 4) Node scripts / config files may use CommonJS require(). test/**/*.js is here
  // too: plain-JS tests run as CommonJS and reach for __dirname and require().
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', '*.config.{js,mjs,cjs,ts}', 'next.config.*', 'test/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // 5) Jest rules scoped to test / mock / test-support files only.
  {
    files: [
      // public/sw.js runs in a worker scope, so its test loads it as text and
      // evaluates it -- which only works from a plain .js test file.
      '**/*.test.js',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*TestUtils.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      '**/__mocks__/**/*.{ts,tsx}',
    ],
    ...jest.configs['flat/recommended'],
    settings: { jest: { version: 29 } },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      'jest/no-mocks-import': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // 6) Prettier LAST — disables all formatting rules that would fight prettier.
  prettier,
)
