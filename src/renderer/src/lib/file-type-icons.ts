/* eslint-disable max-lines -- Why: this module is intentionally a compact filename/extension icon table. */
import {
  Database,
  File,
  FileArchive,
  FileAxis3D,
  FileBox,
  FileBraces,
  FileChartColumn,
  FileCode,
  FileCog,
  FileDiff,
  FileImage,
  FileJson,
  FileKey,
  FileLock,
  FileMusic,
  FileSliders,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Smartphone,
  type LucideIcon
} from 'lucide-react'

const FILE_ICON_BY_NAME: Record<string, LucideIcon> = {
  '.babelrc': FileSliders,
  '.dockerignore': FileSliders,
  '.editorconfig': FileSliders,
  '.eslintrc': FileSliders,
  '.eslintrc.cjs': FileSliders,
  '.eslintrc.js': FileSliders,
  '.eslintrc.json': FileJson,
  '.eslintrc.yaml': FileSliders,
  '.eslintrc.yml': FileSliders,
  '.gitattributes': FileSliders,
  '.gitignore': FileSliders,
  '.npmrc': FileSliders,
  '.prettierrc': FileSliders,
  '.prettierrc.json': FileJson,
  '.prettierrc.yaml': FileSliders,
  '.prettierrc.yml': FileSliders,
  'agents.md': FileText,
  authors: FileText,
  'bun.lock': FileBox,
  'bun.lockb': FileBox,
  'cargo.lock': FileBox,
  'cargo.toml': FileBox,
  changelog: FileText,
  'changelog.md': FileText,
  'cmakelists.txt': FileCog,
  codeowners: FileKey,
  'components.json': FileSliders,
  'composer.json': FileBox,
  'composer.lock': FileBox,
  contributing: FileText,
  'contributing.md': FileText,
  copying: FileKey,
  dockerfile: FileCog,
  gemfile: FileBox,
  'go.mod': FileBox,
  'go.sum': FileBox,
  license: FileKey,
  makefile: FileTerminal,
  'meson.build': FileCog,
  notice: FileKey,
  'package-lock.json': FileBox,
  'package.json': FileBox,
  pipfile: FileBox,
  'pnpm-lock.yaml': FileBox,
  'pnpm-workspace.yaml': FileBox,
  'poetry.lock': FileBox,
  'pom.xml': FileBox,
  'postcss.config.cjs': FileSliders,
  'postcss.config.js': FileSliders,
  'postcss.config.mjs': FileSliders,
  'postcss.config.ts': FileSliders,
  'pyproject.toml': FileBox,
  readme: FileText,
  'readme.md': FileText,
  'requirements-dev.txt': FileBox,
  'requirements.txt': FileBox,
  security: FileLock,
  'security.md': FileLock,
  'settings.gradle': FileCog,
  'settings.gradle.kts': FileCog,
  'tailwind.config.cjs': FileSliders,
  'tailwind.config.js': FileSliders,
  'tailwind.config.mjs': FileSliders,
  'tailwind.config.ts': FileSliders,
  todo: FileText,
  'tsconfig.json': FileSliders,
  'vite.config.js': FileSliders,
  'vite.config.mjs': FileSliders,
  'vite.config.ts': FileSliders,
  'vitest.config.js': FileSliders,
  'vitest.config.mjs': FileSliders,
  'vitest.config.ts': FileSliders,
  'yarn.lock': FileBox
}

