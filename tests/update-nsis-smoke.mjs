// Explicit integration test: real NSIS, isolated identity/path/data, no real shop accounts.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, cp, access } from 'node:fs/promises'
import { resolve, join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, statSync, appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { build as bundle } from 'esbuild'
import builder from 'electron-builder'

if (process.platform !== 'win32') throw new Error('NSIS integration test requires Windows')
const root = resolve('.')
const folder = await mkdtemp(join(tmpdir(), 'lingtu-update-nsis-'))
const appDir = join(folder, 'app'), installed = join(folder, 'installed')
const feedDir = join(folder, 'new'), report = join(folder, 'report.jsonl')
const identity = randomUUID(), product = `Lingtu Update Test ${identity.slice(0, 8)}`
await mkdir(appDir)
for (const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','npm_config_proxy','npm_config_https_proxy','ELECTRON_RUN_AS_NODE']) delete process.env[name]

function run(exe, args) {
  return new Promise((done, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error(`${basename(exe)} exited ${code}`)))
  })
}
// Copy only the real updater's dependency graph into the isolated tiny test app.
const copied = new Set()
async function dependency(name, resolver) {
  if (copied.has(name)) return
  copied.add(name)
  const pkgFile = resolver.resolve(name + '/package.json')
  const pkg = JSON.parse(await readFile(pkgFile, 'utf8'))
  await cp(dirname(pkgFile), join(appDir, 'node_modules', name), { recursive: true })
  const local = createRequire(pkgFile)
  for (const child of Object.keys(pkg.dependencies || {})) await dependency(child, local)
}
const require = createRequire(import.meta.url)
await dependency('electron-updater', require)
await bundle({entryPoints:[join(root,'src/main/updater.ts')],outfile:join(appDir,'controller.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'})
await bundle({entryPoints:[join(root,'src/core/store.ts')],outfile:join(appDir,'store.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'})

const requests = []
const server = createServer((req, res) => {
  const name = basename(decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
  requests.push({name, range:req.headers.range || null})
  try {
    const file = join(feedDir, name), size = statSync(file).size
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '')
    const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size) {res.writeHead(416);res.end();return}
    res.writeHead(range ? 206 : 200, {'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})})
    createReadStream(file,{start,end}).pipe(res)
  } catch {res.writeHead(404);res.end()}
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const feed = `http://127.0.0.1:${server.address().port}/`
const main = `
const {app}=require('electron');const fs=require('node:fs');const path=require('node:path');
const {NsisUpdater}=require('electron-updater');const {UpdateController}=require('./controller.cjs');const {Store}=require('./store.cjs');
const base=${JSON.stringify(folder)},report=${JSON.stringify(report)};
app.setPath('userData',path.join(base,'data'));app.setName(${JSON.stringify(product)});
const log=value=>fs.appendFileSync(report,JSON.stringify(value)+'\\n');let store;
app.whenReady().then(async()=>{try{
 fs.mkdirSync(app.getPath('userData'),{recursive:true});store=new Store(path.join(app.getPath('userData'),'orders.sqlite'));
 if(app.getVersion()==='0.0.2'){
  if(store.setting('smoke')!=='preserved'||store.tasks().length!==1)throw Error('Persisted data missing');
  log({result:'restarted',version:app.getVersion(),dataPreserved:true});setTimeout(()=>app.quit(),300);return;
 }
 store.setting('smoke','preserved');store.create({platform:'pdd',from:'2026-11-01',to:'2026-11-01'});
 const adapter=new NsisUpdater({provider:'generic',url:${JSON.stringify(feed)}});adapter.disableDifferentialDownload=true;adapter.logger={info:()=>{},warn:()=>{},error:value=>log({libraryError:String(value)})};
 let busy=false;const controller=new UpdateController(adapter,{current:app.getVersion(),supported:true,busy:()=>busy,changed:state=>log({status:state.status,message:state.message})});
 await controller.check();if(controller.state.status!=='available')throw Error('No update available');
 await controller.download();if(controller.state.status!=='downloaded')throw Error('Download failed');
 busy=true;let blocked=false;try{controller.install()}catch{blocked=true}if(!blocked)throw Error('Busy install was allowed');
 busy=false;log({result:'install-request',busyBlocked:blocked});controller.install();
}catch(error){log({result:'error',message:error.stack});app.quit()}});
app.on('before-quit',()=>store?.close());
`
await writeFile(join(appDir, 'main.cjs'), main)
const config = {
  appId:`com.lingtu.update-test.${identity}`, productName:product, executableName:'LingtuUpdateSmoke',
  electronDist:join(root,'node_modules/electron/dist'), electronVersion:'44.7.0', npmRebuild:false,
  compression:'store',
  files:['main.cjs','controller.cjs','store.cjs','package.json'],
  publish:{provider:'generic',url:feed},
  win:{target:'nsis',artifactName:'UpdateSmoke-${version}.exe'},
  nsis:{guid:identity,oneClick:false,perMachine:false,createDesktopShortcut:false,createStartMenuShortcut:false,differentialPackage:false,deleteAppDataOnUninstall:false}
}
try {
  for (const [version, output] of [['0.0.1','old'],['0.0.2','new']]) {
    await writeFile(join(appDir,'package.json'),JSON.stringify({name:'lingtu-update-smoke',version,description:'Isolated NSIS update acceptance',author:'Lingtu',main:'main.cjs',dependencies:{'electron-updater':'6.8.11'}}))
    // Builder normalizes/mutates file rules; each build must receive an independent config.
    await builder.build({projectDir:appDir,targets:builder.Platform.WINDOWS.createTarget('nsis',builder.Arch.x64),publish:'never',config:{...structuredClone(config),directories:{output:join(folder,output)}}})
  }
  await run(join(folder,'old','UpdateSmoke-0.0.1.exe'),['/S',`/D=${installed}`])
  const exe = join(installed,'LingtuUpdateSmoke.exe')
  await access(exe)
  const first = spawn(exe,[],{windowsHide:true,stdio:'ignore',env:process.env});first.on('error',error=>appendFileSync(report,JSON.stringify({result:'error',message:error.message})+'\n'))
  const deadline = Date.now()+180000
  let events = []
  while(Date.now()<deadline) {
    try {events=(await readFile(report,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch{}
    if(events.some(x=>x.result==='error')) throw new Error(JSON.stringify(events.find(x=>x.result==='error')))
    if(events.some(x=>x.result==='restarted')) break
    await new Promise(done=>setTimeout(done,500))
  }
  assert.ok(events.some(x=>x.result==='install-request'&&x.busyBlocked),'busy state must prevent installation')
  assert.ok(events.some(x=>x.result==='restarted'&&x.version==='0.0.2'&&x.dataPreserved),'new version must restart and preserve SQLite data')
  assert.ok(requests.some(x=>x.name==='UpdateSmoke-0.0.2.exe'),'real installer must be downloaded')
  assert.ok(!requests.some(x=>x.name.endsWith('.blockmap')),'differential requests must be disabled')
  await writeFile(join(folder,'acceptance.json'),JSON.stringify({passed:true,events,requests,identity,installed},null,2))
  console.log('PASS real NSIS download -> SHA-512 verification -> busy guard -> silent install -> restart; SQLite task/settings preserved; no differential requests. '+folder)
} finally {
  server.close()
  // Only the unique integration app is uninstalled; retain test evidence and synthetic data.
  try {await run(join(installed,'Uninstall LingtuUpdateSmoke.exe'),['/S'])}catch(error){console.log('Test-only uninstall status: '+error.message)}
}
