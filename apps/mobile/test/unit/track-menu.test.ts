import { describe, expect, it } from 'vitest'
import {
  nextPlayTargetIndex,
  queueEndTargetIndex,
  TRACK_MENU_ICON,
  TRACK_MENU_IDS,
  TRACK_MENU_LABEL,
  trackMenuGroups,
  trackMenuIcon,
  trackMenuIds,
  trackMenuLabel,
  type TrackMenuCapabilities,
  type TrackMenuId,
} from '../../src/lib/track-menu'

const ALL: TrackMenuCapabilities = {
  canFavorite: true,
  isFavoriteKnown: true,
  canWritePlaylist: true,
  hasAlbum: true,
  hasArtist: true,
  hasTrack: true,
  canDownload: true,
  isDownloaded: false,
}

const NONE: TrackMenuCapabilities = {
  canFavorite: false,
  isFavoriteKnown: false,
  canWritePlaylist: false,
  hasAlbum: false,
  hasArtist: false,
  // hasTrack 不是「后端能力」，而是「手上有没有完整曲目」——列表行恒为 true，
  // 所以「能力全关」这套里它也照旧为 true；没有曲目的情况单独有用例。
  hasTrack: true,
  canDownload: false,
  isDownloaded: false,
}

function idsOf(context: 'list' | 'upcoming' | 'current', capabilities = ALL, extra = {}) {
  return trackMenuIds({ context, capabilities, ...extra })
}

describe('快捷菜单条目定义（按上下文）', () => {
  it('列表上下文：排队三项 + 分享 + 信息 + 跳转 + 收藏（收藏排最后）', () => {
    expect(idsOf('list')).toEqual([
      'play-next',
      'add-to-queue',
      'add-to-playlist',
      // 第 7 轮：下载（没下过是「下载」，下过是「删除下载」）
      'download',
      'share-song',
      'song-info',
      'goto-album',
      'goto-artist',
      // 第 4 轮：收藏从列表行右侧的图标挪进菜单，并排**最后**一条
      'toggle-favorite',
    ])
  })

  it('没有完整曲目时，不摆「下一首播放 / 加入队列」（历史行可能是老快照 / 电台项）', () => {
    const ids = idsOf('list', { ...ALL, hasTrack: false })
    expect(ids).toEqual([
      'add-to-playlist',
      'share-song',
      'song-info',
      'goto-album',
      'goto-artist',
      'toggle-favorite',
    ])
    // 有完整曲目时这两条才在
    expect(idsOf('list')).toContain('play-next')
    expect(idsOf('list')).toContain('add-to-queue')
  })

  it('列表上下文不出现「分享歌词」（列表行不预取歌词）与队列内操作', () => {
    const ids = idsOf('list')
    expect(ids).not.toContain('share-lyrics')
    expect(ids).not.toContain('move-to-end')
    expect(ids).not.toContain('remove-from-queue')
    expect(ids).not.toContain('remove-from-history')
  })

  it('历史行（isHistory=true）显示「从历史记录移除」而非「从队列移除」', () => {
    const ids = idsOf('list', ALL, { isHistory: true })
    expect(ids).toContain('remove-from-history')
    expect(ids).not.toContain('remove-from-queue')
    // 历史行应该排在最后
    expect(ids[ids.length - 1]).toBe('remove-from-history')
  })

  it('当前上下文：歌单 + 分享（含歌词）+ 信息 + 跳转', () => {
    expect(idsOf('current')).toEqual([
      'add-to-playlist',
      'share-song',
      'share-lyrics',
      'song-info',
      'goto-album',
      'goto-artist',
    ])
  })

  it('当前上下文不出现排队/队列内操作与歌词偏移快捷项', () => {
    const ids = idsOf('current')
    expect(ids).not.toContain('play-next')
    expect(ids).not.toContain('add-to-queue')
    expect(ids).not.toContain('remove-from-queue')
    expect(ids).not.toContain('lyric-offset')
  })

  it('能力全关时，可选项全部消失，只留无条件的条目', () => {
    expect(idsOf('list', NONE)).toEqual(['play-next', 'add-to-queue', 'share-song', 'song-info'])
    expect(idsOf('current', NONE)).toEqual(['share-song', 'share-lyrics', 'song-info'])
    // 待播上下文的移动条目只跟位置有关，与能力无关；能力全关时：队列内操作 + 无条件的分享和信息 + 删除（排最后）
    expect(idsOf('upcoming', NONE, { position: 2, upcomingCount: 4 })).toEqual([
      'play-next',
      'move-to-end',
      'share-song',
      'song-info',
      'remove-from-queue',
    ])
  })

  it('后端不支持歌单写入时不出现「添加到歌单」', () => {
    expect(idsOf('current', { ...ALL, canWritePlaylist: false })).not.toContain('add-to-playlist')
    expect(idsOf('list', { ...ALL, canWritePlaylist: false })).not.toContain('add-to-playlist')
  })
})

