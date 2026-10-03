const network = vi.hoisted(() => ({ require: vi.fn(async () => undefined) }))
vi.mock('@/player/network-access', () => ({ requirePlaybackNetwork: network.require, canUsePlaybackNetwork: () => true }))
import { beforeEach, expect, it, vi } from 'vitest'

/** Regression tests for stale playback intents and offline activation. */
type AddedTrack = { id: string; url?: string }

// 参数签名显式写出来：部分用例要读 `mock.calls` 里的实参（如 move 的 from/to），
// 无参的 `vi.fn(async () => ...)` 会把 calls 推成空元组，读出来是 never。
const rntp = vi.hoisted(() => ({
 getQueue:vi.fn(async()=>[] as AddedTrack[]),
 getPlaybackState:vi.fn(async()=>({state:'paused'})),
 stop:vi.fn(async()=>{}),
 pause:vi.fn(async()=>{}), load:vi.fn(async(_track:any)=>{}), getProgress:vi.fn(async()=>({position:0})),
  move: vi.fn<(from: number, to: number) => Promise<void>>(async () => undefined),
  remove: vi.fn<(indexes: number[]) => Promise<void>>(async () => undefined),
  reset: vi.fn<() => Promise<void>>(async () => undefined),
  setRepeatMode: vi.fn<(mode: number) => Promise<void>>(async () => undefined),
  // 实参有**两种形状**：批量入队传数组（playTrackList / appendTracks / playNext），
  // 单曲入队传对象（skipToPreviousSmart、cycleCurrentToQueueEnd）。
  // 签名要如实写出来，否则读 mock.calls 拿到的是 never。
  add: vi.fn<(tracks: AddedTrack | AddedTrack[], position?: number) => Promise<void>>(
    async () => undefined,
  ),
  skip: vi.fn<(index: number) => Promise<void>>(async () => undefined),
  skipToNext: vi.fn<() => Promise<void>>(async () => undefined),
  play: vi.fn<() => Promise<void>>(async () => undefined),
  seekTo: vi.fn<(seconds: number) => Promise<void>>(async () => undefined),
  getActiveTrackIndex: vi.fn<() => Promise<number>>(async () => 0),
  getActiveTrack: vi.fn(async () => ({ id: 'remote', url: 'https://example.invalid/active' })),
}))

const setup = vi.hoisted(() => ({ ensurePlayer: vi.fn(async () => undefined) }))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('react-native-track-player', () => ({
  default: rntp,
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  TrackType: { Default: 'default', HLS: 'hls' },
}))
vi.mock('expo-file-system', () => ({}))
vi.mock('expo-secure-store', () => ({}))
vi.mock('expo-network', () => ({}))

// ensurePlayer 会真的去 setupPlayer；单测里它只需要是个成功的空操作
vi.mock('../../src/player/setup', () => setup)

// 下面几个只为了「模块能加载」+ 不在单测里碰真实 I/O
vi.mock('../../src/player/persist', () => ({
  clearPlaybackSnapshot: vi.fn(async () => undefined),
  readPlaybackSnapshot: vi.fn(async () => null),
}))
vi.mock('../../src/player/transcode-cache', () => ({
  abortTranscodeCaching: vi.fn(),
  cachedTranscodeUri: vi.fn(() => undefined),
  startTranscodeCaching: vi.fn(),
}))
vi.mock('../../src/player/transcode-prewarm', () => ({
  clearWarmTranscode: vi.fn(async () => undefined),
  setWarmTranscode: vi.fn(),
  takeWarmTranscode: vi.fn(() => undefined),
}))
vi.mock('../../src/player/transcode-session', () => ({
  hasTranscodeSession: vi.fn(() => false),
  replaceTranscodeSession: vi.fn(),
  startTranscodeSession: vi.fn(),
  stopTranscodeSession: vi.fn(async () => undefined),
}))


