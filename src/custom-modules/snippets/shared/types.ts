export type GitLabSnippetVisibility = 'public' | 'internal' | 'private'

export type GitLabSnippet = {
  id: number
  title: string
  fileName: string
  description?: string
  visibility: GitLabSnippetVisibility
  webUrl: string
  rawUrl?: string
  updatedAt?: string
  authorUsername?: string
}

export type GitLabSnippetDetail = GitLabSnippet & {
  content: string
}

export type GitLabSnippetCreateInput = {
  title: string
  fileName: string
  content: string
  description?: string
  visibility?: GitLabSnippetVisibility
}

export type GitLabSnippetUpdateInput = Partial<GitLabSnippetCreateInput>
