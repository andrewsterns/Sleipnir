// Shared file-type filter for the DSM/Prototype file tree and the import
// graph — broad on purpose (any language should show up and be scaffoldable/
// editable), excluding only clearly-binary asset formats that can't
// meaningfully be edited as text anyway.
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.mov', '.avi', '.webm',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
])

function extOf(fileName) {
  const idx = fileName.lastIndexOf('.')
  return idx === -1 ? '' : fileName.slice(idx).toLowerCase()
}

// Extensionless files (Dockerfile, Makefile, LICENSE, ...) are treated as
// source — they're text and worth showing/editing.
export function isSourceFile(fileName) {
  return !BINARY_EXT.has(extOf(fileName))
}