vi.mock('@/player/audio-cache',()=>({cacheAudio:vi.fn(),cachedAudioUri:()=>undefined,protectTracks:vi.fn(),captureAudioCacheGeneration:()=>0,isAudioCacheGenerationCurrent:()=>true}))
vi.mock('@/player/artwork',()=>({cacheArtwork:vi.fn()}))
vi.mock('@/lib/cache-preferences',()=>({isAutoCacheEnabled:()=>false}))
const offline=vi.hoisted(()=>({downloaded:undefined as string|undefined}))
vi.mock('@/player/downloads',()=>({downloadedUri:()=>offline.downloaded,downloadedContentType:()=> 'audio/mp4'}))
const ctrl=await import('@/player/controller')
const {selectCurrent,usePlayerStore}=await import('@/player/store')
const {cachedTranscodeUri}=await import('@/player/transcode-cache')
const track:any={id:'old',title:'Old',artists:[],durationMs:180000,audio:{format:'flac'}}
const item:any={qid:'srv:old:1',serverId:'srv',trackId:'old',title:'Old',artistText:'A',durationMs:180000}
const snapshot:any={serverId:'srv',queue:[item],baseQueue:[item],history:[],index:0,position:0,playMode:{repeat:'off',shuffle:false},autoplay:false,lyricOffsetMs:0}
const provider:any={capabilities:{qualityTiers:false},stream:vi.fn(async()=>({url:'https://example.invalid/a'}))}
function deferred<T>() {
 let resolve!: (value: T) => void
 const promise = new Promise<T>((done) => { resolve = done })
 return { promise, resolve }
}
async function settlesWithin(promise: Promise<unknown>, milliseconds = 100): Promise<boolean> {
 return Promise.race([
  promise.then(() => true),
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), milliseconds)),
 ])
}
beforeEach(async()=>{await ctrl.clearQueue();vi.clearAllMocks();network.require.mockReset().mockResolvedValue(undefined);rntp.getActiveTrack.mockReset().mockResolvedValue({id:'remote',url:'https://example.invalid/active'});offline.downloaded=undefined;vi.mocked(cachedTranscodeUri).mockReturnValue(undefined);provider.stream.mockReset().mockResolvedValue({url:'https://example.invalid/a'});ctrl.rememberProvider(provider)})
it('restore cannot commit after logout-style clear',async()=>{
 let resolve!:any;let entered!:any
 const called=new Promise(r=>{entered=r})
 provider.stream.mockImplementationOnce(()=>{entered();return new Promise(r=>{resolve=r})})
 const restoring=ctrl.restoreQueuedPlayback(provider,snapshot)
 await called
 await ctrl.clearQueue();ctrl.rememberProvider(null)
 expect(usePlayerStore.getState().queue).toEqual([])
 resolve({url:'https://example.invalid/old'})
 expect(await restoring).toBe(false)
 expect(usePlayerStore.getState().queue).toEqual([])
})
it('play-next cannot commit after invalidation',async()=>{
 let resolve!:any;let entered!:any;const called=new Promise(r=>{entered=r})
 provider.stream.mockImplementationOnce(()=>{entered();return new Promise(r=>{resolve=r})})
 const adding=ctrl.playNext({provider,serverId:'srv',tracks:[track]})
 await called;ctrl.invalidatePlaybackIntents()
 resolve({url:'https://example.invalid/old'});await adding
 expect(rntp.add).not.toHaveBeenCalled()
 expect(usePlayerStore.getState().queue).toEqual([])
})
it('initial playback uses existing transcode cache offline',async()=>{
 vi.mocked(cachedTranscodeUri).mockReturnValue('file://cached.m4a' as any)
 provider.stream.mockRejectedValueOnce(new Error('offline'))
 await expect(ctrl.playSingleTrack({provider,serverId:'srv',track:{...track,audio:{format:'wma'}},source:{kind:'tracks',label:'test'}})).resolves.toBeUndefined()
 expect(provider.stream).not.toHaveBeenCalled()
})
it('activation preserves downloaded WMA offline',async()=>{
 offline.downloaded='file://downloaded.m4a'
 usePlayerStore.getState().setQueue([{...item,format:'wma'}],0,{kind:'tracks',label:'test'})
 await ctrl.ensureTranscodeForIndex(0)
 expect(provider.stream).not.toHaveBeenCalled()
 expect(rntp.load).toHaveBeenCalledWith(expect.objectContaining({url:'file://downloaded.m4a'}))
})

it('next can load a new target while previous native play waits',async()=>{
 let resolve!:any;let entered!:any;const called=new Promise(r=>{entered=r})
 rntp.play.mockImplementationOnce(()=>{entered();return new Promise<void>(r=>{resolve=r})})
 const playing=ctrl.playTrackList({provider,serverId:'srv',tracks:[track,{...track,id:'next'}],startIndex:0,source:{kind:'tracks',label:'test'}})
 await called
 rntp.getQueue.mockResolvedValue(usePlayerStore.getState().queue.map((entry)=>({id:entry.qid})))
 let nativeIndex=0
 rntp.skip.mockImplementation(async(index)=>{nativeIndex=index})
 rntp.getActiveTrackIndex.mockImplementation(async()=>nativeIndex)
 await ctrl.skipToNextSafe()
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('next')
 resolve();await playing
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('next')
})

