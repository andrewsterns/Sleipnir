// One-off generator: rasterizes build/icon.svg into build/icon.ico (Windows
// app/taskbar icon) and build/icon.png (the macOS/Linux icon — electron-builder
// rejects anything under 512x512 there, so it's rendered at 1024).
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

writeFileSync(path.join(buildDir, 'icon.png'), await sharp(svg, { density: 1536 }).resize(1024, 1024).png().toBuffer())

const ico = await toIco(pngBuffers)
writeFileSync(path.join(buildDir, 'icon.ico'), ico)

console.log('Wrote build/icon.ico and build/icon.png')
