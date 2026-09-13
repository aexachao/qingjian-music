# 构建与 CI

> 在 GitHub Actions 上构建可分发的安装包，本机不需要装 JDK / Android SDK。
> 本地只需写代码 + 跑校验；出包交给 CI。

---

## 一、怎么触发

| 方式 | 操作 | 结果 |
| --- | --- | --- |
| 手动 | Actions → **Build** → Run workflow | 出一版包（artifact） |
| 打 tag | `git tag v0.1.0 && git push origin v0.1.0` | 出包并自动挂到 GitHub Release |
| 日常推送 | `git push` | 只跑 **CI**（守卫 / ESLint / 类型 / 单测），不出包 |

两个工作流分工：

| 文件 | 触发 | 内容 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push / PR / 手动 | 架构守卫、ESLint、类型检查、单测；（可选）契约测试 |
| `.github/workflows/build.yml` | 手动 / tag | 校验 → JS 打包检查 → Android APK → iOS 未签名 IPA |

---

## 二、产物

### `android-apk` —— **可以直接装到手机**

```
qingjian-music-android.apk
```

- release 构建，**JS 已内嵌**，装到手机上不需要 Metro；
- 用 Gradle 自带的 debug keystore 签名（Expo 模板里 release 构建类型就指向它），
  所以 **CI 不需要任何 Secrets**；
- 传到手机点击安装，或 `adb install qingjian-music-android.apk`。

> **为什么不用 debug 包**：React Native 的 debug 包默认**不打包 JS**，
> 装到手机上会一直等 Metro，等于没法分发给别人。release 包才会内嵌 bundle。
> 这一步由工作流里的 `unzip -l ... | grep assets/index.android.bundle` 断言兜住 ——
> 「装得上但打开白屏」不会在构建阶段报错，只能靠断言拦。

### `ios-unsigned-ipa` —— **未签名，供用户自签**

```
qingjian-music-unsigned.ipa
```

- 设备版（`-sdk iphoneos`）构建，用 `CODE_SIGNING_ALLOWED=NO` 关掉签名；
- **不含签名、不含描述文件**，用户拿到后用自己的 Apple ID 自签即可，
  **不需要付费开发者账号**，我们也因此不需要持有任何凭据；
- 三条产物断言（都是「不报错但会坑用户」的静默失败）：
  | 断言 | 拦住的失败 |
  | --- | --- |
  | `main.jsbundle` 存在 | 装得上、打开白屏 |
  | `vtool` 报 `platform IOS` | 误出模拟器版，自签工具直接拒绝 |
  | 无 `embedded.mobileprovision` | 签名没关干净，会和用户的签名冲突 |

### 用户怎么自签