it('previous supersedes a stalled initial native play when history exists',async()=>{
 const previous={...item,trackId:'history-track',title:'History'}
 usePlayerStore.getState().setQueue([item],0,{kind:'tracks',label:'history'})
 const firstPlay=deferred<void>()
 let firstPlayEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{firstPlayEntered=resolve})
 rntp.play.mockImplementationOnce(()=>{firstPlayEntered();return firstPlay.promise})
 const starting=ctrl.playTrackList({provider,serverId:'srv',tracks:[track,{...track,id:'following'}],startIndex:0,source:{kind:'tracks',label:'new list'}})
 await entered
 usePlayerStore.getState().appendHistoryItem(previous)
 rntp.getQueue.mockImplementation(async()=>{
  const added=rntp.add.mock.calls.at(-1)?.[0]
  return (Array.isArray(added)?added:[added]).filter(Boolean) as AddedTrack[]
 })

 let previousSettled=false
 const goingBack=ctrl.skipToPreviousSmart().then(()=>{previousSettled=true})
 const completedWithoutRelease=await settlesWithin(goingBack)
 firstPlay.resolve()
 await Promise.all([starting,goingBack])

 expect(completedWithoutRelease).toBe(true)
 expect(previousSettled).toBe(true)
 expect(rntp.add).toHaveBeenCalledWith(expect.objectContaining({id:expect.stringContaining('history-track')}),0)
})

it('a second next advances while the first next native play is stalled',async()=>{
 const queue=['one','two','three'].map((trackId)=>({...item,trackId,qid:`srv:${trackId}:1`}))
 usePlayerStore.getState().setQueue(queue,0,{kind:'tracks',label:'three items'})
 rntp.getQueue.mockResolvedValue(queue.map((entry)=>({id:entry.qid})))
 let nativeIndex=0
 rntp.skip.mockImplementation(async(index)=>{nativeIndex=index})
 rntp.getActiveTrackIndex.mockImplementation(async()=>nativeIndex)
 const firstPlay=deferred<void>()
 let firstPlayEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{firstPlayEntered=resolve})
 rntp.play.mockImplementationOnce(()=>{firstPlayEntered();return firstPlay.promise})

 const firstNext=ctrl.skipToNextSafe()
 await entered
 const secondNext=ctrl.skipToNextSafe()
 const completedWithoutRelease=await settlesWithin(secondNext)
 const indexBeforeRelease=usePlayerStore.getState().index
 const currentBeforeRelease=selectCurrent(usePlayerStore.getState())?.trackId
 firstPlay.resolve()
 await Promise.all([firstNext,secondNext])

 expect(completedWithoutRelease).toBe(true)
 expect(nativeIndex).toBe(2)
 expect(currentBeforeRelease).toBe('three')
 expect(indexBeforeRelease).toBe(0)
 expect(rntp.skip.mock.calls).toEqual([[1],[2]])
})

it('selectCurrent follows the requested target while initial and next streams are pending',async()=>{
 usePlayerStore.getState().setQueue([item],0,{kind:'tracks',label:'old current'})
 const firstStream=deferred<{url:string}>()
 const nextStream=deferred<{url:string}>()
 let firstStreamEntered!:()=>void
 let nextStreamEntered!:()=>void
 const firstEntered=new Promise<void>((resolve)=>{firstStreamEntered=resolve})
 const nextEntered=new Promise<void>((resolve)=>{nextStreamEntered=resolve})
 provider.stream.mockImplementation((trackId:string)=>{
  if(trackId==='requested') { firstStreamEntered(); return firstStream.promise }
  if(trackId==='following') { nextStreamEntered(); return nextStream.promise }
  return Promise.resolve({url:'https://example.invalid/a'})
 })

 const starting=ctrl.playTrackList({provider,serverId:'srv',tracks:[{...track,id:'requested'},{...track,id:'following'}],startIndex:0,source:{kind:'tracks',label:'new list'}})
 let skipping:Promise<void>|undefined
 let initialCurrent:string|undefined
 let nextCurrent:string|undefined
 try {
  await firstEntered
  initialCurrent=selectCurrent(usePlayerStore.getState())?.trackId

  skipping=ctrl.skipToNextSafe()
  const requestedNext=await settlesWithin(nextEntered)
  if(requestedNext) await nextEntered
  nextCurrent=selectCurrent(usePlayerStore.getState())?.trackId
 } finally {
  nextStream.resolve({url:'https://example.invalid/next'})
  firstStream.resolve({url:'https://example.invalid/first'})
  await starting
  if(skipping) await skipping
 }
 expect(initialCurrent).toBe('requested')
 expect(nextCurrent).toBe('following')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('following')
})