describe('待播行条目规则', () => {
  it('处在中间位置时条目齐全：队列内操作 + 完整菜单 + 收藏和删除排最后', () => {
    expect(idsOf('upcoming', ALL, { position: 2, upcomingCount: 4 })).toEqual([
      'play-next',
      'move-to-end',
      'add-to-playlist',
      'share-song',
      'song-info',
      'goto-album',
      'goto-artist',
      'toggle-favorite',
      'remove-from-queue',
    ])
  })

  it('已经在下一首的位置上时不再出现「下一首播放」（死条目）', () => {
    expect(idsOf('upcoming', ALL, { position: 1, upcomingCount: 4 })).not.toContain('play-next')
  })

  it('已经在队尾时不再出现「移到队尾」', () => {
    expect(idsOf('upcoming', ALL, { position: 4, upcomingCount: 4 })).not.toContain('move-to-end')
  })

  it('后端不支持收藏、或收藏状态未知时都不出现收藏条目', () => {
    expect(idsOf('upcoming', { ...ALL, canFavorite: false }, { position: 2, upcomingCount: 4 })).not.toContain(
      'toggle-favorite',
    )
    expect(idsOf('upcoming', { ...ALL, isFavoriteKnown: false }, { position: 2, upcomingCount: 4 })).not.toContain(
      'toggle-favorite',
    )
  })

  it('待播只有一行时不会出现任何移动类条目', () => {
    const ids = idsOf('upcoming', ALL, { position: 1, upcomingCount: 1 })
    expect(ids).not.toContain('play-next')
    expect(ids).not.toContain('move-to-end')
    expect(ids).toEqual([
      'add-to-playlist',
      'share-song',
      'song-info',
      'goto-album',
      'goto-artist',
      'toggle-favorite',
      'remove-from-queue',
    ])
  })
})