1. 从 Releases 下载 `qingjian-music-unsigned.ipa`；
2. 用 [Sideloadly](https://sideloadly.io/)、[AltStore](https://altstore.io/)、
   ESign 等工具，填自己的 Apple ID 导入安装；
3. 免费 Apple ID 签的应用**有效期 7 天**，到期重签一次即可（工具一般能自动续）。

> 自签用的是你自己的 Apple ID，与本仓库无关，我们不经手任何凭据。

### JS 打包检查（不出产物，但很快）

`bundle` job 会分别对 iOS / Android 跑 `expo export`，约 2 分钟。
它能提前抓到「模块解析不到 / 平台后缀缺失」这类问题，
不用等 20 分钟的原生构建失败才发现。

---

## 三、发行版：`community` / `store`

同一个代码库出两种包，由构建期的 `EXPO_PUBLIC_EDITION` 决定：

| 发行版 | 说明 | 谁在构建 |
| --- | --- | --- |
| `community`（缺省） | **完整功能，不含任何购买链路** | GitHub Actions（见 `build.yml` 顶层 `env`） |
| `store` | 上架 App Store 的商店版，接入永久会员购买 | 本地 Xcode 归档 |

判定逻辑集中在 `apps/mobile/src/lib/edition-policy.ts`，规则只有一条：

```ts
export const EDITION = process.env.EXPO_PUBLIC_EDITION === 'store' ? 'store' : 'community'
```

三个刻意的设计：

1. **缺省是 `community`。** 没显式指定发行版的构建一律当完整版 ——
   反过来的话，一个「忘了设变量」的自签构建会让用户看到一个他根本买不了的付费墙，
   那是坏掉的应用，比少赚一笔严重得多。
2. **拼错的值也回退到 `community`。** `EXPO_PUBLIC_EDITION=Store` 不会静默变成商店版。
3. **打包期内联，不是运行时读取。** Metro 把 `process.env.EXPO_PUBLIC_*` 静态替换成
   字面量，所以运行期改不动它（用户不能靠改配置解锁）。

**GitHub 分发的两个平台都是 `community`**，这条约束写在工作流**顶层** `env` 里，
Android 与 iOS 两个 job 都自动继承，不可能只漏一个平台。每个平台 job 里还有一条
断言步骤校验**生效值**，所以即使某个 job 自己覆盖成 `store` 也会被拦住。

> 关于页会显示当前发行版（`完整版` / `商店版`）。
> 这是「配置真的生效了吗」唯一可见的验证面 —— 构建脚本里写对了，不等于产物里生效了。

---

## 四、工作流里几个「不这么写就会坏」的点

这些都是踩过的坑，改工作流时不要动：

1. **`expo prebuild --platform ios` 不能加 `--no-install`。**
   它会清空并重写整个 `ios/` 目录却跳过 `pod install`，
   导致 `.xcworkspace` 不存在，`xcodebuild` 直接报 workspace 找不到。
   （Android 侧加 `--no-install` 没问题，因为没有 pod 这一步。）

2. **`android/` 和 `ios/` 都被 `.gitignore` 排除**，CI 上必须现生成，
   所以工作流里一定有 prebuild 步骤，不能假设原生目录存在。

3. **`plugins/` 和 `modules/` 必须提交。**
   漏了会导致 prebuild 失败或构建出的 App 缺功能。

4. **构建前先跑 `verify` job。** 坏提交不给包。

5. **xcodebuild 日志重定向到文件，失败时只打错误摘要 + 末尾片段。**
   Xcode 日志动辄上万行，直接打到 CI 日志里会把真正的错误冲掉。

6. **IPA 用 `zip -qry` 打包，不加 `--sequesterRsrc`。**
   IPA 就是根目录含 `Payload/` 的 zip；`--sequesterRsrc` 会产生 `__MACOSX`，
   部分自签工具会挑刺。

7. **Android 构建会被 `react-native-track-player@4.1.2` 卡住 —— `patches/` 里的补丁不能删。**
   4.1.2 把可空的 `Track.originalItem: Bundle?` 直接传给 `Arguments.fromBundle(Bundle)`，
   RN 0.81+ 的 Kotlin 2.x 把这条提升成**编译错误**，`:react-native-track-player:compileReleaseKotlin`
   直接失败（第一次真正跑 Android 构建时才暴露，之前从没构建过）：

   ```
   e: MusicModule.kt:548:51 Argument type mismatch: actual type is 'Bundle?', but 'Bundle' was expected.
   e: MusicModule.kt:588:17 Argument type mismatch: actual type is 'Bundle?', but 'Bundle' was expected.
   ```

   上游（doublesymmetry/react-native-track-player）**没有在 v4 修**，而是关掉 v4、
   转向重写的 v5（`@rntp/player`）。所以这里用 pnpm patch 打了两个 hunk，把
   `Arguments.fromBundle(x)` 改成 `x?.let { Arguments.fromBundle(it) }`。
   用 `?.let` 而不是 `?: Bundle()`：后者会把 `null` 变成**空 map** 发给 JS，
   破坏 `getTrack` / `getActiveTrack`「越界或空队列时返回 null」的既有契约。

   ⚠️ **改 `patches/*.patch` 之后必须同步更新 `pnpm-lock.yaml` 里的哈希。**
   那是 patch 文件**字节**的 sha256，对不上 `pnpm install --frozen-lockfile` 会直接失败：

   ```bash
   shasum -a 256 patches/react-native-track-player@4.1.2.patch
   # 把结果写回 pnpm-lock.yaml 的 patchedDependencies
   ```

   ⚠️ **另一个尚未在真机验证的风险（重要）**：RNTP 4.1.2 的 `MusicModule` 是旧式模块
   （`ReactContextBaseJavaModule`，没有 TurboModule 声明），而它的 39 个 `@ReactMethod`
   里有 36 个写成 `fun x(...) = scope.launch { }` —— **返回 `Job` 而不是 `void`**。
   RN 0.86 的 interop 层
   （`ReactAndroid/.../TurboModuleInteropUtils.kt` 的 `getMethodDescriptorsFromModule`）
   对「非同步方法 + 返回类型不是 `Void.TYPE`」的组合会**直接抛 `ParsingException`**。
   这是**运行时**错误（编译能过），表现为模块一被 JS 访问就崩。
   本机没有 Android 设备，**必须在真机上验一次**。若真的崩，退路是给 RNTP 再打一个补丁，
   把那 36 个方法改成返回 `Unit`（上游 issue #2530 里有讨论与写法）。

---

## 五、本地出商店版（上架 App Store）

商店版**不走 GitHub Actions**（它需要付费账号的签名凭据，也不该把凭据放到公开 CI 上）。
在本机归档：

```bash
cd apps/mobile
EXPO_PUBLIC_EDITION=store npx expo prebuild --platform ios
# 然后在 Xcode 里 Archive → Distribute App
```

- `plugins/with-ios-signing.js` 会把 `DEVELOPMENT_TEAM` 写进工程，
  团队 ID 可用环境变量 `QJ_IOS_TEAM_ID` 覆盖（换账号时用）；
- 归档前**务必确认关于页显示「商店版」**，否则会发布一个没有付费入口的包；
- Android 要出上架用的 release 包时，需要自己的 keystore：
  生成后走 Secrets 注入，并**通过 config plugin** 写进 `android/app/build.gradle`
  （`expo prebuild` 会重写 `android/`，直接改文件会在下次 prebuild 丢失）。

---

## 六、替代方案：EAS Build

如果连签名也不想自己管，可以用 Expo 官方的云构建 —— 它**自带 iOS 签名托管**。

```bash
npx eas-cli build --platform all --profile preview
```

| | GitHub Actions（本仓库） | EAS Build |
| --- | --- | --- |
| 费用 | 免费额度（macOS runner 按 10 倍分钟计） | 免费额度有限，超出按量付费 |
| Android APK | ✅ 免 Secrets 直装 | ✅ |
| iOS 未签名 IPA（自签分发） | ✅ 本仓库的做法 | 需配置 |
| iOS 已签名（上架） | 需自行配签名 | ✅ 托管签名，最省事 |
| 可控性 | 高 | 中 |

---

## 七、开发校验

一条命令跑完守卫 + ESLint + 类型检查 + 单测（约 40 秒）：

```bash
node scripts/verify.mjs
node scripts/verify.mjs --only lint        # 只跑某一类
node scripts/verify.mjs --skip-guard       # 跳过架构守卫
```

> **不要用 `pnpm -r` 跑类型检查/测试**，会触发 pnpm 的 deps status check 并报
> `EEXIST symlink`。`verify.mjs` 已经绕开 pnpm，本地和 CI 跑的是同一条命令。

### 架构守卫

`node scripts/guard-architecture.mjs`，项目特有的约束（触感收口、`*-policy.ts`
依赖纯净、禁 `console.log`、禁 `@ts-ignore`、类型逃生舱棘轮、路由类型完整）。
存量债务记在 `scripts/guard-baseline.json`，**只减不增**。

> **加新规则时必须先造一个违规样本验证它会失败** —— 守卫自己踩过
> 「规则永远为真」的坑：一条永远通过的规则比没有规则更糟，因为它给人一种被保护了的错觉。

### ESLint

```bash
pnpm lint                                      # 全仓库，带警告预算
node node_modules/eslint/bin/eslint.js <文件>   # 只看某个文件（不带预算）
```

**0 error 是硬要求。** 警告有预算，写在 `scripts/verify.mjs` 的
`LINT_WARNING_BUDGET`，**只减不增**。

三个「不这么写就会坏」的点：

1. **`eslint` 必须锁 9.x，不能升 10。**
   `eslint-config-expo@57` 传递依赖 `eslint-plugin-react@7.37.5`，它调用
   `contextOrFilename.getFilename()` —— 这个 API 在 ESLint 10 被移除了。
   升上去不是「报错」，而是 **lint 直接起不来**。

2. **必须显式覆盖 `import/resolver`。**
   `eslint-config-expo` 的 `import/typescript` 块没有 `files` 作用域，
   会把整个 `import/resolver` 重写成只有 node 解析器，冲掉 `typescript: true` →
   `@/*` 别名全部解析失败，表现为 **114 个文件里 420 条假的 `import/no-unresolved`**。
   所以 `eslint.config.mjs` 里的 `qingjian/resolver` 块必须在 `...expoFlat` **之后**。

   > **假报错比不报更糟**：第一次跑就刷 420 条假错误，团队会直接不再相信这个工具。
   > 接入静态检查时，先把假阳性清零，再谈规则。

3. **`eslint-import-resolver-typescript` 必须是直接依赖。**
   解析器是在**运行目录**下 `require` 的，pnpm 的 isolated 链接不会提升它。

`react-hooks/refs` 等 4 条规则被降级为 warning（共 94 条已知欠债）：
它们检查渲染期读写 ref 这类并发渲染隐患，判断本身是对的，但改起来要动交互时序，
**必须真机验证**。先降级保证 CI 可用，**这 94 条是已知欠债，不是「没问题」**。

### 干净检出为什么跑不了类型检查（生成文件陷阱）

`apps/mobile/.expo/types/router.d.ts` 是 expo-router 生成的**路由类型**，被
`.gitignore` 排除（`.expo/` 整个目录是 Expo 的约定，且会被工具清空）。
`apps/mobile/tsconfig.json` 的 `include` 里显式列了它。

**缺这个文件时，`useSegments()` 的返回类型会退化成 1 元组 `[string]`**，
于是 `segments[1]` 报 `TS2493: Tuple type '[string]' of length '1' has no element at index '1'`。
也就是说：**干净检出（以及 CI）根本过不了 `pnpm typecheck`** ——
本地能过，只是因为跑过一次 `expo start` 把文件生成出来了。

三条相关事实：

1. **没有受支持的离线生成方式。** `setupTypedRoutes` 只被开发服务器
   （`MetroBundlerDevServer`）调用；`expo export`、`expo prebuild` 都**不会**生成它
   （已实测）。
2. **`expo-env.d.ts` 与类型检查无关。** 它被 gitignore，但删掉它类型检查照样过
   （已实测）—— 关键只有 `router.d.ts`。
3. **所以索引 `segments` 要用 `.at(i)` 而不是 `segments[i]`。**
   `at()` 对元组和数组都返回 `string | undefined`，两种情况都成立。
   见 `src/lib/detail-href.ts` 的注释。

> 代价要知道：CI 上没有这个文件时，expo-router 的 `Href` 联合类型是**宽松版**，
> 也就是 CI 里 `router.push({ pathname: '/typo' })` 这类错误抓不到（本地能抓到）。
> 另外 `scripts/guard-architecture.mjs` 的 `routes-typed` 规则在文件不存在时会
> **显式报告跳过**（而不是静默通过）—— 这是刻意的，静默通过比不检查更糟。

### 测试环境（vitest）

`apps/mobile/vitest.config.mts` 必须存在 —— 它只做一件事：把 tsconfig 的 `paths`
镜像给 vitest。

`src/` 下 **114 / 160** 个文件用 `@/` 别名，而 **vitest 默认不读 tsconfig 的 paths**。
缺这份配置时 `import ... from '@/lib/xxx'` 直接报 `Cannot find package '@'`。

这个坑的隐蔽之处在于：**它不会让任何测试失败**。它只是让那些模块「import 不进来」→
于是永远没有行为测试 → 而且没人会注意到缺了什么。
`src/player/controller.ts`（957 行，播放核心）就是这么一直零行为测试的 ——
**不是没人写，是写不了。**

### 给播放器模块写行为测试的套路

1. **只替身平台边界**（`react-native-track-player` / `expo-*`），
   **store 用真实的** `usePlayerStore`。这样断言的是「真的改了队列」，
   而不是「调了某个替身」。
2. 用 `vi.hoisted()` 建替身、在 `vi.mock()` 里引用它。
   `ensurePlayer` 也要替身掉，否则会真的去调 `setupPlayer`。
3. **断言重点放在两类「不会崩、只会静默出错」的地方**：
   index 运算，以及「原生失败时 store 不能动」（否则两端顺序永久错位，表现是静默放错歌）。
4. **当心模块级可变状态**：`controller.ts` 的 `forcedTranscode` 是模块级 `Set`，
   唯一重置入口是 `clearQueue()`。夹具用**自增 qid** 保证用例互不干扰。
5. **当心被测代码里的随机性。** `setShuffledOrder` 走 Fisher–Yates 洗牌，
   3 个元素时**有 1/6 的概率洗出和原顺序一样的结果** → 重排计划为空 →
   `TrackPlayer.move` 一次都不调用。此时任何「让 move 失败以验证降级路径」的用例
   都会变成 ~17% 概率偶发失败。**必须 `vi.spyOn(Math, 'random').mockReturnValue(0)`。**

   > 这个坑真的发生过：用例单独跑通过、全量跑偶发失败，一度被误判成跨文件状态泄漏。
   > 定位方法是把它连跑 30 次统计失败率（修复前 6/30，与 1/6 吻合；修复后 0/30）。

### 怎么确认测试真的有牙齿

新测试写完必须**故意把代码改坏、确认它会失败**（见「架构守卫」一节同样的理由）。
`controller.ts` 的行为测试做过 14 个变异（去掉边界守卫、改 index 运算、
反转原生调用顺序、把待激活项 id 与推给原生的 id 脱钩、缺省发行版改成商店版等），
**全部被抓住**。

### 仍未覆盖的

`controller.ts` 的 35 个导出里，行为测试覆盖了 16 个。
`bridge.tsx`（305 行，RNTP 事件 → store 的桥）目前仍只有源码断言，零行为测试 ——
它的决策逻辑已抽到 `playback-error-policy.ts`（有测试），剩下的多是接线。

---

## 八、上线检查清单

- [ ] 本地 `node scripts/verify.mjs` 10 项全绿（守卫 / ESLint / 类型 / 单测）
- [ ] Actions 页面能看到 `CI` 与 `Build` 两个工作流
- [ ] 手动跑一次 `Build`，两个平台都出包：`android-apk`、`ios-unsigned-ipa`
- [ ] 下载 APK 装到真机，按真机清单逐条验证
- [ ] 下载 IPA，用自签工具装到 iPhone，确认能起播
- [ ] 确认关于页显示的是预期的发行版
- [ ] 要上架时，按第五节出 `store` 版并再次确认关于页显示「商店版」
