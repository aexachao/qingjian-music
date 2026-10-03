import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: Record<string, number>) => void>(),
  addEventListener: vi.fn((event: string, listener: (payload?: Record<string, number>) => void) => {
    mock.listeners.set(event, listener)
  }),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seekTo: vi.fn(),
  seekBy: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
}))

vi.mock('react-native-track-player', () => ({
  default: {
    addEventListener: mock.addEventListener,
    play: mock.play,
    pause: mock.pause,
    stop: mock.stop,
    seekTo: mock.seekTo,
    getProgress: async () => ({ position: 30 }),
  },
  Event: {
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
    RemoteSeek: 'remote-seek',
    RemoteJumpForward: 'remote-jump-forward',
    RemoteJumpBackward: 'remote-jump-backward',
    RemoteDuck: 'remote-duck',
  },
}))

vi.mock('../../src/player/controller', () => ({
  resumePlayback: mock.play,
  seekPlayback: mock.seekTo,
  pausePlayback: (stop = false) => stop ? mock.stop() : mock.pause(),
  skipToNextSafe: mock.next,
  skipToPreviousSmart: mock.previous,
}))

async function loadService() {
  vi.resetModules()
  return import('../../src/player/service')
}

beforeEach(() => {
  mock.listeners.clear()
  for (const fn of [mock.addEventListener, mock.play, mock.pause, mock.stop, mock.seekTo, mock.seekBy, mock.next, mock.previous]) {
    fn.mockReset()
  }
  mock.addEventListener.mockImplementation((event, listener) => {
    mock.listeners.set(event, listener)
  })
  for (const fn of [mock.play, mock.pause, mock.stop, mock.seekTo, mock.seekBy, mock.next, mock.previous]) {
    fn.mockResolvedValue(undefined)
  }
})

describe('playback service remote events', () => {
  it('registers remote controls without a JS RemoteDuck resume handler', async () => {
    const { playbackService } = await loadService()
    await playbackService()

    expect([...mock.listeners.keys()]).toEqual([
      'remote-play', 'remote-pause', 'remote-stop', 'remote-next', 'remote-previous',
      'remote-seek', 'remote-jump-forward', 'remote-jump-backward',
    ])
    expect(mock.listeners.has('remote-duck')).toBe(false)
  })

  it('catches rejected remote command promises instead of leaving unhandled rejections', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { playbackService } = await loadService()
    await playbackService()
    for (const fn of [mock.play, mock.pause, mock.stop, mock.seekTo, mock.seekBy, mock.next, mock.previous]) {
      fn.mockRejectedValue(new Error('native command failed'))
    }

    mock.listeners.get('remote-play')?.()
    mock.listeners.get('remote-pause')?.()
    mock.listeners.get('remote-stop')?.()
    mock.listeners.get('remote-next')?.()
    mock.listeners.get('remote-previous')?.()
    mock.listeners.get('remote-seek')?.({ position: 12 })
    mock.listeners.get('remote-jump-forward')?.({ interval: 15 })
    mock.listeners.get('remote-jump-backward')?.({ interval: 15 })

    await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(8))
    expect(mock.seekTo).toHaveBeenCalledWith(12)
    expect(mock.seekTo).toHaveBeenCalledWith(45)
    expect(mock.seekTo).toHaveBeenCalledWith(15)
    warning.mockRestore()
  })
})
