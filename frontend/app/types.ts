export interface KeyComponent {
  name: string;
  purpose: string;
}

export interface LanguageBreakdown {
  name: string;
  percent: number;
}

export interface RepoAnalysis {
  summary: string;
  tech_stack: string[];
  architecture_style: string;
  key_components: KeyComponent[];
  entry_points: string[];
  architecture_explanation: string;
  mermaid_diagram: string;
}

export interface AnalyzeResponse {
  owner: string;
  repo: string;
  stars: number;
  language: string | null;
  description: string | null;
  file_count: number;
  file_paths: string[];
  default_branch: string;
  language_breakdown: LanguageBreakdown[];
  analysis: RepoAnalysis;
}

export interface ApiError {
  detail: string;
}

export interface FileContentResponse {
  path: string;
  content: string;
  sha: string | null;
  size: number;
}

// ---------- Issue Solver types ----------

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
}

export interface FileChange {
  path: string;
  action: "create" | "modify";
  content: string;
}

export interface IssueSolveResult {
  summary: string;
  plan: string[];
  file_changes: FileChange[];
  pr_title: string;
  pr_body: string;
}

export interface AnalyzeIssueResponse {
  owner: string;
  repo: string;
  issue: IssueInfo;
  default_branch: string;
  result: IssueSolveResult;
}

export interface CreatePrResponse {
  pr_url: string;
  branch_name: string;
}