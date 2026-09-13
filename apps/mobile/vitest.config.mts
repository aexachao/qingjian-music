import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * vitest 配置。
 *
 * ── 为什么必须有这个文件 ────────────────────────────────────────────────────
 * `src/` 下有 114 / 160 个文件用 `@/` 别名（定义在 tsconfig.json 的 paths），
 * 但 **vitest 默认不读 tsconfig 的 paths**。没有这份配置时，
 * `import ... from '@/lib/xxx'` 直接报 `Cannot find package '@'`。
 *
 * 后果很隐蔽：表现不是「测试失败」，而是**那些模块根本 import 不进来** ——
 * 于是它们永远不会有行为测试，而且没人会注意到缺了什么。
 * `src/player/controller.ts`（957 行，播放核心）一直没有行为测试就是这个原因：
 * 不是没人写，是写不了。
 *
 * 所以这里把 tsconfig 的 paths 手动镜像过来。
 * **改 tsconfig.json 的 paths 时，记得同步这里**（两条规则要一一对应）。
 */
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      // 顺序有意义：更具体的 `@/assets` 必须排在笼统的 `@` 前面。
      // 对应 tsconfig: { "@/assets/*": ["./assets/*"], "@/*": ["./src/*"] }
      { find: /^@\/assets\//, replacement: `${root}assets/` },
      { find: /^@\//, replacement: `${root}src/` },
    ],
  },
  test: {
    // 单测全部是纯逻辑 + mock 掉原生模块，跑在 node 下即可，不需要 jsdom
    environment: 'node',
  },
})