const FILE_ICON_BY_EXTENSION: Record<string, LucideIcon> = {
  '7z': FileArchive,
  aac: FileMusic,
  adoc: FileText,
  ai: FileImage,
  asc: FileKey,
  astro: FileCode,
  avi: FileVideo,
  avif: FileImage,
  bash: FileTerminal,
  bat: FileTerminal,
  blend: FileAxis3D,
  bmp: FileImage,
  br: FileArchive,
  bz2: FileArchive,
  c: FileCode,
  cc: FileCode,
  cer: FileKey,
  cfg: FileSliders,
  cjs: FileCode,
  clj: FileCode,
  cmd: FileTerminal,
  conf: FileSliders,
  cpp: FileCode,
  crt: FileKey,
  cs: FileCode,
  css: FileType,
  csv: FileSpreadsheet,
  cts: FileCode,
  cxx: FileCode,
  dart: FileCode,
  db: Database,
  diff: FileDiff,
  dmg: FileArchive,
  doc: FileText,
  docx: FileText,
  duckdb: Database,
  eot: FileType,
  eps: FileImage,
  erl: FileCode,
  ex: FileCode,
  exs: FileCode,
  fbx: FileAxis3D,
  fish: FileTerminal,
  flac: FileMusic,
  fs: FileCode,
  fsx: FileCode,
  gif: FileImage,
  glb: FileAxis3D,
  gltf: FileAxis3D,
  go: FileCode,
  gpg: FileKey,
  gql: FileBraces,
  gradle: FileCog,
  graphql: FileBraces,
  gz: FileArchive,
  h: FileCode,
  hcl: FileSliders,
  heic: FileImage,
  hpp: FileCode,
  hrl: FileCode,
  hs: FileCode,
  htm: FileCode,
  html: FileCode,
  ico: FileImage,
  ini: FileSliders,
  ipynb: FileChartColumn,
  iso: FileArchive,
  java: FileCode,
  jpeg: FileImage,
  jpg: FileImage,
  js: FileCode,
  json: FileJson,
  json5: FileJson,
  jsonc: FileJson,
  jsx: FileCode,
  key: FileKey,
  kt: FileCode,
  kts: FileCode,
  less: FileType,
  lock: FileLock,
  log: FileText,
  lua: FileCode,
  m4a: FileMusic,
  m4v: FileVideo,
  md: FileText,
  mdx: FileText,
  mjs: FileCode,
  mkv: FileVideo,
  mmd: FileChartColumn,
  mov: FileVideo,
  mp3: FileMusic,
  mp4: FileVideo,
  mpeg: FileVideo,
  mpg: FileVideo,
  mts: FileCode,
  nim: FileCode,
  nu: FileTerminal,
  obj: FileAxis3D,
  ods: FileSpreadsheet,
  ogg: FileMusic,
  opus: FileMusic,
  otf: FileType,
  p12: FileLock,
  patch: FileDiff,
  pdf: FileText,
  pem: FileKey,
  pfx: FileLock,
  php: FileCode,
  pl: FileCode,
  pm: FileCode,
  png: FileImage,
  ppt: FileChartColumn,
  pptx: FileChartColumn,
  prisma: Database,
  properties: FileSliders,
  proto: FileBraces,
  ps1: FileTerminal,
  psd: FileImage,
  pub: FileKey,
  py: FileCode,
  r: FileCode,
  rar: FileArchive,
  rb: FileCode,
  rst: FileText,
  rs: FileCode,
  rtf: FileText,
  sass: FileType,
  scala: FileCode,
  scss: FileType,
  sh: FileTerminal,
  sol: FileCode,
  sqlite: Database,
  sqlite3: Database,
  sql: Database,
  stl: FileAxis3D,
  svelte: FileCode,
  svg: FileImage,
  swift: FileCode,
  tar: FileArchive,
  'tar.bz2': FileArchive,
  'tar.gz': FileArchive,
  'tar.xz': FileArchive,
  tbz2: FileArchive,
  tex: FileText,
  tf: FileSliders,
  tfvars: FileSliders,
  tgz: FileArchive,
  tif: FileImage,
  tiff: FileImage,
  toml: FileSliders,
  ts: FileCode,
  tsx: FileCode,
  tsv: FileSpreadsheet,
  ttf: FileType,
  txt: FileText,
  txz: FileArchive,
  vb: FileCode,
  vue: FileCode,
  wav: FileMusic,
  webm: FileVideo,
  webp: FileImage,
  woff: FileType,
  woff2: FileType,
  xhtml: FileCode,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  xml: FileCode,
  xz: FileArchive,
  yaml: FileSliders,
  yml: FileSliders,
  zig: FileCode,
  zip: FileArchive,
  zsh: FileTerminal
}

