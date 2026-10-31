export type ForgeKind = 'github' | 'bitbucket';

/** A repository hosted on GitHub or Bitbucket Cloud, as found in a git remote URL. */
export type RepoRef = { forge: ForgeKind; owner: string; name: string };

export type PrState = 'open' | 'merged' | 'closed';

export type Pr = {
  id: number;
  title: string;
  state: PrState;
  draft: boolean;
  author: string;
  source: string;
  target: string;
  updatedAt: number;
  url: string;
  /** Not every list endpoint returns these. */
  approvals?: number;
  comments?: number;
};

export type ReviewState = 'approved' | 'changes' | 'commented' | 'pending';
export type Reviewer = { name: string; state: ReviewState; me: boolean };

export type PrDetail = Pr & {
  body: string;
  headSha: string;
  reviewers: Reviewer[];
  myReview: ReviewState | null;
  /** null = unknown (the forge has not computed it yet, or does not say). */
  mergeable: boolean | null;
  mergeHint?: string;
  /** Source branch lives in the same repository, so it can be deleted after merge. */
  sameRepo: boolean;
  strategies: MergeStrategy[];
  defaultStrategy: string;
  /** The forge deletes the source branch on its own after merge. */
  autoDeleteSource?: boolean;
};

export type MergeStrategy = { value: string; label: string; hint: string };

export type PrComment = {
  id: number;
  author: string;
  body: string;
  createdAt: number;
  parentId?: number;
  /** Inline comment on a file. */
  path?: string;
  line?: number;
  /** GitHub review summary (approve / request changes with a message). */
  review?: ReviewState;
  /** GitHub: inline review comments thread with `replies`; issue comments do not thread. */
  kind: 'issue' | 'inline' | 'review';
  deleted?: boolean;
};

export type CheckState = 'success' | 'failure' | 'pending' | 'neutral';
export type Check = { name: string; state: CheckState; url?: string };

export type PrCommit = { sha: string; msg: string; author: string; time: number };

export type PrFile = {
  path: string;
  oldPath?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  add: number;
  del: number;
  /** Unified diff hunks for this file (may be missing for binary or huge files). */
  patch?: string;
};

export type MergeOptions = { strategy: string; message?: string; deleteSource: boolean };

export interface Provider {
  list(state: PrState): Promise<Pr[]>;
  get(id: number): Promise<PrDetail>;
  comments(id: number): Promise<PrComment[]>;
  checks(pr: PrDetail): Promise<Check[]>;
  commits(id: number): Promise<PrCommit[]>;
  files(id: number): Promise<PrFile[]>;
  /** New comment, or reply when `parent` is given. */
  comment(id: number, body: string, parent?: PrComment): Promise<void>;
  approve(id: number): Promise<void>;
  unapprove(pr: PrDetail): Promise<void>;
  requestChanges(id: number, body: string): Promise<void>;
  merge(pr: PrDetail, opts: MergeOptions): Promise<void>;
  close(id: number): Promise<void>;
}
