export type AnalysisStatus = "pending" | "processing" | "success" | "failed";

export interface RepoRef {
  owner: string;
  repo: string;
  canonicalUrl: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
}

export type ReportLanguage = "zh-CN" | "zh-en";

export interface ExtensionSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  reportLanguage: ReportLanguage;
  githubToken: string;
}

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  defaultBranch: string;
  updatedAt: string;
  pushedAt: string;
}

export interface TextFileSnapshot {
  path: string;
  content: string;
  truncated: boolean;
}

export interface DirectoryExplanation {
  path: string;
  purpose: string;
}

export interface KeyFileGuide {
  path: string;
  role: string;
  reason: string;
  readingAdvice: string;
}

export interface AnalysisResult {
  repoInfo: RepoInfo;
  generatedAt: string;
  summary: string;
  targetUsers: string[];
  coreValue: string;
  techStack: string[];
  directoryExplanation: DirectoryExplanation[];
  keyFiles: KeyFileGuide[];
  runGuide: string;
  learningPath: string[];
  developmentAdvice: string;
  risks: string[];
  conclusion: string;
  markdown: string;
}

export interface AnalysisRecord {
  analysisId: string;
  repoUrl: string;
  status: AnalysisStatus;
  result?: AnalysisResult;
  error?: ApiErrorResponse;
  createdAt: string;
  updatedAt: string;
}

export interface RepositorySnapshot {
  repoInfo: RepoInfo;
  readme?: TextFileSnapshot;
  tree: string[];
  configFiles: TextFileSnapshot[];
  sourceFiles: TextFileSnapshot[];
  isLargeRepo: boolean;
}

export type AnalysisDraft = Omit<AnalysisResult, "repoInfo" | "generatedAt" | "markdown">;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  reportLanguage: "zh-CN",
  githubToken: ""
};

export const ANALYSIS_LIMITS = {
  maxTreePaths: 500,
  maxReadmeChars: 12_000,
  maxConfigFileChars: 6_000,
  maxSourceFileChars: 8_000,
  maxSourceFiles: 10
} as const;

