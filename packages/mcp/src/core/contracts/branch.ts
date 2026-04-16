export interface Branch {
  name: string
  sha: string
  protected?: boolean
}

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'removed'
  before: string | null
  after: string | null
}

export interface MergeResult {
  merged: boolean
  sha: string | null
  pullRequestUrl: string | null
}
