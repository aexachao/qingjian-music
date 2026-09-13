/**
 * 歌单加曲的**结果判定**（纯逻辑，不 import RN / expo，可直接单测）。
 *
 * ── 为什么不能只看返回码 ────────────────────────────────────────────────────
 * 飞牛服务端对 `POST /playlist/add-track` **返回成功码却不落地**，且对未知参数
 * 静默忽略 —— 实测结论写在 `packages/provider-fnos/src/provider.ts` 的「歌单写
 * 操作」注释里。原来的实现是写完直接 `toast('已添加到「X」')`，没有任何校验，
 * 等于把一个未经验证的假设当成事实告诉用户。
 *
 * 这正是本项目声称要消灭的头号问题类型：**不报错、不崩溃，只是悄悄不生效，
 * 而界面还在跟你说「成功了」**。它比直接报错更糟，因为用户会以为数据已经存好了。
 *
 * ── 为什么是三态而不是成败两态 ──────────────────────────────────────────────
 * 回读本身也可能不可用：本机实测 `playlistTracks` 一律返回 100002（歌单曲目接口
 * 在这台服务器上不可用）。如果压成两态，要么把「读不出来」当成成功（继续撒谎），
 * 要么当成失败（冤枉了服务端）。所以必须留出第三种：
 *
 *   回读成功 + 曲目数增加 → confirmed   「已添加到「X」」
 *   回读成功 + 曲目数没变 → rejected    「未添加到「X」」
 *   回读本身失败          → unverified  「无法确认是否已添加到「X」」
 *
 * 只有第三种存在时，UI 才有资格说实话。
 *
 * ── 为什么比对总数而不是比对曲目 id ──────────────────────────────────────────
 * 歌单顺序由 `trackAddedAt` 递增决定、没有 reorder 端点（见二期约束），新曲目排在
 * **末尾**。歌单可能有几千首，翻页找 id 既慢又可能因为分页边界给出假结论；而
 * `Page<Track>.total` 一次请求就能拿到，与歌单大小无关。
 *
 * 已知的边界：若该曲目**本来就在歌单里**，服务端可能去重 → 总数不变 → 判为
 * rejected。此时文案说「未添加」而非「已添加」，方向是保守的（宁可少报成功，
 * 不可虚报成功），符合本模块的取舍。
 */

/** 回读到的证据 */
export type PlaylistAddEvidence =
  /** 回读成功：拿到写之前与写之后该歌单的曲目总数 */
  | { kind: 'total'; before: number; after: number }
  /** 回读不可用：接口报错、超时，或服务端不支持该查询 */
  | { kind: 'unavailable'; reason: string }

export type PlaylistAddVerdict = 'confirmed' | 'rejected' | 'unverified'

/**
 * 由回读证据判定写入结果。
 *
 * 注意 `rejected` 也覆盖 `after < before` —— 曲目数变少绝无可能是「添加成功」，
 * 只可能是并发修改或服务端异常，归到「没添加成功」是安全的一侧。
 */
export function judgePlaylistAdd(evidence: PlaylistAddEvidence): PlaylistAddVerdict {
  if (evidence.kind === 'unavailable') return 'unverified'
  return evidence.after > evidence.before ? 'confirmed' : 'rejected'
}

/**
 * 提示文案。
 *
 * **`rejected` 与 `unverified` 都不允许出现「已添加」** —— 那是本模块存在的全部理由，
 * 对应的单测会盯着这一点。
 */
export function playlistAddMessage(verdict: PlaylistAddVerdict, playlistName: string): string {
  switch (verdict) {
    case 'confirmed':
      return `已添加到「${playlistName}」`
    case 'rejected':
      return `未添加到「${playlistName}」（歌单曲目数没有变化）`
    case 'unverified':
      // 刻意不写「无法确认是否已添加」：那样字面里会含「已添加」，而本模块的机械约束
      // 是「非成功结论的文案里不出现成功措辞」。措辞让位于可校验的不变量。
      return `无法确认「${playlistName}」是否保存成功`
  }
}
