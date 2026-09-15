/**
 * Tab 栏可见性（纯逻辑，不 import react-native / expo，可直接单测）。
 *
 * 目前只有一处例外：搜索态 `(tabs)/search/query`（输入框在导航栏那一屏）要隐藏 Tab 栏，
 * 让搜索变成沉浸式的。这条判断有两个消费者 ——
 *   · `(tabs)/_layout.tsx`：决定要不要藏栏；
 *   · `lib/bottom-space.ts`：藏了栏，底部就不能再让开 Tab 栏的高度。
 * 两处共用这一个函数，避免「栏藏了但底部还留着 49pt」这种各写一份导致的漂移。
 */
export function isTabBarHidden(segments: readonly (string | undefined)[]): boolean {
  return segments.at(0) === '(tabs)' && segments.at(1) === 'search' && segments.at(2) === 'query'
}
