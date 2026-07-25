/** Hive→GitLab encodes nested paths as a__b for snippet file_path. */

export function demangleSnippetFileName(value: string): string {
  if (!value || value.includes('/')) {
    return value
  }
  return value.includes('__') ? value.replaceAll('__', '/') : value
}

export function pathFromHiveDescription(description: string): string | null {
  // Why: Hive stores original path in description: `path: /app/readyou.md`
  const match = description.match(/(?:^|\n)path:\s*(.+?)\s*(?:\n|$)/i)
  const path = match?.[1]?.trim()
  return path || null
}

export function resolveSnippetDisplayFileName(input: {
  description?: string | null
  fileName?: string | null
  files?: { path?: string }[] | null
}): string {
  const fromDescription = pathFromHiveDescription(input.description?.trim() || '')
  if (fromDescription) {
    return fromDescription.replace(/^\/+/, '')
  }
  const fromFiles = input.files
    ?.find((f) => typeof f.path === 'string' && f.path.trim())
    ?.path?.trim()
  if (fromFiles) {
    return demangleSnippetFileName(fromFiles)
  }
  return demangleSnippetFileName(input.fileName?.trim() || '')
}