const COMPOUND_EXTENSIONS = ['tar.bz2', 'tar.gz', 'tar.xz']

function getFilename(filePath: string | undefined | null): string {
  if (!filePath) {
    return ''
  }
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
}

function getExtension(filename: string): string {
  const lowerName = filename.toLowerCase()
  const compoundExtension = COMPOUND_EXTENSIONS.find((ext) => lowerName.endsWith(`.${ext}`))
  if (compoundExtension) {
    return compoundExtension
  }

  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return ''
  }

  return filename.slice(lastDot + 1).toLowerCase()
}

export function getFileTypeIcon(filePath: string | undefined | null): LucideIcon {
  const filename = getFilename(filePath)
  if (!filename) {
    return File
  }
  const lowerName = filename.toLowerCase()
  const exactMatch = FILE_ICON_BY_NAME[lowerName]
  if (exactMatch) {
    return exactMatch
  }

  // Why: simulator tabs reuse EditorFileTab chrome with a synthetic label path.
  if (lowerName === 'mobile emulator' || lowerName === 'simulator') {
    return Smartphone
  }

  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return FileLock
  }

  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return FileCog
  }

  if (lowerName === 'makefile' || lowerName.startsWith('makefile.')) {
    return FileTerminal
  }

  // Why: filename/extension matching keeps icons deterministic for SSH worktrees
  // where OS-native file associations are not available.
  return FILE_ICON_BY_EXTENSION[getExtension(filename)] ?? File
}

// Why: muted-by-default icons make dense trees hard to scan; light language
// tints (VS Code-style) help without inventing new design-token colors.
const FILE_ICON_COLOR_BY_NAME: Record<string, string> = {
  'package.json': 'text-emerald-500 dark:text-emerald-400',
  'package-lock.json': 'text-emerald-500 dark:text-emerald-400',
  'pnpm-lock.yaml': 'text-amber-600 dark:text-amber-400',
  'yarn.lock': 'text-sky-500 dark:text-sky-400',
  'cargo.toml': 'text-orange-600 dark:text-orange-400',
  'go.mod': 'text-cyan-600 dark:text-cyan-400',
  'pyproject.toml': 'text-yellow-600 dark:text-yellow-400',
  'requirements.txt': 'text-yellow-600 dark:text-yellow-400',
  'tsconfig.json': 'text-sky-600 dark:text-sky-400',
  dockerfile: 'text-blue-600 dark:text-blue-400',
  makefile: 'text-slate-500 dark:text-slate-300',
  'readme.md': 'text-blue-500 dark:text-blue-400',
  readme: 'text-blue-500 dark:text-blue-400'
}

