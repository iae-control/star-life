import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'android/', 'node_modules/', 'legacy/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node 유틸 스크립트 (page.evaluate 내부의 브라우저 전역 포함)
    files: ['scripts/**/*.{mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
