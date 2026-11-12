import {build} from 'esbuild'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
await mkdir('.test-output',{recursive:true})
const folder=await mkdtemp(resolve('.test-output/image-decode-'))
const entry=join(folder,'test.mjs')
await build({entryPoints:['tests/export-image.electron.ts'],outfile:entry,bundle:true,platform:'node',format:'esm',packages:'external'})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(require('electron'),[entry,'--user-data-dir='+join(folder,'profile')],{env,stdio:'inherit',windowsHide:true})
const timer=setTimeout(()=>child.kill(),60000)
child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1})
