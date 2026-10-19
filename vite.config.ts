import { defineConfig } from 'vitest/config';

// GitHub Pages 주소: https://yeons-play.github.io/baduk-hansu/
export default defineConfig({
  base: '/baduk-hansu/',
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 300000, // 무작위 대국을 많이 돌리는 CI(1000판)에서도 넉넉하게
  },
});