it('previous at the first requested list item does not cancel its pending request',async()=>{
 usePlayerStore.getState().setQueue([item],0,{kind:'tracks',label:'old current'})
 const firstStream=deferred<{url:string}>()
 let streamEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{streamEntered=resolve})
 provider.stream.mockImplementationOnce(()=>{streamEntered();return firstStream.promise})
 const starting=ctrl.playTrackList({provider,serverId:'srv',tracks:[{...track,id:'requested'}],startIndex:0,source:{kind:'tracks',label:'new list'}})
 let currentAfterPrevious:string|undefined
 try {
  await entered
  await ctrl.skipToPreviousSmart()
  currentAfterPrevious=selectCurrent(usePlayerStore.getState())?.trackId
 } finally {
  firstStream.resolve({url:'https://example.invalid/first'})
  await starting
 }
 expect(currentAfterPrevious).toBe('requested')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('requested')
})

it('two synchronous next taps select the third item before native work starts',async()=>{
 const queue=['one','two','three'].map((trackId)=>({...item,trackId,qid:`srv:${trackId}:1`}))
 usePlayerStore.getState().setQueue(queue,0,{kind:'tracks',label:'three items'})
 rntp.getQueue.mockResolvedValue(queue.map((entry)=>({id:entry.qid})))
 let nativeIndex=0
 rntp.skip.mockImplementation(async(index)=>{nativeIndex=index})
 rntp.getActiveTrackIndex.mockImplementation(async()=>nativeIndex)

 const firstNext=ctrl.skipToNextSafe()
 const secondNext=ctrl.skipToNextSafe()
 await Promise.all([firstNext,secondNext])

 expect(rntp.skip.mock.calls).toEqual([[2]])
 expect(nativeIndex).toBe(2)
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('three')
})

it('previous can undo a pending next when history is empty',async()=>{
 const queue=['one','two'].map((trackId)=>({...item,trackId,qid:`srv:${trackId}:1`}))
 usePlayerStore.getState().setQueue(queue,0,{kind:'tracks',label:'two items'})
 rntp.getQueue.mockResolvedValue(queue.map((entry)=>({id:entry.qid})))
 let nativeIndex=0
 rntp.skip.mockImplementation(async(index)=>{nativeIndex=index})
 rntp.getActiveTrackIndex.mockImplementation(async()=>nativeIndex)

 const next=ctrl.skipToNextSafe()
 const previous=ctrl.skipToPreviousSmart()
 const selectedBeforeNativeWork=selectCurrent(usePlayerStore.getState())?.trackId
 await Promise.all([next,previous])

 expect(selectedBeforeNativeWork).toBe('one')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('one')
})

it('next after a pending historical previous returns to the current queue item',async()=>{
 const queue=['current','upcoming'].map((trackId)=>({...item,trackId,qid:`srv:${trackId}:1`}))
 const previousItem={...item,trackId:'history-newer',qid:'srv:history-newer:1'}
 usePlayerStore.getState().setQueue(queue,0,{kind:'tracks',label:'current queue'})
 usePlayerStore.getState().appendHistoryItem(previousItem)
 const previousStream=deferred<{url:string}>()
 let streamEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{streamEntered=resolve})
 provider.stream.mockImplementation((trackId:string)=>{
  if(trackId==='history-newer') { streamEntered(); return previousStream.promise }
  return Promise.resolve({url:'https://example.invalid/a'})
 })
 rntp.getQueue.mockResolvedValue(queue.map((entry)=>({id:entry.qid})))
 let nativeIndex=0
 rntp.skip.mockImplementation(async(index)=>{nativeIndex=index})
 rntp.getActiveTrackIndex.mockImplementation(async()=>nativeIndex)
 const goingPrevious=ctrl.skipToPreviousSmart()
 let goingNext:Promise<void>|undefined
 let selectedAfterNext:string|undefined
 try {
  await entered
  goingNext=ctrl.skipToNextSafe()
  selectedAfterNext=selectCurrent(usePlayerStore.getState())?.trackId
 } finally {
  previousStream.resolve({url:'https://example.invalid/history'})
  await goingPrevious
  if(goingNext) await goingNext
 }

 expect(selectedAfterNext).toBe('current')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('current')
 expect(usePlayerStore.getState().queue.map((entry)=>entry.trackId)).toEqual(['current','upcoming'])
 expect(usePlayerStore.getState().history.map((entry)=>entry.trackId)).toEqual(['history-newer'])
})

