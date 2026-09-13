import { describe, expect, it } from 'vitest'
import {
  judgePlaylistAdd,
  playlistAddMessage,
  type PlaylistAddEvidence,
} from '../../src/lib/playlist-add-policy'

const total = (before: number, after: number): PlaylistAddEvidence => ({
  kind: 'total',
  before,
  after,
})
const unavailable = (reason = '100002'): PlaylistAddEvidence => ({ kind: 'unavailable', reason })

describe('歌单加曲结果判定', () => {
  it('回读曲目数增加 → confirmed', () => {
    expect(judgePlaylistAdd(total(3, 4))).toBe('confirmed')
    expect(judgePlaylistAdd(total(0, 1))).toBe('confirmed')
    expect(judgePlaylistAdd(total(199, 203))).toBe('confirmed')
  })

  it('回读曲目数不变 → rejected（服务端返回成功码却不落地，实测就是这条）', () => {
    expect(judgePlaylistAdd(total(3, 3))).toBe('rejected')
    expect(judgePlaylistAdd(total(0, 0))).toBe('rejected')
  })

  it('回读曲目数反而减少 → rejected，绝不可能是「添加成功」', () => {
    expect(judgePlaylistAdd(total(5, 4))).toBe('rejected')
    expect(judgePlaylistAdd(total(5, 0))).toBe('rejected')
  })

  it('回读根本不可用 → unverified（本机 playlistTracks 返回 100002 走这条）', () => {
    expect(judgePlaylistAdd(unavailable())).toBe('unverified')
    expect(judgePlaylistAdd(unavailable('Network request failed'))).toBe('unverified')
  })

  it('判定只取决于证据，同样的证据必得同样的结论', () => {
    for (const evidence of [total(1, 2), total(1, 1), unavailable()]) {
      expect(judgePlaylistAdd(evidence)).toBe(judgePlaylistAdd(evidence))
    }
  })
})

describe('歌单加曲提示文案', () => {
  it('confirmed 明确说已添加，并带歌单名', () => {
    const message = playlistAddMessage('confirmed', '通勤')
    expect(message).toContain('通勤')
    expect(message).toContain('已添加')
  })

  it('rejected 不得出现「已添加」——否则就是本函数要消灭的那种谎报', () => {
    const message = playlistAddMessage('rejected', '通勤')
    expect(message).not.toContain('已添加')
    expect(message).toContain('通勤')
  })

  it('unverified 不得出现「已添加」——回读不可用时唯一诚实的说法', () => {
    const message = playlistAddMessage('unverified', '通勤')
    expect(message).not.toContain('已添加')
    expect(message).toContain('无法确认')
    expect(message).toContain('通勤')
  })

  it('三种结论的文案互不相同', () => {
    const messages = (['confirmed', 'rejected', 'unverified'] as const).map((v) =>
      playlistAddMessage(v, '通勤'),
    )
    expect(new Set(messages).size).toBe(3)
  })

  it('歌单名里的怪异字符原样带出，不做转义或截断', () => {
    expect(playlistAddMessage('confirmed', '《我的》歌单 #1')).toContain('《我的》歌单 #1')
  })
})
