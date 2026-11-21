export type TursoSnippet = {
  id: string
  repoId: string
  branch: string
  title: string
  fileName: string
  content: string
  createdAt: string
}

export type TursoSnippetCreateInput = {
  url: string
  authToken: string
  repoId: string
  branch: string
  title: string
  fileName: string
  content: string
}

export type TursoSnippetListArgs = {
  url: string
  authToken: string
  repoId: string
}

export type TursoSnippetIdArgs = {
  url: string
  authToken: string
  snippetId: string
}

export type TursoSnippetResult = { ok: true; snippet: TursoSnippet } | { ok: false; error: string }

export type TursoSnippetListResult =
  | { ok: true; items: TursoSnippet[] }
  | { ok: false; error: string }

export type TursoSnippetDeleteResult = { ok: true } | { ok: false; error: string }