const FILE_ICON_COLOR_BY_EXTENSION: Record<string, string> = {
  // JS / TS family
  js: 'text-amber-500 dark:text-amber-400',
  mjs: 'text-amber-500 dark:text-amber-400',
  cjs: 'text-amber-500 dark:text-amber-400',
  jsx: 'text-cyan-500 dark:text-cyan-400',
  ts: 'text-sky-600 dark:text-sky-400',
  mts: 'text-sky-600 dark:text-sky-400',
  cts: 'text-sky-600 dark:text-sky-400',
  tsx: 'text-sky-500 dark:text-sky-300',
  // Python / data
  py: 'text-yellow-600 dark:text-yellow-400',
  ipynb: 'text-orange-500 dark:text-orange-400',
  r: 'text-sky-600 dark:text-sky-400',
  // Web
  html: 'text-orange-600 dark:text-orange-400',
  htm: 'text-orange-600 dark:text-orange-400',
  css: 'text-pink-500 dark:text-pink-400',
  scss: 'text-pink-500 dark:text-pink-400',
  sass: 'text-pink-500 dark:text-pink-400',
  less: 'text-indigo-500 dark:text-indigo-400',
  vue: 'text-emerald-500 dark:text-emerald-400',
  svelte: 'text-orange-500 dark:text-orange-400',
  astro: 'text-orange-600 dark:text-orange-400',
  // Systems / backend
  go: 'text-cyan-600 dark:text-cyan-400',
  rs: 'text-orange-600 dark:text-orange-400',
  java: 'text-red-500 dark:text-red-400',
  kt: 'text-violet-500 dark:text-violet-400',
  kts: 'text-violet-500 dark:text-violet-400',
  rb: 'text-rose-500 dark:text-rose-400',
  php: 'text-indigo-500 dark:text-indigo-400',
  c: 'text-blue-600 dark:text-blue-400',
  h: 'text-blue-600 dark:text-blue-400',
  cpp: 'text-blue-500 dark:text-blue-300',
  cc: 'text-blue-500 dark:text-blue-300',
  cxx: 'text-blue-500 dark:text-blue-300',
  hpp: 'text-blue-500 dark:text-blue-300',
  cs: 'text-violet-600 dark:text-violet-400',
  swift: 'text-orange-500 dark:text-orange-400',
  dart: 'text-sky-500 dark:text-sky-400',
  // Config / data
  json: 'text-amber-500 dark:text-amber-400',
  jsonc: 'text-amber-500 dark:text-amber-400',
  json5: 'text-amber-500 dark:text-amber-400',
  yaml: 'text-rose-500 dark:text-rose-400',
  yml: 'text-rose-500 dark:text-rose-400',
  toml: 'text-slate-500 dark:text-slate-300',
  xml: 'text-orange-500 dark:text-orange-400',
  sql: 'text-blue-500 dark:text-blue-400',
  prisma: 'text-teal-600 dark:text-teal-400',
  graphql: 'text-pink-500 dark:text-pink-400',
  gql: 'text-pink-500 dark:text-pink-400',
  // Docs / shell / media
  md: 'text-blue-500 dark:text-blue-400',
  mdx: 'text-blue-500 dark:text-blue-400',
  txt: 'text-muted-foreground',
  sh: 'text-emerald-600 dark:text-emerald-400',
  bash: 'text-emerald-600 dark:text-emerald-400',
  zsh: 'text-emerald-600 dark:text-emerald-400',
  fish: 'text-emerald-600 dark:text-emerald-400',
  ps1: 'text-blue-600 dark:text-blue-400',
  png: 'text-fuchsia-500 dark:text-fuchsia-400',
  jpg: 'text-fuchsia-500 dark:text-fuchsia-400',
  jpeg: 'text-fuchsia-500 dark:text-fuchsia-400',
  gif: 'text-fuchsia-500 dark:text-fuchsia-400',
  svg: 'text-amber-500 dark:text-amber-400',
  webp: 'text-fuchsia-500 dark:text-fuchsia-400',
  mp3: 'text-violet-500 dark:text-violet-400',
  mp4: 'text-violet-500 dark:text-violet-400',
  zip: 'text-amber-700 dark:text-amber-500',
  gz: 'text-amber-700 dark:text-amber-500',
  'tar.gz': 'text-amber-700 dark:text-amber-500'
}

/** Tailwind text-* class for the file-type icon (muted when unknown). */
export function getFileTypeIconColorClass(filePath: string | undefined | null): string {
  const filename = getFilename(filePath)
  if (!filename) {
    return 'text-muted-foreground'
  }
  const lowerName = filename.toLowerCase()
  const exact = FILE_ICON_COLOR_BY_NAME[lowerName]
  if (exact) {
    return exact
  }
  if (lowerName === '.env' || lowerName.startsWith('.env.')) {
    return 'text-amber-600 dark:text-amber-400'
  }
  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return 'text-blue-600 dark:text-blue-400'
  }
  if (lowerName === 'makefile' || lowerName.startsWith('makefile.')) {
    return 'text-slate-500 dark:text-slate-300'
  }
  return FILE_ICON_COLOR_BY_EXTENSION[getExtension(filename)] ?? 'text-muted-foreground'
}
