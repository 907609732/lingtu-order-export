import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { verifyUpdateAssets } from '../scripts/verify-update-assets.mjs'

async function fixture(run) {
  const folder = await mkdtemp(join(tmpdir(), 'lingtu-update-assets-'))
  const name = 'LingtuOrderExport-0.1.22-Setup.exe'
  const bytes = Buffer.from('isolated installer fixture')
  const hash = createHash('sha512').update(bytes).digest('base64')
  const manifest = `version: 0.1.22\nfiles:\n  - url: ${name}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${hash}\n`
  await writeFile(join(folder, name), bytes)
  await writeFile(join(folder, 'latest.yml'), manifest)
  try { await run({folder, name, bytes, hash, manifest}) }
  finally { await rm(folder, { recursive: true, force: true }) }
}

test('accepts a complete release with matching version, path, bytes and SHA-512', () => fixture(async ({folder, name}) => {
  const result = await verifyUpdateAssets(folder, '0.1.22')
  assert.equal(result.version, '0.1.22')
  assert.deepEqual(result.assets.sort(), [name, 'latest.yml'].sort())
}))
test('rejects a tampered installer before release', () => fixture(async ({folder, name}) => {
  await writeFile(join(folder, name), 'tampered')
  await assert.rejects(verifyUpdateAssets(folder, '0.1.22'), /size|SHA-512/)
}))
test('rejects a release version mismatch', () => fixture(async ({folder}) => {
  await assert.rejects(verifyUpdateAssets(folder, '0.1.23'), /version/)
}))
test('accepts full-installer updates without any differential blockmap', () => fixture(async ({folder}) => {
  await assert.doesNotReject(verifyUpdateAssets(folder, '0.1.22'))
}))
test('accepts standard non-differential builder manifests where size is optional', () => fixture(async ({folder, manifest}) => {
  await writeFile(join(folder, 'latest.yml'), manifest.replace(/^    size:.*\n/m, ''))
  const result = await verifyUpdateAssets(folder, '0.1.22')
  assert.ok(result.size > 0)
}))
test('rejects invalid declared installer size', () => fixture(async ({folder, manifest}) => {
  await writeFile(join(folder, 'latest.yml'), manifest.replace(/^    size:.*$/m, '    size: -1'))
  await assert.rejects(verifyUpdateAssets(folder, '0.1.22'), /size/)
}))
test('rejects manifest paths outside the fixed installer name', () => fixture(async ({folder, name, manifest}) => {
  await writeFile(join(folder, 'latest.yml'), manifest.replaceAll(name, '../' + name))
  await assert.rejects(verifyUpdateAssets(folder, '0.1.22'), /filename|path/)
}))
test('rejects conflicting top-level and files SHA-512', () => fixture(async ({folder, hash, manifest}) => {
  await writeFile(join(folder, 'latest.yml'), manifest.replace(`sha512: ${hash}\n`, 'sha512: other\n'))
  await assert.rejects(verifyUpdateAssets(folder, '0.1.22'), /SHA-512/)
}))
