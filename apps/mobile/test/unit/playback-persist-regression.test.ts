import {beforeEach,it,expect,vi} from 'vitest'
const io=vi.hoisted(()=>({files:new Map<string,string>(),moveFails:false,getProgress:vi.fn()}))
vi.mock('react-native',()=>({AppState:{addEventListener:()=>({remove(){}})}}))
vi.mock('react-native-track-player',()=>({default:{getProgress:io.getProgress}}))
vi.mock('expo-file-system',()=>{
 const uri=(xs:any[])=>xs.map(x=>typeof x==='string'?x:x.uri).join('/')
 class Directory{uri:string;constructor(...xs:any[]){this.uri=uri(xs)}}
 class File{uri:string;constructor(...xs:any[]){this.uri=uri(xs)}get exists(){return io.files.has(this.uri)}create(){io.files.set(this.uri,'')}write(s:string){io.files.set(this.uri,s)}textSync(){return io.files.get(this.uri)}delete(){io.files.delete(this.uri)}move(f:any){if(io.moveFails)throw new Error('disk failure');io.files.set(f.uri,io.files.get(this.uri)!);io.files.delete(this.uri)}}
 return {Directory,File,Paths:{document:'docs'}}
})
import {writePlaybackSnapshot,clearPlaybackSnapshot,readPlaybackSnapshot} from '../../src/player/persist'
import {usePlayerStore} from '../../src/player/store'
beforeEach(()=>{io.files.clear();io.moveFails=false;io.getProgress.mockResolvedValue({position:1});usePlayerStore.getState().setQueue([{qid:'s:t:1',serverId:'s',trackId:'t',title:'T',artistText:'A',durationMs:1000}],0,{kind:'tracks',label:'test'})})
it('late progress cannot recreate cleared snapshot',async()=>{
 let resolve!:any;io.getProgress.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 const pending=writePlaybackSnapshot()
 usePlayerStore.getState().clear()
 await clearPlaybackSnapshot()
 expect(readPlaybackSnapshot()).toBeNull()
 resolve({position:1});await pending
 expect(readPlaybackSnapshot()).toBeNull()
})
it('complete temp remains recoverable after failed move',async()=>{
 await writePlaybackSnapshot();expect(readPlaybackSnapshot()).not.toBeNull()
 io.moveFails=true;await writePlaybackSnapshot()
 expect(readPlaybackSnapshot()?.queue[0]?.trackId).toBe('t')
 expect(io.files.has('docs/player-session.json.tmp')).toBe(true)
})
it('does not persist the previous song lyric offset after switching tracks',async()=>{
 const first={qid:'s:a:1',serverId:'s',trackId:'a',title:'A',artistText:'A',durationMs:1000}
 const second={qid:'s:b:2',serverId:'s',trackId:'b',title:'B',artistText:'B',durationMs:1000}
 usePlayerStore.getState().setQueue([first,second],0)
 usePlayerStore.getState().setLyricOffsetMs(1500,'a')
 usePlayerStore.getState().setIndex(1)
 await writePlaybackSnapshot()
 expect(readPlaybackSnapshot()?.lyricOffsetMs).toBe(0)
})
