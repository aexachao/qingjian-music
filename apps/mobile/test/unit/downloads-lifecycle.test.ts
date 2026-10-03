import { beforeEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  callbacks: undefined as any,
  failRecordWrites: false,
}))
const expoFetchMock = vi.hoisted(() => vi.fn())
vi.mock('expo/fetch', () => ({ fetch: expoFetchMock }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

vi.mock('expo-file-system', () => {
  const uri = (parts: any[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/')
  class Directory {
    uri: string
    name: string
    constructor(...parts: any[]) { this.uri = uri(parts); this.name = this.uri.split('/').at(-1) ?? '' }
    get exists() { return io.dirs.has(this.uri) }
    create() { io.dirs.add(this.uri) }
    delete() { io.dirs.delete(this.uri) }
    list() {
      const prefix = `${this.uri}/`
      const children = new Set<string>()
      for (const path of [...io.files.keys(), ...io.dirs]) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        if (rest && !rest.includes('/')) children.add(path)
      }
      return [...children].map((path) => io.dirs.has(path) ? new Directory(path) : new File(path))
    }
  }
  class File {
    uri: string
    name: string
    constructor(...parts: any[]) { this.uri = uri(parts); this.name = this.uri.split('/').at(-1) ?? '' }
    get exists() { return io.files.has(this.uri) }
    get size() { return io.files.get(this.uri)?.length ?? 0 }
    create() { io.files.set(this.uri, '') }
    write(value: string | Uint8Array) {
      if (io.failRecordWrites && this.name.startsWith('record-')) throw new Error('disk full')
      io.files.set(this.uri, typeof value === 'string' ? value : new TextDecoder().decode(value))
    }
    textSync() { return io.files.get(this.uri) }
    delete() { io.files.delete(this.uri) }
    async move(destination: File) {
      io.files.set(destination.uri, io.files.get(this.uri) ?? '')
      io.files.delete(this.uri)
      this.uri = destination.uri
    }
  }
  return {
    Directory,
    File: Object.assign(File, {
      downloadFileAsync: vi.fn(async (_url: string, destination: File) => {
        io.files.set(destination.uri, 'audio bytes')
        return destination
      }),
    }),
    Paths: { document: 'file://docs' },
  }
})

vi.mock('../../modules/audio-downloader', () => ({
  hasNativeDownloader: () => true,
  subscribeAudioDownload: (callbacks: any) => { io.callbacks = callbacks; return () => {} },
  startAudioDownloadJob: vi.fn(async () => true),
  cancelAudioDownloadJob: vi.fn(async () => {}),
  pendingAudioDownloadJobs: vi.fn(async () => []),
  assembleAudioDownloadJob: vi.fn(async () => true),
}))

import {
  __resetDownloadMemoryForTests,
  clearDownloads,
  downloadJobStates,
  downloadTrack,
  isDownloaded,
  reconcileDownloads,
  removeDownload,
} from '../../src/player/downloads'

const track: any = { id: 'track-1', title: 'One', artists: [], durationMs: 120_000, audio: { format: 'flac' } }
const makeProvider = (stream: () => Promise<any> = async () => ({ url: 'https://audio.invalid/one' })) => ({ stream })

beforeEach(async () => {
  vi.clearAllMocks()
  io.callbacks = undefined
  io.failRecordWrites = false
  io.files.clear()
  io.dirs.clear()
  __resetDownloadMemoryForTests()
  const native = await import('../../modules/audio-downloader')
  ;(native.startAudioDownloadJob as any).mockResolvedValue(true)
  ;(native.cancelAudioDownloadJob as any).mockResolvedValue(undefined)
  ;(native.pendingAudioDownloadJobs as any).mockResolvedValue([])
  ;(native.assembleAudioDownloadJob as any).mockResolvedValue(true)
})

describe('download lifecycle', () => {
  it('claims the stable key before awaiting the provider and starts only one native attempt', async () => {
    let release!: (value: any) => void
    const provider = makeProvider(() => new Promise((resolve) => { release = resolve }))
    const first = downloadTrack({ provider: provider as any, serverId: 'server', track, requiresTranscode: false })
    const duplicate = downloadTrack({ provider: provider as any, serverId: 'server', track, requiresTranscode: false })
    expect(duplicate).toBe(first)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release({ url: 'https://audio.invalid/one' })
    await first
    const native = await import('../../modules/audio-downloader')
    expect(native.startAudioDownloadJob).toHaveBeenCalledTimes(1)
  })

  it('ignores progress from a deleted attempt and cancels its native job', async () => {
    const pending = downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })
    await pending
    const native = await import('../../modules/audio-downloader')
    const startedId = (native.startAudioDownloadJob as any).mock.calls[0][0].id
    removeDownload('server:track-1')
    expect(downloadJobStates()).toEqual([])
    io.callbacks.onProgress({ id: startedId, completed: 1, total: 2 })
    expect(downloadJobStates()).toEqual([])
    await vi.waitFor(() => expect(native.cancelAudioDownloadJob).toHaveBeenCalledWith(startedId))
  })

  it('allows a retry with the same stable key after native start rejects', async () => {
    const native = await import('../../modules/audio-downloader')
    ;(native.startAudioDownloadJob as any).mockRejectedValueOnce(new Error('native unavailable'))
    await expect(downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })).rejects.toThrow('native unavailable')
    await expect(downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })).resolves.toBeUndefined()
    const ids = (native.startAudioDownloadJob as any).mock.calls.map((call: any[]) => call[0].id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('does not start native work when the durable journal write fails', async () => {
    io.failRecordWrites = true
    await expect(downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })).rejects.toThrow('无法保存下载记录')
    const native = await import('../../modules/audio-downloader')
    expect(native.startAudioDownloadJob).not.toHaveBeenCalled()
  })

  it('retries a transient startup native lookup failure on a fresh request', async () => {
    const native = await import('../../modules/audio-downloader')
    ;(native.pendingAudioDownloadJobs as any).mockRejectedValueOnce(new Error('temporary native lookup failure'))
    const failedProvider = { stream: vi.fn(async () => ({ url: 'https://audio.invalid/one' })) }
    await expect(downloadTrack({ provider: failedProvider as any, serverId: 'server', track, requiresTranscode: false })).rejects.toThrow('无法查询原生下载状态')
    expect(failedProvider.stream).not.toHaveBeenCalled()

    await expect(downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })).resolves.toBeUndefined()
    expect(native.startAudioDownloadJob).toHaveBeenCalledTimes(1)
  })

  it('preserves legacy recovery metadata when native state cannot be queried', async () => {
    io.dirs.add('file://docs/downloads')
    const entry = { key: 'server:track-1', serverId: 'server', trackId: 'track-1', fileName: 'legacy.flac', bytes: 0, title: 'One', artistText: '', downloadedAt: 0 }
    io.files.set('file://docs/downloads/pending-journal.json', JSON.stringify({ version: 1, entries: { [entry.key]: entry } }))
    const native = await import('../../modules/audio-downloader')
    vi.mocked(native.pendingAudioDownloadJobs).mockRejectedValueOnce(new Error('temporarily unavailable'))
    await expect(reconcileDownloads()).rejects.toThrow('无法查询原生下载状态')
    expect(JSON.parse(io.files.get('file://docs/downloads/pending-journal.json')!).entries[entry.key]).toEqual(entry)
    vi.mocked(native.pendingAudioDownloadJobs).mockResolvedValueOnce([{ id: entry.key, destination: 'legacy.flac', completed: 0, total: 1, outstanding: 1, status: 'pending' }])
    await reconcileDownloads()
    const provider = { stream: vi.fn() }
    await downloadTrack({ provider: provider as any, serverId: 'server', track, requiresTranscode: false })
    expect(provider.stream).not.toHaveBeenCalled()
  })

  it('cancels queued and active jobs when downloads are cleared', async () => {
    const resolvers: ((value: any) => void)[] = []
    const provider = makeProvider(() => new Promise((resolve) => resolvers.push(resolve)))
    const calls = [1, 2, 3].map((number) => downloadTrack({
      provider: provider as any,
      serverId: 'server',
      track: { ...track, id: `track-${number}` },
      requiresTranscode: false,
    }))
    const handled = calls.map((call) => call.catch(() => undefined))
    clearDownloads()
    expect(downloadJobStates()).toEqual([])
    for (const resolve of resolvers) resolve({ url: 'https://audio.invalid/one' })
    await Promise.all(handled)
    const native = await import('../../modules/audio-downloader')
    expect(native.startAudioDownloadJob).not.toHaveBeenCalled()
  })

  it('recovers a completed file after process restart from its retained sidecar when the index is corrupt', async () => {
    const pending = downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })
    await pending
    const native = await import('../../modules/audio-downloader')
    const id = (native.startAudioDownloadJob as any).mock.calls[0][0].id
    const destination = (native.startAudioDownloadJob as any).mock.calls[0][0].destination
    const uri = `file://${destination}`
    io.files.set(uri, 'complete audio')
    io.callbacks.onFinished({ id, bytes: 14 })
    expect(isDownloaded('server', track.id)).toBe(true)

    __resetDownloadMemoryForTests()
    io.files.set('file://docs/downloads/index.json', '{broken')
    await reconcileDownloads()
    expect(isDownloaded('server', track.id)).toBe(true)
  })

  it('deduplicates recovered native jobs and counts them against the active limit', async () => {
    await downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })
    const native = await import('../../modules/audio-downloader')
    const recoveredId = (native.startAudioDownloadJob as any).mock.calls[0][0].id

    __resetDownloadMemoryForTests()
    ;(native.pendingAudioDownloadJobs as any).mockResolvedValue([{ id: recoveredId, completed: 0, total: 1, status: 'pending' }])
    await reconcileDownloads()

    const duplicateStream = vi.fn(async () => ({ url: 'https://audio.invalid/duplicate' }))
    await downloadTrack({ provider: { stream: duplicateStream } as any, serverId: 'server', track, requiresTranscode: false })
    expect(duplicateStream).not.toHaveBeenCalled()

    const otherStream = vi.fn(async () => ({ url: 'https://audio.invalid/other' }))
    const firstNew = downloadTrack({ provider: { stream: otherStream } as any, serverId: 'server', track: { ...track, id: 'track-2' }, requiresTranscode: false })
    const secondNew = downloadTrack({ provider: { stream: otherStream } as any, serverId: 'server', track: { ...track, id: 'track-3' }, requiresTranscode: false })
    await vi.waitFor(() => expect(native.startAudioDownloadJob).toHaveBeenCalledTimes(2))
    expect(otherStream).toHaveBeenCalledTimes(1)

    io.callbacks.onFailed({ id: recoveredId, reason: 'recovered task ended' })
    await vi.waitFor(() => expect(native.startAudioDownloadJob).toHaveBeenCalledTimes(3))
    await Promise.all([firstNew, secondNew])
  })

  it('retains a completed sidecar across repeated registration failures and recovers later', async () => {
    await downloadTrack({ provider: makeProvider() as any, serverId: 'server', track, requiresTranscode: false })
    const native = await import('../../modules/audio-downloader')
    const args = (native.startAudioDownloadJob as any).mock.calls[0][0]
    io.files.set(`file://${args.destination}`, 'audio bytes')
    io.failRecordWrites = true
    io.callbacks.onFinished({ id: args.id, bytes: 11 })

    __resetDownloadMemoryForTests()
    ;(native.pendingAudioDownloadJobs as any).mockResolvedValue([{ id: args.id, completed: 1, total: 1, status: 'completed' }])
    await reconcileDownloads()
    const sidecarPath = [...io.files.keys()].find((path) => path.includes(`record-server_track-1-${args.id}.json`))
    expect(sidecarPath).toBeDefined()
    expect(JSON.parse(io.files.get(sidecarPath!)!).state).toBe('pending')

    __resetDownloadMemoryForTests()
    io.failRecordWrites = false
    await reconcileDownloads()
    expect(isDownloaded('server', track.id)).toBe(true)
  })
})
