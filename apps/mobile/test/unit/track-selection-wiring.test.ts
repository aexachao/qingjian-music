import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode, readSource } from '../support/source'

/**
 * 多选（选择态）的接线。这类「状态机接错一处就静默失效」的地方用源码断言钉住：
 * 断了不会有报错，只是「点了没反应」或者「多选时点行还去播放」。
 *
 * 形态是 2026-09-15 拍板的：点工具条那颗图标 → **模态弹窗**里选（不是列表原地变形），
 * 弹窗里自带顶栏、勾选框与底部动作栏。这条最容易被改回去，所以也钉住。
 */
describe('批量选择入口在排序图标左侧', () => {
  it('工具条渲染「批量选择」图标，并且排在排序按钮前面', () => {
    const toolbar = 'components/list-toolbar.tsx'
    expect(hasCode(toolbar, 'accessibilityLabel="批量选择"')).toBe(true)
    const source = readSource(toolbar)
    expect(source.indexOf('批量选择')).toBeLessThan(source.indexOf('name="sort"'))
  })
})

describe('多选是模态弹窗，列表页自己不进入选择态', () => {
  it('两个宿主都用 TrackSelectionModal 并只负责开关', () => {
    for (const path of ['screens/track-list-screen.tsx', 'screens/album-detail.tsx']) {
      expect(hasCode(path, '<TrackSelectionModal'), path).toBe(true)
      expect(hasCode(path, 'onStartSelection={() => setSelecting(true)}'), path).toBe(true)
      expect(hasCode(path, 'visible={selecting}'), path).toBe(true)
    }
  })

  it('列表页里不再出现选择态的栏（它们只属于弹窗）', () => {
    for (const path of ['screens/track-list-screen.tsx', 'screens/album-detail.tsx']) {
      expect(hasNoCode(path, 'SelectionToolbarBar'), path).toBe(true)
      expect(hasNoCode(path, 'SelectionActionBar'), path).toBe(true)
      expect(hasNoCode(path, 'useTrackSelection'), path).toBe(true)
    }
  })

  it('弹窗是模态（slide 进场）且自带顶栏 / 勾选框 / 动作栏 / 歌单选择器', () => {
    const modal = 'components/track-selection-modal.tsx'
    expect(hasCode(modal, 'animationType="slide"')).toBe(true)
    expect(hasCode(modal, 'onRequestClose={handleClose}')).toBe(true)
    expect(hasCode(modal, 'presentationStyle="pageSheet"')).toBe(true)
    expect(hasCode(modal, 'allowSwipeDismissal')).toBe(true)
    expect(hasCode(modal, '<SelectionToolbarBar')).toBe(true)
    expect(hasCode(modal, 'selection={{ selected: selection.isSelected(item.id)')).toBe(true)
    expect(hasCode(modal, '<SelectionActionBar')).toBe(true)
    expect(hasCode(modal, '<PlaylistPickerSheet')).toBe(true)
    // 复用宿主那份分页查询，不另开一套
    expect(hasCode(modal, 'onEndReached={onEndReached}')).toBe(true)
  })
})

describe('队列页的历史行与待播行共用一套行组件（第 4 轮）', () => {
  it('历史行用 QueueRow（isHistory），菜单用 list 上下文并把完整曲目传下去', () => {
    const queue = readSource('components/player/player-queue.tsx')
    expect(queue).toContain('<QueueRow')
    expect(queue).toContain('isHistory')
    expect(queue).toContain('...(isHistory')
    expect(queue).toContain("{ track: item.track }")
    expect(queue).toContain("context={isHistory ? 'list' : 'upcoming'}")
  })

  it('点空白关菜单不会触发播放：行点按里有菜单冷却守卫', () => {
    // 菜单关闭后 450ms 内的点按必须被吞掉，否则「点空白处收起菜单」会顺手播这一行
    expect(hasCode('components/player/player-queue.tsx', 'if (isGlobalMenuInteracting()) return')).toBe(true)
  })

  it('历史行也支持左滑删除（删除的是这一条历史，不是队列项）', () => {
    const queue = readSource('components/player/player-queue.tsx')
    expect(queue).toContain('removeHistoryItem(item.qid)')
    // 历史行不再被排除在 Swipeable 之外
    expect(hasNoCode('components/player/player-queue.tsx', 'if (isHistory) return content')).toBe(true)
  })
})

describe('选择态里的行与动作', () => {
  it('点行是「切换选中」，不是播放', () => {
    expect(hasCode('components/track-row.tsx', 'if (selection) {')).toBe(true)
    expect(hasCode('components/track-row.tsx', 'selection.onToggle()')).toBe(true)
  })

  it('列表行右侧只有「···」：收藏已挪进菜单（第 4 轮），选择态里连「···」也收起', () => {
    const row = 'components/track-row.tsx'
    expect(hasCode(row, '{!selection ? <TrackMoreButton')).toBe(true)
    // 行里不该再有收藏按钮（收藏在「···」菜单里）
    expect(hasNoCode(row, '加入收藏')).toBe(true)
    expect(hasNoCode(row, 'favoriteBtn')).toBe(true)
  })

  it('顶部条：三态图标 + 「全选」+ 右侧「N 首」，没有「清除选择」那一颗', () => {
    const bar = 'components/selection-bar.tsx'
    expect(hasCode(bar, "none: 'circle'")).toBe(true)
    expect(hasCode(bar, "partial: 'circleIndeterminate'")).toBe(true)
    expect(hasCode(bar, "all: 'checkmarkCircle'")).toBe(true)
    expect(hasCode(bar, "accessibilityLabel={SELECT_ALL_LABEL}")).toBe(true)
    expect(hasNoCode(bar, '清除选择')).toBe(true)
  })

  it('底部动作栏：中性色（不再整条染品牌红），背景铺到屏幕底边', () => {
    const bar = 'components/selection-bar.tsx'
    expect(hasCode(bar, 'item.enabled ? colors.textPrimary : colors.textQuaternary')).toBe(true)
    expect(hasNoCode(bar, 'item.enabled ? colors.accent')).toBe(true)
    expect(hasCode(bar, 'paddingBottom: insets.bottom')).toBe(true)
    expect(hasCode(bar, 'bottom: 0')).toBe(true)
  })

  it('底部动作栏四颗：播放 / 加入播放列表 / 下载 / 添加到歌单', () => {
    const bar = 'components/selection-bar.tsx'
    for (const label of ['播放', '加入播放列表', '下载', '添加到歌单']) {
      expect(hasCode(bar, `label: '${label}'`), label).toBe(true)
    }
    // 第 7 轮起「下载」真的接上了（不再是灰的占位）
    expect(hasCode(bar, 'onPress: onDownload')).toBe(true)
  })
})
