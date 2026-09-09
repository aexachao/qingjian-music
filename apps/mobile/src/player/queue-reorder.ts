/**
 * 队列重排的纯逻辑：算出一串按序应用的 move，把 current 变成 desired。
 *
 * RNTP 没有一次性重排队列的 API，只能用 move(from, to) 逐首挪；
 * move 每执行一次，被跨过的项会整体平移，所以不能直接按「目标位置」换算，
 * 而要边挪边跟踪当前顺序。这里把整套换算抽成纯函数，方便单测。
 */

/**
 * 计算把 current 重排成 desired 所需的按序 move 列表。
 * 每个 move 是 [from, to]（均为数组下标）；按列表顺序依次应用即可收敛。
 * 元素以 key 识别（同一队列里 key 唯一）。
 */
export function planTailReorder<T>(current: readonly T[], desired: readonly T[], key: (item: T) => string): Array<[number, number]> {
  const order = current.map(key)
  const moves: Array<[number, number]> = []
  for (let offset = 0; offset < desired.length; offset += 1) {
    const targetKey = key(desired[offset]!)
    const currentOffset = order.indexOf(targetKey)
    if (currentOffset < 0 || currentOffset === offset) continue
    moves.push([currentOffset, offset])
    const [moved] = order.splice(currentOffset, 1)
    order.splice(offset, 0, moved!)
  }
  return moves
}

/** 纯 JS 模拟 move 语义，用于验证 moves 能真正把 current 变成 desired */
export function applyMoves<T>(current: T[], moves: Array<[number, number]>): T[] {
  const result = [...current]
  for (const [from, to] of moves) {
    const [moved] = result.splice(from, 1)
    result.splice(to, 0, moved!)
  }
  return result
}
