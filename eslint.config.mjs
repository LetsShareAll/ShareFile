import { defineConfig } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const sharedRules = {
  'lines-between-class-members': [
    'error',
    'always',
    {
      exceptAfterSingleLine: true,
    },
  ],

  'padding-line-between-statements': [
    'error',
    {
      blankLine: 'always',
      prev: 'function',
      next: '*',
    },
    {
      blankLine: 'always',
      prev: 'class',
      next: '*',
    },
    {
      blankLine: 'always',
      prev: 'block-like',
      next: '*',
    },
    {
      blankLine: 'always',
      prev: '*',
      next: 'function',
    },
    {
      blankLine: 'always',
      prev: '*',
      next: 'class',
    },
    {
      blankLine: 'always',
      prev: '*',
      next: 'block-like',
    },
  ],

  'brace-style': [
    'error',
    '1tbs',
    {
      allowSingleLine: true,
    },
  ],
};

export default defineConfig([
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'public/**', '.tmp/**'],
  },

  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],

    languageOptions: {
      parser: vueParser,

      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },

      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    rules: sharedRules,
  },

  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],

    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ),

    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    rules: sharedRules,
  },
]);
