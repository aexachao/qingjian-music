import { describe, expect, it } from 'vitest'
import { tonearmPose, tonearmTarget } from '../../src/screens/home/turntable-motion'

describe('turntable mechanical sequencing', () => {
  it('rotates only while the needle is fully raised, then lowers at a fixed angle', () => {
    for (const p of [0, 0.1, 0.35, 0.6, 0.7]) expect(tonearmPose(p).lift).toBe(1)
    expect(tonearmPose(0).angle).toBe(0)
    expect(tonearmPose(0.35).angle).toBeCloseTo(25)
    for (const p of [0.7, 0.8, 0.9, 1]) expect(tonearmPose(p).angle).toBe(50)
    expect(tonearmPose(1).lift).toBeCloseTo(0)
  })
  it('pauses above the record and resumes by lowering only; exit lifts before parking', () => {
    expect(tonearmTarget(true, false)).toBe(0.7)
    expect(tonearmTarget(true, true)).toBe(1)
    expect(tonearmTarget(false, false)).toBe(0)
    expect(tonearmTarget(false, true)).toBe(0)
    const exiting = [1, 0.85, 0.7, 0.35, 0].map(tonearmPose)
    expect(exiting[1].lift).toBeCloseTo(0.5)
    expect(exiting[1].angle).toBe(50)
    expect(exiting[3].lift).toBe(1)
    expect(exiting[3].angle).toBeCloseTo(25)
  })
})
