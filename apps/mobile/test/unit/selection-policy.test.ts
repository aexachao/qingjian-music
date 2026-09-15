import { describe, expect, it } from 'vitest'
import {
  isAllSelected,
  isSelected,
  selectionCountText,
  selectionState,
  toggleAll,
  toggleSelected,
} from '../../src/lib/selection-policy'

describe('单首的选中切换', () => {
  it('没选中就追加到末尾，保持选择顺序', () => {
    expect(toggleSelected(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('已选中就删掉它', () => {
    expect(toggleSelected(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('不会重复选中同一首', () => {
    const once = toggleSelected([], 'a')
    const twice = toggleSelected(toggleSelected(once, 'a'), 'a')
    expect(twice).toEqual(['a'])
  })

  it('isSelected 按值判断', () => {
    expect(isSelected(['a', 'b'], 'b')).toBe(true)
    expect(isSelected(['a', 'b'], 'z')).toBe(false)
  })
})

describe('全选 / 取消全选', () => {
  const loaded = ['a', 'b', 'c']

  it('候选集为空时不算全选（避免 0 选中显示已全选）', () => {
    expect(isAllSelected([], [])).toBe(false)
    expect(toggleAll([], [])).toEqual([])
  })

  it('未全选 → 合并候选集，且不重复', () => {
    expect(toggleAll(['z'], loaded)).toEqual(['z', 'a', 'b', 'c'])
    expect(isAllSelected(toggleAll(['a'], loaded), loaded)).toBe(true)
  })

  it('已全选 → 只清掉候选集里的那些，不动别的', () => {
    expect(toggleAll(['a', 'b', 'c', 'z'], loaded)).toEqual(['z'])
  })

  it('候选集变大（加载了下一页）后仍然语义正确', () => {
    const afterSelectAll = toggleAll([], loaded)
    const moreLoaded = [...loaded, 'd']
    expect(isAllSelected(afterSelectAll, moreLoaded)).toBe(false)
    expect(toggleAll(afterSelectAll, moreLoaded)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('文案与三态', () => {
  it('计数只写「N 首」（不写「已选 N 首」「已加载 N 首」）', () => {
    expect(selectionCountText(0)).toBe('0 首')
    expect(selectionCountText(3)).toBe('3 首')
  })

  it('三态图标：未选 / 半选 / 全选', () => {
    const loaded = ['a', 'b', 'c']
    expect(selectionState([], loaded)).toBe('none')
    expect(selectionState(['a'], loaded)).toBe('partial')
    expect(selectionState(['a', 'b', 'c'], loaded)).toBe('all')
  })

  it('候选集还没加载出来时算「未选」，不能显示成已全选', () => {
    expect(selectionState([], [])).toBe('none')
    expect(selectionState(['a'], [])).toBe('none')
  })
})
