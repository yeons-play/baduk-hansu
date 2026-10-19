import { defineConfig } from 'vitest/config';

// GitHub Pages 주소: https://yeons-play.github.io/baduk-hansu/
export default defineConfig({
  base: '/baduk-hansu/',
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
