import { defineMethod, type RpcMethod } from '../core'
import { normalizeGitLabIssueListArgs } from '../../../gitlab/gitlab-preload-args'
import {
  AddDiscussionNote,
  AddIssueComment,
  AddMRComment,
  AddMRInlineComment,
  CreateIssue,
  CreateProjectSnippet,
  EmptyParams,
  GitLabRateLimit,
  IssuesList,
  JobTrace,
  MergeMr,
  ProjectSnippetId,
  ProjectSnippetsList,
  RepoSelector,
  ResolveMRDiscussion,
  RetryJob,
  UpdateIssue,
  UpdateMr,
  UpdateMrReviewers,
  UpdateMrState,
  UpdateProjectSnippet,
  WorkItemByPath,
  WorkItemDetails,
  WorkItemsList
} from './gitlab-schemas'

export const GITLAB_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'gitlab.listMRs',
    params: WorkItemsList,
    handler: async (params, { runtime }) =>
      runtime.listGitLabRepoMRs(
        params.repo,
        params.state,
        params.page,
        params.perPage,
        params.query
      )
  }),
  defineMethod({
    name: 'gitlab.listWorkItems',
    params: WorkItemsList,
    handler: async (params, { runtime }) =>
      runtime.listGitLabRepoWorkItems(
        params.repo,
        params.state,
        params.page,
        params.perPage,
        params.query
      )
  }),
  defineMethod({
    name: 'gitlab.listIssues',
    params: IssuesList,
    handler: async (params, { runtime }) => {
      const normalized = normalizeGitLabIssueListArgs(params)
      return runtime.listGitLabRepoIssues(
        params.repo,
        normalized.state,
        normalized.assignee,
        normalized.limit
      )
    }
  }),
  defineMethod({
    name: 'gitlab.todos',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.listGitLabRepoTodos(params.repo)
  }),
  defineMethod({
    name: 'gitlab.listProjectSnippets',
    params: ProjectSnippetsList,
    handler: async (params, { runtime }) =>
      runtime.listGitLabRepoProjectSnippets(params.repo, params.limit)
  }),
  defineMethod({
    name: 'gitlab.getProjectSnippet',
    params: ProjectSnippetId,
    handler: async (params, { runtime }) =>
      runtime.getGitLabRepoProjectSnippet(params.repo, params.snippetId)
  }),
  defineMethod({
    name: 'gitlab.createProjectSnippet',
    params: CreateProjectSnippet,
    handler: async (params, { runtime }) =>
      runtime.createGitLabRepoProjectSnippet(params.repo, {
        title: params.title,
        fileName: params.fileName,
        content: params.content,
        description: params.description,
        visibility: params.visibility
      })
  }),
  defineMethod({
    name: 'gitlab.updateProjectSnippet',
    params: UpdateProjectSnippet,
    handler: async (params, { runtime }) =>
      runtime.updateGitLabRepoProjectSnippet(params.repo, params.snippetId, params.updates)
  }),
  defineMethod({
    name: 'gitlab.deleteProjectSnippet',
    params: ProjectSnippetId,
    handler: async (params, { runtime }) =>
      runtime.deleteGitLabRepoProjectSnippet(params.repo, params.snippetId)
  }),
  defineMethod({
    name: 'gitlab.diagnoseAuth',
    params: EmptyParams,
    handler: async (_params, { runtime }) => runtime.diagnoseGitLabAuth()
  }),
  defineMethod({
    name: 'gitlab.rateLimit',
    params: GitLabRateLimit,
    handler: async (params, { runtime }) => runtime.getGitLabRateLimit(params)
  }),
  defineMethod({
    name: 'gitlab.listLabels',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.listGitLabRepoLabels(params.repo)
  }),
  defineMethod({
    name: 'gitlab.createIssue',
    params: CreateIssue,
    handler: async (params, { runtime }) =>
      runtime.createGitLabRepoIssue(params.repo, params.title, params.body)
  }),
  defineMethod({
    name: 'gitlab.updateIssue',
    params: UpdateIssue,
    handler: async (params, { runtime }) =>
      runtime.updateGitLabRepoIssue(params.repo, params.number, params.updates, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.addIssueComment',
    params: AddIssueComment,
    handler: async (params, { runtime }) =>
      runtime.addGitLabRepoIssueComment(params.repo, params.number, params.body, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.addMRComment',
    params: AddMRComment,
    handler: async (params, { runtime }) =>
      runtime.addGitLabRepoMRComment(params.repo, params.iid, params.body, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.addDiscussionNote',
    params: AddDiscussionNote,
    handler: async (params, { runtime }) =>
      runtime.addGitLabRepoDiscussionNote(
        params.repo,
        params.type,
        params.iid,
        params.discussionId,
        params.body,
        params.projectRef
      )
  }),
  defineMethod({
    name: 'gitlab.addMRInlineComment',
    params: AddMRInlineComment,
    handler: async (params, { runtime }) =>
      runtime.addGitLabRepoMRInlineComment(params.repo, params.iid, params.input, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.resolveMRDiscussion',
    params: ResolveMRDiscussion,
    handler: async (params, { runtime }) =>
      runtime.resolveGitLabRepoMRDiscussion(
        params.repo,
        params.iid,
        params.discussionId,
        params.resolved,
        params.projectRef
      )
  }),
  defineMethod({
    name: 'gitlab.jobTrace',
    params: JobTrace,
    handler: async (params, { runtime }) =>
      runtime.getGitLabRepoJobTrace(params.repo, params.jobId, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.retryJob',
    params: RetryJob,
    handler: async (params, { runtime }) =>
      runtime.retryGitLabRepoJob(params.repo, params.jobId, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.mergeMR',
    params: MergeMr,
    handler: async (params, { runtime }) =>
      runtime.mergeGitLabRepoMR(params.repo, params.iid, params.method, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.updateMRState',
    params: UpdateMrState,
    handler: async (params, { runtime }) =>
      runtime.updateGitLabRepoMRState(params.repo, params.iid, params.state, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.updateMR',
    params: UpdateMr,
    handler: async (params, { runtime }) =>
      runtime.updateGitLabRepoMR(params.repo, params.iid, params.updates, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.updateMRReviewers',
    params: UpdateMrReviewers,
    handler: async (params, { runtime }) =>
      runtime.updateGitLabRepoMRReviewers(
        params.repo,
        params.iid,
        params.reviewerIds,
        params.projectRef
      )
  }),
  defineMethod({
    name: 'gitlab.workItemDetails',
    params: WorkItemDetails,
    handler: async (params, { runtime }) =>
      runtime.getGitLabRepoWorkItemDetails(params.repo, params.iid, params.type, params.projectRef)
  }),
  defineMethod({
    name: 'gitlab.workItemByPath',
    params: WorkItemByPath,
    handler: async (params, { runtime }) =>
      runtime.getGitLabRepoWorkItemByPath(
        params.repo,
        { host: params.host, path: params.path },
        params.iid,
        params.type
      )
  })
]
