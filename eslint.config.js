import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // tools/optimizeLab holds sample projects with deliberately bad code.
  { ignores: ['dist', '.claude', 'tools/optimizeLab'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Matches tsc's own noUnusedParameters convention (already treats a
      // leading underscore as "intentionally unused") — scaffolded
      // ViewModels take props before they're wired up to anything.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // An import that brings only types says so. The compiler drops it either
      // way, but the architecture analyzer (Planning's Health view, /optimize)
      // reads source, not types: an unmarked type import looks like a runtime
      // dependency and shows up as a false import loop or an import up the layers.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      // Scaffolded prop interfaces start empty ("// Define props here") until
      // filled in — that's a valid, temporary state, not a real lint issue.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
      // Design system: components should use Frame props (fill, stroke, radius,
      // effects, padding, w/h, ...) instead of the raw style={{}} escape hatch.
      // Only object literals are flagged; forwarding a style prop (style={style})
      // is allowed plumbing.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "JSXOpeningElement[name.name=/^[A-Z]/] > JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression",
          message:
            'Prefer Frame props (fill, stroke, radius, effects, padding, w/h, ...) over style={{}}. If no prop covers this, extend Frame — or disable this line with a justification.',
        },
      ],
    },
  },
  {
    // Frame implements the style escape hatch itself and must merge user styles
    files: ['**/01_atoms/Frame/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
