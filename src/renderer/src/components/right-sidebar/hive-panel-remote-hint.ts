export function remoteHintFromRepo(repo: {
  gitRemoteIdentity?: { remoteUrl?: string; canonicalKey?: string } | null
}): string | undefined {
  const identity = repo.gitRemoteIdentity
  const key = identity?.canonicalKey?.trim()
  if (key && key.includes('/')) {
    // canonicalKey often looks like host/owner/repo
    const parts = key.split('/').filter(Boolean)
    if (parts.length >= 2) {
      return parts.slice(-2).join('/')
    }
  }
  const url = identity?.remoteUrl?.trim()
  if (!url) {
    return undefined
  }
  const cleaned = url.replace(/\.git$/i, '')
  const scpOrPath = /[:/]([^/]+\/[^/]+)$/.exec(cleaned)
  if (scpOrPath?.[1]) {
    return scpOrPath[1]
  }
  const github = /github\.com\/([^/]+\/[^/]+)/i.exec(cleaned)
  return github?.[1]
}