describe('iOS 分组顺序', () => {
  it('列表上下文固定五组：队列 → 下载 → 分享 → 信息 → 收藏（收藏排最后）', () => {
    expect(trackMenuGroups(idsOf('list'), 'list', 'up')).toEqual([
      { id: 'group-queue', ids: ['play-next', 'add-to-queue', 'add-to-playlist'] },
      { id: 'group-download', ids: ['download'] },
      { id: 'group-share', ids: ['share-song'] },
      { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
      { id: 'group-favorite', ids: ['toggle-favorite'] },
    ])
  })

  it('已下载的那首歌，菜单里是「删除下载」而不是「下载」', () => {
    const ids = idsOf('list', { ...ALL, isDownloaded: true })
    expect(ids).toContain('remove-download')
    expect(ids).not.toContain('download')
  })

  it('历史行（isHistory=true）把「从历史记录移除」放在最末（破坏性操作）', () => {
    expect(trackMenuGroups(idsOf('list', ALL, { isHistory: true }), 'list', 'up')).toEqual([
      { id: 'group-queue', ids: ['play-next', 'add-to-queue', 'add-to-playlist'] },
      { id: 'group-download', ids: ['download'] },
      { id: 'group-share', ids: ['share-song'] },
      { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
      { id: 'group-favorite', ids: ['toggle-favorite'] },
      { id: 'group-remove', ids: ['remove-from-history'] },
    ])
  })

  it('当前上下文向下弹出：歌单 → 分享 → 信息', () => {
    expect(trackMenuGroups(idsOf('current'), 'current', 'down')).toEqual([
      { id: 'group-playlist', ids: ['add-to-playlist'] },
      { id: 'group-share', ids: ['share-song', 'share-lyrics'] },
      { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
    ])
  })

  it('当前上下文向上弹出：组顺序与组内顺序整体反向', () => {
    expect(trackMenuGroups(idsOf('current'), 'current', 'up')).toEqual([
      { id: 'group-details', ids: ['goto-artist', 'goto-album', 'song-info'] },
      { id: 'group-share', ids: ['share-lyrics', 'share-song'] },
      { id: 'group-playlist', ids: ['add-to-playlist'] },
    ])
  })

  it('待播上下文也有分组：队列内操作 + 完整菜单 + 收藏和删除', () => {
    const ids = idsOf('upcoming', ALL, { position: 2, upcomingCount: 4 })
    expect(trackMenuGroups(ids, 'upcoming', 'up')).toEqual([
      { id: 'group-queue-ops', ids: ['play-next', 'move-to-end'] },
      { id: 'group-actions', ids: ['add-to-playlist', 'share-song'] },
      { id: 'group-details', ids: ['song-info', 'goto-album', 'goto-artist'] },
      { id: 'group-favorite', ids: ['toggle-favorite'] },
      { id: 'group-remove', ids: ['remove-from-queue'] },
    ])
  })

  it('能力关掉后空组会被丢掉，不留空分组', () => {
    const groups = trackMenuGroups(idsOf('current', NONE), 'current', 'down')
    expect(groups).toEqual([
      { id: 'group-share', ids: ['share-song', 'share-lyrics'] },
      { id: 'group-details', ids: ['song-info'] },
    ])
  })
})

describe('文案与图标', () => {
  it('每个条目都配了文案与两端图标（新增条目漏配会被抓出来）', () => {
    for (const id of TRACK_MENU_IDS) {
      expect(TRACK_MENU_LABEL[id], `${id} 缺文案`).toBeTruthy()
      expect(TRACK_MENU_ICON[id]?.ios, `${id} 缺 iOS 图标`).toBeTruthy()
      expect(TRACK_MENU_ICON[id]?.android, `${id} 缺 Android 图标`).toBeTruthy()
    }
  })

  it('收藏条目的文案与图标随状态变化', () => {
    expect(trackMenuLabel('toggle-favorite', { isFavorite: false })).toBe('喜欢')
    expect(trackMenuLabel('toggle-favorite', { isFavorite: true })).toBe('取消喜欢')
    expect(trackMenuIcon('toggle-favorite', { isFavorite: false }).ios).toBe('heart')
    expect(trackMenuIcon('toggle-favorite', { isFavorite: true }).ios).toBe('heart.slash')
  })

  it('其余条目文案与状态无关', () => {
    const ids = TRACK_MENU_IDS.filter((id): id is TrackMenuId => id !== 'toggle-favorite')
    for (const id of ids) {
      expect(trackMenuLabel(id, { isFavorite: true })).toBe(trackMenuLabel(id, { isFavorite: false }))
    }
  })
})

describe('队列位置换算', () => {
  it('「下一首播放」的目标下标是 1（当前曲目恒在 0）', () => {
    expect(nextPlayTargetIndex()).toBe(1)
  })

  it('「移到队尾」的目标下标等于待播行数（队列总长 = 待播数 + 当前曲目）', () => {
    expect(queueEndTargetIndex(4)).toBe(4)
    expect(queueEndTargetIndex(1)).toBe(1)
  })
})
