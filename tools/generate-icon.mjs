// One-off generator: rasterizes build/icon.svg into build/icon.ico (Windows
// app/taskbar icon) and build/icon.png (used as a fallback / Linux icon).
// Not part of the build pipeline — rerun manually if the source mark changes.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(__dirname, '..', 'build')
const svg = readFileSync(path.join(buildDir, 'icon.svg'))

const sizes = [16, 24, 32, 48, 64, 128, 256]

const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
)

writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1])

const ico = await toIco(pngBuffers)
writeFileSync(path.join(buildDir, 'icon.ico'), ico)

console.log('Wrote build/icon.ico and build/icon.png')
