// Why: keep GitLab RPC param schemas separate from method registration so both
// files stay under the line cap as the GitLab surface grows.
import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from '../schemas'

export const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

export const EmptyParams = z.object({}).optional().default({})
export const GitLabRateLimit = z
  .object({
    force: z.boolean().optional(),
    host: OptionalString
  })
  .optional()
  .default({})

export const GitLabProjectRef = z
  .object({
    host: requiredString('Missing GitLab host'),
    path: requiredString('Missing GitLab project path')
  })
  .optional()

export const WorkItemsList = RepoSelector.extend({
  state: z.enum(['opened', 'merged', 'closed', 'all']).optional(),
  page: OptionalFiniteNumber,
  perPage: OptionalFiniteNumber,
  query: OptionalString
})

export const IssuesList = RepoSelector.extend({
  state: z.unknown().optional(),
  assignee: OptionalString,
  limit: OptionalFiniteNumber
})

export const ProjectSnippetsList = RepoSelector.extend({
  limit: OptionalFiniteNumber
})

export const CreateIssue = RepoSelector.extend({
  title: requiredString('Missing title'),
  body: z.string()
})

export const IssueUpdate = z.object({
  state: z.enum(['opened', 'closed']).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  addLabels: z.array(z.string()).optional(),
  removeLabels: z.array(z.string()).optional(),
  addAssignees: z.array(z.string()).optional(),
  removeAssignees: z.array(z.string()).optional()
})

export const UpdateIssue = RepoSelector.extend({
  number: z.number().int().positive(),
  updates: IssueUpdate,
  projectRef: GitLabProjectRef
})

export const UpdateMrState = RepoSelector.extend({
  iid: z.number().int().positive(),
  state: z.enum(['opened', 'closed']),
  projectRef: GitLabProjectRef
})

export const UpdateMr = RepoSelector.extend({
  iid: z.number().int().positive(),
  updates: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional()
  }),
  projectRef: GitLabProjectRef
})

export const UpdateMrReviewers = RepoSelector.extend({
  iid: z.number().int().positive(),
  reviewerIds: z.array(z.number().int().nonnegative()),
  projectRef: GitLabProjectRef
})

export const MergeMr = RepoSelector.extend({
  iid: z.number().int().positive(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  projectRef: GitLabProjectRef
})

export const AddIssueComment = RepoSelector.extend({
  number: z.number().int().positive(),
  body: requiredString('Comment body is required'),
  projectRef: GitLabProjectRef
})

export const AddMRComment = RepoSelector.extend({
  iid: z.number().int().positive(),
  body: requiredString('Comment body is required'),
  projectRef: GitLabProjectRef
})

export const AddDiscussionNote = RepoSelector.extend({
  type: z.enum(['issue', 'mr']),
  iid: z.number().int().positive(),
  discussionId: requiredString('Discussion id is required'),
  body: requiredString('Comment body is required'),
  projectRef: GitLabProjectRef
}) // Why: reply-in-thread notes (issue/MR discussions), not top-level /notes.

export const AddMRInlineComment = RepoSelector.extend({
  iid: z.number().int().positive(),
  input: z.object({
    body: requiredString('Comment body is required'),
    path: requiredString('File path is required'),
    oldPath: z.string().optional(),
    line: z.number().int().positive(),
    baseSha: requiredString('Base SHA is required'),
    startSha: requiredString('Start SHA is required'),
    headSha: requiredString('Head SHA is required')
  }),
  projectRef: GitLabProjectRef
})

export const ResolveMRDiscussion = RepoSelector.extend({
  iid: z.number().int().positive(),
  discussionId: requiredString('Discussion id is required'),
  resolved: z.boolean(),
  projectRef: GitLabProjectRef
})

export const JobTrace = RepoSelector.extend({
  jobId: z.number().int().positive(),
  projectRef: GitLabProjectRef
})

export const RetryJob = RepoSelector.extend({
  jobId: z.number().int().positive(),
  projectRef: GitLabProjectRef
})

export const WorkItemDetails = RepoSelector.extend({
  iid: z.number().int().positive(),
  type: z.enum(['issue', 'mr']),
  projectRef: GitLabProjectRef
})

export const WorkItemByPath = RepoSelector.extend({
  host: requiredString('Missing GitLab host'),
  path: requiredString('Missing GitLab project path'),
  iid: z.number().int().positive(),
  type: z.enum(['issue', 'mr'])
})
