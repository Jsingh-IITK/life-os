import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Module boundaries are enforced here rather than trusted to discipline.
 *
 * The PRD requires that finance and fitness domain logic stay separate, that
 * financial calculations live outside UI, and that AI provider credentials never
 * reach the client. Those are architectural claims that quietly stop being true
 * unless something fails the build — so each one has a rule below.
 *
 * NOTE: flat config REPLACES a rule when a later block sets the same rule name,
 * it does not merge the options. Every restriction for a given file pattern must
 * therefore be composed into a single `no-restricted-imports` entry.
 */

/** The core engines are pure: no I/O, no renderer, no platform APIs. */
const PURE_ENGINE_PATHS = [
  {
    name: '@supabase/supabase-js',
    message:
      'The core engines perform no I/O. Fetch data in the app or an Edge Function and pass it in.',
  },
  {
    name: 'react',
    message: 'Core engines must stay renderer-agnostic and unit-testable without React.',
  },
  { name: 'react-native', message: 'Core engines must stay renderer-agnostic.' },
];

const PURE_ENGINE_PATTERNS = [
  {
    group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https'],
    message:
      'Core engines are pure: no filesystem, network or platform APIs. Keep them deterministic.',
  },
];

const noCrossModule = (forbidden, message) => ({
  group: [`@life-os/${forbidden}`, `@life-os/${forbidden}/*`],
  message,
});

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/android/**', '**/ios/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // --- finance-core: pure, and blind to fitness ----------------------------
  {
    files: ['packages/finance-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PURE_ENGINE_PATHS,
          patterns: [
            ...PURE_ENGINE_PATTERNS,
            noCrossModule(
              'fitness-core',
              'Finance must not depend on Fitness. Cross-module features belong in the app or a dedicated cross-module package.',
            ),
          ],
        },
      ],
    },
  },

  // --- fitness-core: pure, and blind to finance ----------------------------
  {
    files: ['packages/fitness-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PURE_ENGINE_PATHS,
          patterns: [
            ...PURE_ENGINE_PATTERNS,
            noCrossModule(
              'finance-core',
              'Fitness must not depend on Finance. A fitness code path must be incapable of reaching financial data.',
            ),
          ],
        },
      ],
    },
  },

  // --- The app: presentation only ------------------------------------------
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      // Metro resolves static assets (fonts, images) through require() by
      // design, so this is idiomatic in the app layer rather than a smell.
      '@typescript-eslint/no-require-imports': 'off',
      // Secrets belong server-side. A provider SDK in the client bundle means
      // an API key in the client bundle.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['openai', '@anthropic-ai/*', '@google/generative-ai', '@google/genai'],
              message:
                'AI provider SDKs must stay server-side (Supabase Edge Functions). Never ship provider credentials to the client.',
            },
          ],
        },
      ],
    },
  },

  // Tests may be looser about non-null assertions on fixtures.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
