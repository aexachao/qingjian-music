import { describe, expect, it } from 'vitest'
import { planTailReorder } from '../../src/player/queue-reorder'

const id = (value: string) => value

/**
 * 纯 JS 模拟 RNTP 的 move 语义，用来验证 planTailReorder 产出的 moves
 * 能真正把 current 变成 desired。只在测试里需要，所以放在测试文件里。
 */
function applyMoves<T>(current: T[], moves: Array<[number, number]>): T[] {
  const result = [...current]
  for (const [from, to] of moves) {
    const [moved] = result.splice(from, 1)
    result.splice(to, 0, moved!)
  }
  return result
}

/** 重排后的结果应恰好等于目标顺序（纯 move 语义模拟） */
function reordersTo(current: string[], desired: string[]): boolean {
  const moves = planTailReorder(current, desired, id)
  return applyMoves(current, moves).join(',') === desired.join(',')
}

describe('队列重排 move 规划', () => {
  it('洗牌乱序能收敛到目标顺序', () => {
    const current = ['a', 'b', 'c', 'd', 'e']
    const desired = ['e', 'c', 'a', 'd', 'b']
    expect(reordersTo(current, desired)).toBe(true)
  })

  it('目标顺序与当前一致时不产生任何 move', () => {
    expect(planTailReorder(['a', 'b', 'c'], ['a', 'b', 'c'], id)).toEqual([])
  })

  it('整体倒序也能收敛', () => {
    expect(reordersTo(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toBe(true)
  })

  it('把已乱序的队列还原成原始顺序也能收敛', () => {
    const shuffled = ['c', 'a', 'e', 'b', 'd']
    const original = ['a', 'b', 'c', 'd', 'e']
    expect(reordersTo(shuffled, original)).toBe(true)
  })

  it('move 数量不超过 n-1（每首最多被挪一次）', () => {
    const current = Array.from({ length: 20 }, (_, i) => `t${i}`)
    const desired = [...current].reverse()
    const moves = planTailReorder(current, desired, id)
    expect(moves.length).toBeLessThanOrEqual(current.length - 1)
    expect(applyMoves(current, moves)).toEqual(desired)
  })
})