it('repeated previous taps step through history while the first stream is pending',async()=>{
 usePlayerStore.getState().setQueue([{...item,trackId:'current',qid:'srv:current:1'}],0,{kind:'tracks',label:'current'})
 const older={...item,trackId:'history-older',qid:'srv:history-older:1'}
 const newer={...item,trackId:'history-newer',qid:'srv:history-newer:1'}
 usePlayerStore.getState().appendHistoryItem(older)
 usePlayerStore.getState().appendHistoryItem(newer)
 const olderStream=deferred<{url:string}>()
 const newerStream=deferred<{url:string}>()
 let newerEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{newerEntered=resolve})
 provider.stream.mockImplementation((trackId:string)=>{
  if(trackId==='history-older') return olderStream.promise
  if(trackId==='history-newer') { newerEntered(); return newerStream.promise }
  return Promise.resolve({url:'https://example.invalid/a'})
 })
 rntp.getQueue.mockImplementation(async()=>{
  const added=rntp.add.mock.calls.at(-1)?.[0]
  return (Array.isArray(added)?added:[added]).filter(Boolean) as AddedTrack[]
 })
 let firstPrevious:Promise<void>|undefined
 let secondPrevious:Promise<void>|undefined
 let selectedAfterSecond:string|undefined
 try {
  firstPrevious=ctrl.skipToPreviousSmart()
  await entered
  secondPrevious=ctrl.skipToPreviousSmart()
  selectedAfterSecond=selectCurrent(usePlayerStore.getState())?.trackId
 } finally {
  olderStream.resolve({url:'https://example.invalid/older'})
  newerStream.resolve({url:'https://example.invalid/newer'})
  if(firstPrevious) await firstPrevious
  if(secondPrevious) await secondPrevious
 }

 expect(selectedAfterSecond).toBe('history-older')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('history-older')
 expect(usePlayerStore.getState().queue.map((entry)=>entry.trackId)).toEqual(['history-older','history-newer','current'])
 expect(usePlayerStore.getState().history.map((entry)=>entry.trackId)).toEqual([])
})

it('next during a pending single-track request does not revive the replaced queue',async()=>{
 const oldQueue=['old-current','old-upcoming'].map((trackId)=>({...item,trackId,qid:`srv:${trackId}:1`}))
 usePlayerStore.getState().setQueue(oldQueue,0,{kind:'tracks',label:'old queue'})
 const requestedStream=deferred<{url:string}>()
 let streamEntered!:()=>void
 const entered=new Promise<void>((resolve)=>{streamEntered=resolve})
 provider.stream.mockImplementation((trackId:string)=>{
  if(trackId==='requested-single') { streamEntered(); return requestedStream.promise }
  return Promise.resolve({url:'https://example.invalid/a'})
 })
 const starting=ctrl.playSingleTrack({provider,serverId:'srv',track:{...track,id:'requested-single'},source:{kind:'tracks',label:'search result'}})
 let skipping:Promise<void>|undefined
 let selectedAfterNext:string|undefined
 try {
  await entered
  skipping=ctrl.skipToNextSafe()
  selectedAfterNext=selectCurrent(usePlayerStore.getState())?.trackId
 } finally {
  requestedStream.resolve({url:'https://example.invalid/single'})
  await starting
  if(skipping) await skipping
 }

 expect(selectedAfterNext).toBe('requested-single')
 expect(selectCurrent(usePlayerStore.getState())?.trackId).toBe('requested-single')
})

