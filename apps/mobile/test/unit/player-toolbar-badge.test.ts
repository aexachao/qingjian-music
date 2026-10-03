import { describe, expect, it } from 'vitest'
import type { PlayMode } from '@qj/core-domain'
import { getPlayerToolbarBadge } from '../../src/components/player/player-toolbar-badge'

const cases: { name: string; playMode: PlayMode; badge: ReturnType<typeof getPlayerToolbarBadge> }[] = [
  { name: 'no mode', playMode: { shuffle: false, repeat: 'off' }, badge: null },
  { name: 'shuffle', playMode: { shuffle: true, repeat: 'off' }, badge: { icon: 'shuffle', label: '随机播放' } },
  { name: 'shuffle with repeat queue', playMode: { shuffle: true, repeat: 'queue' }, badge: { icon: 'shuffle', label: '随机播放' } },
  { name: 'repeat one takes priority over shuffle', playMode: { shuffle: true, repeat: 'one' }, badge: { icon: 'repeatOne', label: '单曲循环' } },
  { name: 'repeat queue', playMode: { shuffle: false, repeat: 'queue' }, badge: { icon: 'repeat', label: '列表循环' } },
  { name: 'repeat one', playMode: { shuffle: false, repeat: 'one' }, badge: { icon: 'repeatOne', label: '单曲循环' } },
]

describe('播放工具栏队列模式 badge', () => {
  it.each(cases)('uses $name', ({ playMode, badge }) => {
    expect(getPlayerToolbarBadge(playMode)).toEqual(badge)
  })
})
