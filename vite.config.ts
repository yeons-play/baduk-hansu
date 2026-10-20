import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * 빌드가 끝나면 dist/sw.js의 두 줄을 채운다.
 *  - VERSION: 빌드 결과 파일 내용으로 만든 짧은 지문 → 캐시 이름(baduk-xxxx)이 저절로 바뀜
 *  - PRECACHE: 설치 때 미리 저장할 파일 목록(화면 코드·글꼴·아이콘). .woff는 .woff2가 있으므로 뺀다.
 * 자리를 못 찾으면 빌드를 실패시켜 조용히 넘어가지 않게 한다.
 */
function swPrecache(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'baduk-sw-precache',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const swOut = join(outDir, 'sw.js');
      const src = readFileSync(existsSync(swOut) ? swOut : join(root, 'public', 'sw.js'), 'utf8');
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && f !== 'index.html' && !f.endsWith('.map') && !f.endsWith('.woff'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      hash.update(readFileSync(join(outDir, 'index.html')));
      const version = hash.digest('hex').slice(0, 10);
      const VERSION_LINE = "const VERSION = 'dev';";
      const PRECACHE_LINE = 'const PRECACHE = [];';
      if (!src.includes(VERSION_LINE) || !src.includes(PRECACHE_LINE)) {
        throw new Error('sw.js에서 VERSION·PRECACHE 자리를 찾지 못함');
      }
      const out = src
        .replace(VERSION_LINE, `const VERSION = ${JSON.stringify(version)};`)
        .replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(files)};`);
      writeFileSync(swOut, out);
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// GitHub Pages 주소: https://yeons-play.github.io/baduk-hansu/
export default defineConfig({
  base: '/baduk-hansu/',
  plugins: [swPrecache()],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 300000, // 무작위 대국을 많이 돌리는 CI(1000판)에서도 넉넉하게
  },
});
