import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/** Reject incomplete or inconsistent update assets before they become public. */
export async function verifyUpdateAssets(directory, expectedVersion) {
  const version = String(expectedVersion).replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid stable release version')
  const info = yaml.load(await readFile(join(directory, 'latest.yml'), 'utf8'))
  if (!info || info.version !== version) throw new Error('Manifest version differs from release version')
  const name = `LingtuOrderExport-${version}-Setup.exe`
  if (info.path !== name || !Array.isArray(info.files) || info.files.length !== 1 || info.files[0].url !== name) {
    throw new Error('Manifest filename/path differs from expected installer')
  }
  const entry = info.files[0]
  if (!Number.isSafeInteger(entry.size) || entry.size <= 0) throw new Error('Invalid installer size')
  const bytes = await readFile(join(directory, name))
  if (bytes.length !== entry.size) throw new Error('Installer size mismatch')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  if (entry.sha512 !== sha512 || info.sha512 !== sha512) throw new Error('Installer SHA-512 mismatch')
  return {
    version, filename: name, size: bytes.length, sha512,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    assets: [name, 'latest.yml']
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyUpdateAssets(resolve(process.argv[2] || 'release'), process.argv[3])
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
