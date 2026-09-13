/**
 * 发行版判定：把构建期的 `EXPO_PUBLIC_EDITION` 收敛成两个明确的发行版。
 *
 * ── 两个发行版 ──────────────────────────────────────────────────────────────
 *   community —— GitHub 上分发的完整版：**全功能，不含任何购买链路**
 *   store     —— 上架 App Store 的商店版：接入永久会员购买
 *
 * ── 为什么缺省是 community ──────────────────────────────────────────────────
 * 没有显式指定发行版的构建（本地 `expo start`、任何忘了设变量的流水线）
 * 一律当作完整版。反过来的话，「忘了设变量」的自签构建会让用户看到一个他
 * 根本买不了的付费墙 —— 那是坏掉的应用，比少赚一笔严重得多。
 *
 * 所以商店版必须**显式**声明 `EXPO_PUBLIC_EDITION=store`，而不是靠缺省。
 *
 * ── 打包期内联，不是运行时读取 ──────────────────────────────────────────────
 * Metro 会把 `process.env.EXPO_PUBLIC_*` 静态替换成字面量，所以改环境变量必须
 * 重新打包才生效，运行期改不动（这正是我们要的：用户不能靠改配置解锁功能）。
 *
 * 关于页会展示当前发行版 —— 这是「配置真的生效了吗」唯一可见的验证面。
 * 构建脚本里写对了，不等于产物里生效了。
 */

export type Edition = 'community' | 'store'

/** 当前构建的发行版。除显式 `store` 外一律 `community`（拼错的值也回退到这里）。 */
export const EDITION: Edition = process.env.EXPO_PUBLIC_EDITION === 'store' ? 'store' : 'community'

/** 是否为 GitHub 分发的完整版（全功能、不含购买链路） */
export const isCommunityEdition: boolean = EDITION === 'community'

/** 关于页展示用的发行版名称 */
export const EDITION_LABEL: string = isCommunityEdition ? '完整版' : '商店版'
