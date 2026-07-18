#!/usr/bin/env node
/**
 * sync-ecosystem.mjs — pull the ecosystem map into Mission Control.
 *
 * The map is generated at the HperCore workspace root by
 * `scripts/gen_repo_map.py`, which also writes AGENT-START.md §2. Copying it
 * into `public/` means the boot file and this dashboard read the exact same
 * bytes — they cannot disagree.
 *
 *   npm run sync:ecosystem          # regenerate at root, then copy
 *   npm run sync:ecosystem -- --copy-only
 *
 * Root is resolved from HYPERCORE_ROOT, falling back to the standard path.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MC_ROOT = resolve(HERE, '..')
const PUBLIC_DIR = join(MC_ROOT, 'public')

const ROOT = process.env.HYPERCORE_ROOT || 'H:\\HYPERFOCUSZONE\\HperCore'
const SRC = join(ROOT, 'ecosystem-map.json')
const DEST = join(PUBLIC_DIR, 'ecosystem-map.json')

const copyOnly = process.argv.includes('--copy-only')

console.log('🌐 Mission Control — ecosystem sync')
console.log(`   root: ${ROOT}`)

if (!existsSync(ROOT)) {
  console.error(`\n❌ HperCore root not found: ${ROOT}`)
  console.error('   Set HYPERCORE_ROOT if your workspace lives elsewhere.')
  process.exit(1)
}

// 1. Regenerate at the root so we're never copying a stale file.
if (!copyOnly) {
  console.log('\n🔄 Regenerating the map...')
  const py = process.platform === 'win32' ? 'python' : 'python3'
  const res = spawnSync(py, ['scripts/gen_repo_map.py', '--write', '--fast'], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf-8',
  })
  if (res.error || res.status !== 0) {
    console.warn('\n⚠️  Generator did not complete — copying the existing map instead.')
  }
}

// 2. Copy into public/ so Vite serves it at /ecosystem-map.json.
if (!existsSync(SRC)) {
  console.error(`\n❌ ${SRC} not found.`)
  console.error('   Run at the HperCore root: python scripts/gen_repo_map.py --write')
  process.exit(1)
}

if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true })
copyFileSync(SRC, DEST)

// 3. Report what the operator just pulled in.
try {
  const map = JSON.parse(readFileSync(DEST, 'utf-8'))
  const tiers = map.repos.reduce((a, r) => ({ ...a, [r.tier]: (a[r.tier] ?? 0) + 1 }), {})
  console.log(`\n✅ Synced ${map.count} repos → public/ecosystem-map.json`)
  console.log(`   🟢 ${tiers.LIVE ?? 0} LIVE · 🔨 ${tiers.BUILDING ?? 0} BUILDING · 🅿️ ${tiers.PARKED ?? 0} PARKED · ❌ ${tiers.RETIRED ?? 0} RETIRED`)
  console.log(`   generated: ${map.generated}`)
} catch {
  console.log('\n✅ Copied (could not parse for a summary — check the file).')
}

console.log('\n🎉 Nice one BROski♾️\n')
