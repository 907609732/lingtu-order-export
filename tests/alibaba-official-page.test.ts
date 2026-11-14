import {it,expect} from 'vitest'
import {createAlibabaOfficialDriver} from '../src/main/alibaba-official-page'
it('unknown live DOM stops before clicking or evaluating mutation scripts',async()=>{let calls=0;const driver=createAlibabaOfficialDriver({executeJavaScript:async()=>{calls++;return {dateControls:false,currentConditionExport:false}}});await expect(driver.search({from:'2026-10-01',to:'2026-10-31'})).rejects.toThrow(/尚未验证/);expect(calls).toBe(1);await expect(driver.submit()).rejects.toThrow(/未开放/);expect(calls).toBe(1)})
