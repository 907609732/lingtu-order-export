import {describe,it,expect} from 'vitest'
import {RunRegistry} from '../src/main/run-registry'
describe('platform run ownership',()=>{
 it('overlaps platforms and retains stopped platform until drain',()=>{const r=new RunRegistry();const a=r.acquire('taobao','a'),b=r.acquire('jd','b');expect(r.valid(a)).toBe(true);expect(r.valid(b)).toBe(true);r.stop('a');expect(r.valid(a)).toBe(false);expect(r.valid(b)).toBe(true);expect(()=>r.acquire('taobao','c')).toThrow();r.release(a);expect(r.acquire('taobao','a')).not.toBe(a)})
 it('rejects old generation even when task id is resumed',()=>{const r=new RunRegistry();const a=r.acquire('jd','same');r.release(a);const b=r.acquire('jd','same');r.release(a);expect(r.valid(a)).toBe(false);expect(r.valid(b)).toBe(true)})
})
