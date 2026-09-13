/**
 * 跑马灯的纯几何/节奏策略：把「要不要滚、滚多远、滚多久」从组件里拆出来，
 * 这样这段规则可以直接跑单测，不用去断言组件源码里写了什么。
 */

/** 每像素滚多少毫秒：越大越慢 */
export const MARQUEE_MS_PER_PIXEL = 22
/** 两端各停多久再继续滚 */
export const MARQUEE_PAUSE_MS = 1400
/** 同一份文字之间的留白，避免尾部直接粘到下一轮开头 */
export const MARQUEE_GAP = 32
/** 文字比容器宽出这么多才算「装不下」，容忍测量误差 */
export const MARQUEE_OVERFLOW_THRESHOLD = 6

export interface MarqueeMetrics {
  /** 是否需要滚动 */
  shouldScroll: boolean
  /** 一份文字 + 间隙的总位移（正值，单向滚动） */
  distance: number
  /** 一次滚动的时长（毫秒） */
  duration: number
}

/**
 * 装不下才滚。位移取「文字宽度 + 间隙」：
 * 第二份文字正好接在第一份尾部，所以一轮走完位移恰好无缝接回起点，不需要反向反弹。
 */
export function marqueeMetrics(textWidth: number, containerWidth: number): MarqueeMetrics {
  const overflow = textWidth - containerWidth
  const shouldScroll = containerWidth > 0 && overflow > MARQUEE_OVERFLOW_THRESHOLD
  const distance = textWidth + MARQUEE_GAP
  return { shouldScroll, distance, duration: Math.round(distance * MARQUEE_MS_PER_PIXEL) }
}
