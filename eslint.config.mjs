import js from '@eslint/js'
import globals from 'globals'
import babelParser from '@babel/eslint-parser'
import prettierRecommended from 'eslint-plugin-prettier/recommended'

export default [
  {
    // eslint 8 ignored dot-directories by default; flat config does not, and the
    // Makefile `init` target creates .cache/ for crawled data.
    ignores: ['.cache/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      parser: babelParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        requireConfigFile: false
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  },
  prettierRecommended
]
