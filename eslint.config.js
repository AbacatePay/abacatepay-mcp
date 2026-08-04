import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        fetch: 'readonly',
        RequestInit: 'readonly',
        HeadersInit: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Response: 'readonly',
        AbortSignal: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      security: security
    },
    rules: {
      // Regras de segurança - ERRO para problemas críticos
      'security/detect-object-injection': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error', // Mudou para error
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'error', // Mudou para error
      'security/detect-non-literal-require': 'error', // Mudou para error
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      
      // Regras TypeScript - ERRO para problemas que quebram o código
      '@typescript-eslint/no-explicit-any': 'warn', // Mantém warn para flexibilidade MCP
      '@typescript-eslint/no-unused-vars': 'error',
      
      // Regras gerais - ERRO para problemas que podem quebrar
      'no-console': 'off', // Permitido para CLI tools
      'no-process-exit': 'off', // Permitido para CLI tools
      'no-undef': 'error',
      'no-unused-vars': 'off', // Delegado para @typescript-eslint
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-extra-boolean-cast': 'error',
      'no-func-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-obj-calls': 'error',
      'no-sparse-arrays': 'error',
      'no-unexpected-multiline': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error'
    }
  },
  {
    ignores: ['dist/', 'node_modules/']
  }
]; 