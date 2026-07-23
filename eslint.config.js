import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', '.claude'] },
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