export const CONFIG_FILE_CANDIDATES = [
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "webpack.config.js",
  "next.config.js",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "Dockerfile",
  "docker-compose.yml",
  "README.md",
  "CONTRIBUTING.md"
] as const;

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export function parseGitHubRepoUrl(input: string): RepoRef | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !rawRepo) {
    return null;
  }

  const repo = rawRepo.replace(/\.git$/i, "");
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) {
    return null;
  }

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}`
  };
}

export function truncateText(content: string, maxChars: number): TextFileSnapshot {
  if (content.length <= maxChars) {
    return { path: "", content, truncated: false };
  }

  return {
    path: "",
    content: `${content.slice(0, maxChars)}\n\n[Content truncated by RepoLens]`,
    truncated: true
  };
}

export function truncateFile(path: string, content: string, maxChars: number): TextFileSnapshot {
  const snapshot = truncateText(content, maxChars);
  return { ...snapshot, path };
}

export function selectConfigFiles(paths: string[]): string[] {
  const normalized = new Map(paths.map((path) => [path.toLowerCase(), path]));

  return CONFIG_FILE_CANDIDATES.flatMap((candidate) => {
    const exact = normalized.get(candidate.toLowerCase());
    if (exact) {
      return [exact];
    }

    const nested = paths.find((path) => path.toLowerCase().endsWith(`/${candidate.toLowerCase()}`));
    return nested ? [nested] : [];
  });
}

export function selectImportantSourceFiles(paths: string[], maxFiles: number = ANALYSIS_LIMITS.maxSourceFiles): string[] {
  const files = paths.filter((path) => !path.endsWith("/"));

  return files
    .map((path) => ({ path, score: scoreSourcePath(path) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, maxFiles)
    .map((entry) => entry.path);
}

export function createReportFilename(owner: string, repo: string, extension: "md" | "html" | "png"): string {
  return `${sanitizeFilename(owner)}-${sanitizeFilename(repo)}-analysis.${extension}`;
}

export function completeAnalysisResult(
  repoInfo: RepoInfo,
  generatedAt: string,
  draft: AnalysisDraft
): AnalysisResult {
  const resultWithoutMarkdown = {
    repoInfo,
    generatedAt,
    ...draft
  };

  return {
    ...resultWithoutMarkdown,
    markdown: renderMarkdown(resultWithoutMarkdown)
  };
}

export function renderMarkdown(result: Omit<AnalysisResult, "markdown">): string {
  return [
    `# GitHub 项目分析报告：${result.repoInfo.fullName}`,
    "",
    "## 基础信息",
    "",
    `- 项目名称：${result.repoInfo.fullName}`,
    `- 项目地址：${result.repoInfo.htmlUrl}`,
    `- 主要语言：${result.repoInfo.language ?? "无法从当前文件确认"}`,
    `- Star 数：${result.repoInfo.stars}`,
    `- Fork 数：${result.repoInfo.forks}`,
    `- License：${result.repoInfo.license ?? "无法从当前文件确认"}`,
    `- 生成时间：${result.generatedAt}`,
    "",
    "## 项目概览",
    "",
    result.summary,
    "",
    "## 适合人群",
    "",
    ...result.targetUsers.map((item) => `- ${item}`),
    "",
    "## 核心价值",
    "",
    result.coreValue,
    "",
    "## 技术栈分析",
    "",
    ...result.techStack.map((item) => `- ${item}`),
    "",
    "## 目录结构说明",
    "",
    ...result.directoryExplanation.map((item) => `- \`${item.path}\`：${item.purpose}`),
    "",
    "## 关键文件导读",
    "",
    ...result.keyFiles.flatMap((file) => [
      `### ${file.path}`,
      "",
      `- 文件作用：${file.role}`,
      `- 推荐原因：${file.reason}`,
      `- 阅读建议：${file.readingAdvice}`,
      ""
    ]),
    "## 运行方式",
    "",
    result.runGuide,
    "",
    "## 学习路线",
    "",
    ...result.learningPath.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## 二次开发建议",
    "",
    result.developmentAdvice,
    "",
    "## 风险与注意事项",
    "",
    ...result.risks.map((item) => `- ${item}`),
    "",
    "## 总结",
    "",
    result.conclusion,
    ""
  ].join("\n");
}

export function renderHtml(result: AnalysisResult): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(result.repoInfo.fullName)} 分析报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.7; color: #172033; margin: 0; background: #f6f8fb; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; background: #fff; min-height: 100vh; }
    h1, h2, h3 { line-height: 1.25; color: #111827; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 28px; }
    code { background: #eef2f7; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>${markdownToBasicHtml(result.markdown)}</main>
</body>
</html>`;
}

function isValidRepoSegment(segment: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(segment);
}

function scoreSourcePath(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;

  if (/^(src|app|lib|core|packages)\//.test(lower)) {
    score += 30;
  }

  if (/(^|\/)(index|main|app|cli)\.[cm]?[jt]sx?$/.test(lower) || /(^|\/)(main|app|cli)\.(py|go|rs)$/.test(lower)) {
    score += 60;
  }

  if (/^(examples|demo)\//.test(lower)) {
    score += 20;
  }

  if (/^(test|tests|__tests__)\//.test(lower) || /(\.test|\.spec)\.[cm]?[jt]sx?$/.test(lower)) {
    score += 10;
  }

  if (/\.(ts|tsx|js|jsx|py|go|rs|java|kt|cs|rb|php|swift)$/.test(lower)) {
    score += 5;
  }

  return score;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function markdownToBasicHtml(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }
      if (line.startsWith("### ")) {
        return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      }
      if (line.startsWith("- ")) {
        return `<p>• ${escapeHtml(line.slice(2))}</p>`;
      }
      if (/^\d+\. /.test(line)) {
        return `<p>${escapeHtml(line)}</p>`;
      }
      return line.trim().length > 0 ? `<p>${escapeHtml(line)}</p>` : "";
    })
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