it('restores paused without starting playback',async()=>{
 expect(await ctrl.restoreQueuedPlayback(provider,snapshot)).toBe(true)
 expect(rntp.pause).toHaveBeenCalled()
 expect(rntp.play).not.toHaveBeenCalled()
})
it('local transcode activation respects resumePlayback false',async()=>{
 offline.downloaded='file://downloaded.m4a'
 usePlayerStore.getState().setQueue([{...item,format:'wma'}],0,{kind:'tracks',label:'test'})
 await ctrl.ensureTranscodeForIndex(0,{resumePlayback:false})
 expect(rntp.load).toHaveBeenCalled()
 expect(rntp.play).not.toHaveBeenCalled()
})
it('removes consumed native occurrence by identity after queue reordering',async()=>{
 rntp.getQueue.mockResolvedValueOnce([{id:'new'},{id:'another'},{id:item.qid}])
 await ctrl.removeConsumedNativeTrack(item.qid)
 expect(rntp.remove).toHaveBeenCalledWith([2])
 rntp.remove.mockClear()
 rntp.getQueue.mockResolvedValueOnce([{id:'new'}])
 await ctrl.removeConsumedNativeTrack(item.qid)
 expect(rntp.remove).not.toHaveBeenCalled()
})
it('empty list request does not leave loading enabled',async()=>{
 await ctrl.playTrackList({provider,serverId:'srv',tracks:[],startIndex:0,source:{kind:'tracks',label:'test'}})
 expect(usePlayerStore.getState().isLoadingAudio).toBe(false)
})

it('retries the same radio cursor after a native append failure', async () => {
  usePlayerStore.getState().setQueue([item], 0, { kind: 'tracks', label: 'test' })
  const radio = {
    ...provider,
    radioStart: vi.fn(async () => ({ current: { ...track, id: 'radio-first' }, cursor: 'cursor-1' })),
    radioNext: vi.fn(async () => ({ current: { ...track, id: 'radio-next' }, cursor: 'cursor-2' })),
  }
  rntp.add.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('native append failed'))
  await ctrl.extendWithRadio(radio, 'srv')
  expect(radio.radioNext).toHaveBeenCalledWith('cursor-1')
  expect(usePlayerStore.getState().queue.map((entry) => entry.trackId)).toEqual(['old', 'radio-first'])
  await ctrl.fillRadio(radio, 'srv', 2)
  expect(radio.radioNext.mock.calls).toEqual([['cursor-1'], ['cursor-1']])
  expect(usePlayerStore.getState().queue.at(-1)?.trackId).toBe('radio-next')
})


