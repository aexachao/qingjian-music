// 必须写全 `flat.js`：eslint-config-expo 没有 exports 映射，
// 而包里同时存在 `flat.js` 和 `flat/` 目录，ESM 解析 `.../flat` 会被目录挡住。
import expoFlat from 'eslint-config-expo/flat.js'

/**
 * ESLint 配置（flat config）。
 *
 * ── 和架构守卫的分工 ────────────────────────────────────────────────────────
 * 两套检查有明确边界，避免同一个问题被报两遍：
 *
 *   ESLint（本文件）：通用 JS/TS 正确性与风格 —— 未使用变量、import 解析、
 *                     React Hooks 规则、类型相关的最佳实践。
 *   架构守卫（scripts/guard-architecture.mjs）：**项目特有的架构约束** ——
 *                     触感收口、*-policy.ts 依赖纯净、路由类型完整、
 *                     类型逃生舱棘轮。这些用 ESLint 表达要么很别扭，
 *                     要么需要自定义插件，放守卫里更直接。
 *
 * 所以：通用的加在这里；「本项目的规矩」加在守卫里。
 *
 * ── 注意 ────────────────────────────────────────────────────────────────────
 * 1. 本文件必须放在**仓库根**：各包没有自己的 eslint 配置，靠 ESLint 向上查找。
 * 2. eslint 锁 9.x（见 package.json）：eslint-config-expo 传递依赖的
 *    eslint-plugin-react@7.x 调用了 ESLint 10 已移除的 `context.getFilename()`，
 *    升到 10 会在加载规则时直接崩（lint 起不来，不是报错）。
 * 3. **块顺序有意义**：下面的 `qingjian/*` 块必须在 `...expoFlat` 之后。
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.cache/**',
      '**/.pnpm-store/**',
      // 原生工程是 prebuild 生成物，不是我们的源码
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      // 参考项目（只读研究用，已 gitignore）
      'reference/**',
      // 一次性技术验证脚本，包含非 TS 源码
      'scripts/spike/**',
      'patches/**',
    ],
  },

  ...expoFlat,

  {
    /**
     * ⚠️ 这个块**必须**在 `...expoFlat` 之后，否则不生效。
     *
     * eslint-config-expo 里有个名为 `import/typescript` 的块，它**没有 files 作用域**
     * （即对所有文件生效），并且把整个 `import/resolver` 重新声明成
     * `{ node: {...} }` —— flat config 的 settings 是按键覆盖的，
     * 于是前一个块设的 `typescript: true` 被整个冲掉。
     *
     * 后果：`@/*` 路径别名（定义在 apps/mobile/tsconfig.json）全部解析失败，
     * 表现为 114 个文件里 **420 条假的 `import/no-unresolved`**。
     * 假报错比不报更糟 —— 团队会直接不再相信这个工具。
     *
     * 这里把 typescript 解析器补回来，并显式给出 tsconfig 位置。
     * 注意 `eslint-import-resolver-typescript` 必须是**直接依赖**：
     * 解析器是 eslint-plugin-import 在**运行目录**下 require 的，
     * pnpm 的 isolated 链接不会把它提升到根 node_modules。
     */
    name: 'qingjian/resolver',
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.ts', '.cts', '.mts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
        },
        typescript: {
          project: ['apps/mobile/tsconfig.json', 'packages/*/tsconfig.json'],
        },
      },
    },
  },

  {
    name: 'qingjian/conventions',
    rules: {
      // 触感、console.log、@ts-ignore、类型逃生舱等由架构守卫负责，
      // 这里关掉以免同一处问题报两遍（见文件头「分工」）。
      'no-console': 'off',

      // 本项目全程用中文注释，注释里的示例代码不应被当成死代码
      'no-warning-comments': 'off',

      // ── React Compiler 时代的规则：降级为警告 ──────────────────────────────
      // eslint-plugin-react-hooks v7 默认把这几条设为 error。它们检查的是
      // 「渲染期读写 ref / 渲染期改 props」这类并发渲染下的隐患 —— 判断本身是对的，
      // 但本项目**没有启用 React Compiler**，且这些点（如 confirm-modal 关闭动画
      // 期间缓存文案）要改就得动交互时序，必须真机验证才敢动。
      // 本机无 Android SDK / iOS 真机环境，所以先降为警告：
      // 编辑器和 lint 报告里看得见，但不用没验证过的改动去卡 CI。
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/globals': 'warn',
    },
  },

  {
    name: 'qingjian/tests',
    files: ['**/test/**/*.ts', '**/test/**/*.tsx'],
    rules: {
      // 契约测试直接从 process.env 读连接信息，这是合法用法
      // （该规则本意是拦客户端 bundle 里的动态环境变量访问）
      'expo/no-dynamic-env-var': 'off',

      // vitest 的 vi.mock 会被提升到 import 之前，所以「被测模块的 import
      // 写在 vi.mock 之后」是**必须**的写法，不是顺序错误。
      'import/first': 'off',
    },
  },

  {
    // 调试自检页允许 console.log（守卫里也做了同样的白名单）
    name: 'qingjian/dev-smoke',
    files: ['apps/mobile/src/app/dev-smoke.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
]
