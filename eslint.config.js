import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'sot-saidas-view/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Válido em fluxos (edição, hidratação IndexedDB); o plugin acusa falsos positivos comuns.
      'react-hooks/set-state-in-effect': 'off',
      // Sincronizar refs com estado no render é usado de forma intencional (snapshots Firebase/merge).
      'react-hooks/refs': 'off',
    },
  },
  {
    files: ['src/context/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/saidas-mobile/saidas-mobile-filter-date-context.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