it('reconnect refreshes the URL and restores the same occurrence/position without rebuilding history', async () => {
  const { setPlaybackIntent } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setPlaybackIntent(true)
  await ctrl.recoverPlaybackAfterNetwork(item.qid, 73.5, () => true)
  expect(rntp.load).toHaveBeenCalledWith(expect.objectContaining({ id: item.qid, url: 'https://example.invalid/a' }))
  expect(rntp.seekTo).toHaveBeenCalledWith(73.5)
  expect(rntp.play).toHaveBeenCalledOnce()
  expect(usePlayerStore.getState().history).toEqual([])
  expect(usePlayerStore.getState().queue[0]?.qid).toBe(item.qid)
})
it('pause during reconnect URL resolution prevents a delayed reload/play', async () => {
  const { getPlaybackIntent, setPlaybackIntent } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setPlaybackIntent(true)
  const stream = deferred<any>()
  const entered = deferred<void>()
  provider.stream.mockImplementationOnce(() => { entered.resolve(); return stream.promise })
  const recovery = ctrl.recoverPlaybackAfterNetwork(item.qid, 73, () => getPlaybackIntent().wantsPlay)
  const observed = recovery.catch(() => undefined)
  await entered.promise
  await ctrl.pausePlayback()
  stream.resolve({url: 'https://example.invalid/stale'})
  await observed
  expect(rntp.load).not.toHaveBeenCalled()
  expect(rntp.play).not.toHaveBeenCalled()
  expect(getPlaybackIntent().wantsPlay).toBe(false)
})
it('a timed-out recovery cannot install a late URL even when the user intent is unchanged', async () => {
  const { setPlaybackIntent } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setPlaybackIntent(true)
  let valid = true
  const stream = deferred<any>()
  const entered = deferred<void>()
  provider.stream.mockImplementationOnce(() => { entered.resolve(); return stream.promise })
  const result = ctrl.recoverPlaybackAfterNetwork(item.qid, 12, () => valid).catch(() => undefined)
  await entered.promise
  valid = false
  stream.resolve({url:'https://example.invalid/expired-attempt'})
  await result
  expect(rntp.load).not.toHaveBeenCalled()
  expect(rntp.play).not.toHaveBeenCalled()
})
it('cellular restrictions gate manual resume and lyric seek-and-play', async () => {
  usePlayerStore.getState().setQueue([item], 0)
  network.require.mockRejectedValue(new Error('蜂窝网络播放已关闭'))
  await expect(ctrl.resumePlayback()).rejects.toThrow('蜂窝网络播放已关闭')
  await expect(ctrl.seekAndPlay(25)).rejects.toThrow('蜂窝网络播放已关闭')
  expect(rntp.play).not.toHaveBeenCalled()
})
it('a cached registration cannot bypass policy while RNTP still has a remote URL', async () => {
  offline.downloaded = 'file:///downloaded.mp4'
  usePlayerStore.getState().setQueue([item], 0)
  rntp.getActiveTrack.mockResolvedValueOnce({ id: item.qid, url: 'https://example.invalid/still-remote' })
  network.require.mockRejectedValue(new Error('蜂窝网络播放已关闭'))
  await expect(ctrl.resumePlayback()).rejects.toThrow('蜂窝网络播放已关闭')
  expect(rntp.play).not.toHaveBeenCalled()
})
it('a native local URL can start without network permission', async () => {
  rntp.getActiveTrack.mockResolvedValueOnce({ id: item.qid, url: 'file:///downloaded.mp4' })
  network.require.mockRejectedValue(new Error('蜂窝网络播放已关闭'))
  usePlayerStore.getState().setQueue([item], 0)
  await ctrl.resumePlayback()
  expect(network.require).not.toHaveBeenCalled()
  expect(rntp.play).toHaveBeenCalledOnce()
})
it('manual skip checks the native target URL before allowing RNTP to switch tracks', async () => {
  const next = { ...item, qid: 'srv:next:1', trackId: 'next' }
  usePlayerStore.getState().setQueue([item, next], 0)
  rntp.getQueue.mockResolvedValue([
    { id: item.qid, url: 'file:///current.m4a' },
    { id: next.qid, url: 'https://example.invalid/next' },
  ])
  network.require.mockRejectedValue(new Error('蜂窝网络播放已关闭'))
  await ctrl.skipToIndex(1)
  expect(rntp.skip).not.toHaveBeenCalled()
})
it('network recovery does not play after policy waiting makes its target stale', async () => {
  const { setPlaybackIntent } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setPlaybackIntent(true)
  let current = true
  const waiting = deferred<undefined>()
  const entered = deferred<void>()
  rntp.getActiveTrack.mockResolvedValueOnce({ id: item.qid, url: 'https://example.invalid/recover' })
  network.require.mockImplementationOnce(() => { entered.resolve(); return waiting.promise })
  const recovery = ctrl.recoverPlaybackAfterNetwork(item.qid, 15, () => current).catch(() => undefined)
  await entered.promise
  current = false
  waiting.resolve(undefined)
  await recovery
  expect(rntp.play).not.toHaveBeenCalled()
})
it('resume reloads a policy-stopped remote checkpoint at its saved position', async () => {
  const { getPlaybackIntent, setNetworkPlaybackCheckpoint } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setNetworkPlaybackCheckpoint({ qid: item.qid, position: 64.5 })
  rntp.getActiveTrack.mockResolvedValueOnce({ id: item.qid, url: 'https://example.invalid/recover' })
  await ctrl.resumePlayback()
  expect(rntp.load).toHaveBeenCalledWith(expect.objectContaining({ id: item.qid, url: 'https://example.invalid/a' }))
  expect(rntp.seekTo).toHaveBeenCalledWith(64.5)
  expect(rntp.play).toHaveBeenCalledOnce()
  expect(getPlaybackIntent().networkCheckpoint).toBeUndefined()
})
it('manual seek preserves paused intent and does not autoplay', async () => {
  const { getPlaybackIntent, setPlaybackIntent } = await import('@/player/playback-intent')
  setPlaybackIntent(false)
  await ctrl.seekPlayback(42)
  expect(rntp.seekTo).toHaveBeenCalledWith(42)
  expect(rntp.play).not.toHaveBeenCalled()
  expect(getPlaybackIntent().wantsPlay).toBe(false)
})
it('the pause control cancels waiting-for-network intent even when native playback is stopped', async () => {
  const { setPlaybackIntent, setWaitingForNetwork, getPlaybackIntent } = await import('@/player/playback-intent')
  usePlayerStore.getState().setQueue([item], 0)
  setPlaybackIntent(true)
  setWaitingForNetwork(true)
  rntp.getPlaybackState.mockResolvedValueOnce({state:'stopped'})
  await ctrl.togglePlay()
  expect(getPlaybackIntent()).toMatchObject({wantsPlay:false,waitingForNetwork:false})
  expect(rntp.pause).toHaveBeenCalledOnce()
  expect(rntp.play).not.toHaveBeenCalled()
})

