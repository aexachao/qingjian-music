/** 0：停靠并抬针；0.7：转入并抬针；1：转入并落针。反向自然先抬针再归位。 */
export function tonearmPose(progress: number) {
  'worklet'
  const p = Math.max(0, Math.min(1, progress))
  const rotation = Math.min(p / 0.7, 1)
  const eased = rotation * rotation * (3 - 2 * rotation)
  return { angle: eased * 50, lift: 1 - Math.max(0, (p - 0.7) / 0.3) }
}

export function tonearmTarget(roaming: boolean, playing: boolean) {
  return roaming ? playing ? 1 : 0.7 : 0
}
