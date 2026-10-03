import {beforeEach, expect, it, vi} from 'vitest'
const io=vi.hoisted(()=>({data:new Map<string,string>(),failKey:'',setWait:undefined as undefined|Promise<void>}))
vi.mock('expo-secure-store',()=>({getItemAsync:async(k:string)=>io.data.get(k)??null,setItemAsync:async(k:string,v:string)=>{await io.setWait;io.data.set(k,v)},deleteItemAsync:async(k:string)=>{if(k===io.failKey)throw new Error('Keychain failed');io.data.delete(k)}}))
vi.mock('expo-crypto',()=>({randomUUID:()=> 'uuid'}))
import {purgeIfFreshInstall,saveSession,clearSession} from '../../src/lib/storage'
beforeEach(()=>{io.data.clear();io.failKey='';io.setWait=undefined})
it('keeps server inventory and does not mark first-install cleanup done after credential failure',async()=>{
 io.data.set('qj.servers',JSON.stringify([{id:'s',baseUrl:'https://invalid',username:'u'}]));io.data.set('qj.password.s','password');io.failKey='qj.password.s'
 const marked=vi.fn(async()=>{})
 await expect(purgeIfFreshInstall(async()=>false,marked)).rejects.toThrow('Keychain failed')
 expect(marked).not.toHaveBeenCalled();expect(io.data.has('qj.servers')).toBe(true)
 io.failKey='';await purgeIfFreshInstall(async()=>false,marked)
 expect(marked).toHaveBeenCalledOnce();expect(io.data.has('qj.password.s')).toBe(false)
})
it('credential clear runs after an already-started refresh write',async()=>{
 let resolve!:()=>void;io.setWait=new Promise<void>(r=>{resolve=r})
 const saving=saveSession('s',{token:'fresh'} as any)
 const clearing=clearSession('s')
 resolve();await Promise.all([saving,clearing]);expect(io.data.has('qj.session.s')).toBe(false)
})