it('native media recovery switches route before resolving URL and preserves position', async () => {
  const { setPlaybackIntent } = await import('@/player/playback-intent')
  setPlaybackIntent(true)
  usePlayerStore.getState().setQueue([item], 0)
  const routing = { recover: vi.fn(async () => true) }
  ctrl.rememberProvider({ ...provider, routing })
  rntp.getActiveTrack.mockResolvedValue({ id: item.qid, url: 'https://failed.test/api/audio?token=opaque' })
  await ctrl.recoverPlaybackAfterNetwork(item.qid, 37, () => true, true)
  expect(routing.recover).toHaveBeenCalledWith('https://failed.test/api/audio?token=opaque')
  expect(routing.recover.mock.invocationCallOrder[0]).toBeLessThan(provider.stream.mock.invocationCallOrder[0]!)
  expect(rntp.seekTo).toHaveBeenCalledWith(37)
  expect(rntp.play).toHaveBeenCalledOnce()
})
it('policy resume and downloaded playback do not probe alternate routes', async () => {
  usePlayerStore.getState().setQueue([item], 0)
  const routing = { recover: vi.fn(async () => true) }
  ctrl.rememberProvider({ ...provider, routing })
  await ctrl.recoverPlaybackAfterNetwork(item.qid, 0, () => true)
  offline.downloaded = 'file:///downloaded.mp4'
  rntp.getActiveTrack.mockResolvedValue({ id: item.qid, url: 'file:///downloaded.mp4' })
  await ctrl.recoverPlaybackAfterNetwork(item.qid, 0, () => true, true)
  expect(routing.recover).not.toHaveBeenCalled()
})
it('route probing cannot bypass cellular restrictions', async () => {
  usePlayerStore.getState().setQueue([item], 0)
  const routing = { recover: vi.fn(async () => true) }
  ctrl.rememberProvider({ ...provider, routing })
  network.require.mockRejectedValue(new Error('蜂窝网络播放已关闭'))
  await expect(ctrl.recoverPlaybackAfterNetwork(item.qid, 0, () => true, true)).rejects.toThrow('蜂窝网络播放已关闭')
  expect(routing.recover).not.toHaveBeenCalled()
  expect(rntp.load).not.toHaveBeenCalled()
})
it('a delayed route probe cannot reload or play after cancellation', async () => {
  usePlayerStore.getState().setQueue([item], 0)
  const pending = deferred<boolean>()
  const entered = deferred<void>()
  const routing = { recover: vi.fn(() => { entered.resolve(); return pending.promise }) }
  ctrl.rememberProvider({ ...provider, routing })
  rntp.getActiveTrack.mockResolvedValue({ id: item.qid, url: 'https://failed.test/audio' })
  let current = true
  const result = ctrl.recoverPlaybackAfterNetwork(item.qid, 0, () => current, true).catch(() => undefined)
  await entered.promise
  current = false
  pending.resolve(true)
  await result
  expect(provider.stream).not.toHaveBeenCalled()
  expect(rntp.load).not.toHaveBeenCalled()
  expect(rntp.play).not.toHaveBeenCalled()
})


it('queue teardown detaches transcode heartbeats before a failing native setup', async () => {
  const { stopTranscodeSession } = await import('@/player/transcode-session')
  setup.ensurePlayer.mockRejectedValueOnce(new Error('native setup failed'))
  await expect(ctrl.clearQueue()).rejects.toThrow('native setup failed')
  expect(stopTranscodeSession).toHaveBeenCalled()
  expect(vi.mocked(stopTranscodeSession).mock.invocationCallOrder[0]).toBeLessThan(setup.ensurePlayer.mock.invocationCallOrder[0]!)
})
