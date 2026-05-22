import {
  ANALYSIS_LIMITS,
  DEFAULT_SETTINGS,
  type AnalysisDraft,
  type AnalysisRecord,
  type ExtensionSettings,
  type ReportLanguage,
  type RepoInfo,
  type RepoRef,
  type RepositorySnapshot,
  type TextFileSnapshot,
  completeAnalysisResult,
  renderHtml,
  selectConfigFiles,
  selectImportantSourceFiles,
  truncateFile
} from "@repolens/shared";

const SETTINGS_KEY = "repolens.settings";
const LATEST_ANALYSIS_KEY = "repolens.latestAnalysisId";
const HISTORY_KEY = "repolens.analysisHistory";

interface GitHubRepoApiResponse {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id?: string; name?: string } | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string;
}

interface GitHubTreeApiResponse {
  tree: Array<{ path: string; type: "blob" | "tree" }>;
  truncated: boolean;
}

interface GitHubContentApiResponse {
  type: string;
  path: string;
  encoding?: string;
  content?: string;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;

  return {
    apiBaseUrl: normalizeApiBaseUrl(settings?.apiBaseUrl ?? DEFAULT_SETTINGS.apiBaseUrl),
    apiKey: settings?.apiKey ?? DEFAULT_SETTINGS.apiKey,
    model: settings?.model ?? DEFAULT_SETTINGS.model,
    reportLanguage: normalizeReportLanguage(settings?.reportLanguage)
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const normalized: ExtensionSettings = {
    apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim() || DEFAULT_SETTINGS.model,
    reportLanguage: normalizeReportLanguage(settings.reportLanguage)
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
}

export async function testConnection(settings: ExtensionSettings): Promise<void> {
  const normalized = {
    ...settings,
    apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
    apiKey: settings.apiKey.trim()
  };

  if (!normalized.apiKey) {
    throw new Error("请先填写 API Key。");
  }

  await ensureHostPermission(normalized.apiBaseUrl);

  const response = await fetch(`${normalized.apiBaseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${normalized.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`连接失败：${response.status} ${response.statusText || "请检查 API Key 或 Base URL"}`);
  }
}

export async function analyzeRepository(repo: RepoRef): Promise<AnalysisRecord> {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("请先在设置页填写 API Key。");
  }

  await ensureHostPermission(settings.apiBaseUrl);

  const analysisId = `analysis_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const processingRecord: AnalysisRecord = {
    analysisId,
    repoUrl: repo.canonicalUrl,
    status: "processing",
    createdAt: now,
    updatedAt: now
  };
  await saveAnalysisRecord(processingRecord);

  try {
    const snapshot = await fetchGitHubRepoSnapshot(repo);
    const draft = await analyzeWithOpenAICompatible(snapshot, settings);
    const result = completeAnalysisResult(snapshot.repoInfo, new Date().toISOString(), draft);
    const successRecord: AnalysisRecord = {
      ...processingRecord,
      status: "success",
      result,
      updatedAt: new Date().toISOString()
    };
    await saveAnalysisRecord(successRecord);
    return successRecord;
  } catch (error) {
    const failedRecord: AnalysisRecord = {
      ...processingRecord,
      status: "failed",
      error: {
        code: "ANALYSIS_FAILED",
        message: error instanceof Error ? error.message : "项目分析失败，请重新发起分析。"
      },
      updatedAt: new Date().toISOString()
    };
    await saveAnalysisRecord(failedRecord);
    throw error;
  }
}

export async function fetchGitHubRepoSnapshot(repo: RepoRef): Promise<RepositorySnapshot> {
  const repoInfo = await getRepoInfo(repo);
  const [readme, treeResponse] = await Promise.all([
    getReadme(repo, repoInfo.defaultBranch),
    getTree(repo, repoInfo.defaultBranch)
  ]);

  const tree = treeResponse.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const limitedTree = tree.slice(0, ANALYSIS_LIMITS.maxTreePaths);
  const configPaths = selectConfigFiles(limitedTree);
  const sourcePaths = selectImportantSourceFiles(limitedTree);
  const [configFiles, sourceFiles] = await Promise.all([
    getFiles(repo, repoInfo.defaultBranch, configPaths, ANALYSIS_LIMITS.maxConfigFileChars),
    getFiles(repo, repoInfo.defaultBranch, sourcePaths, ANALYSIS_LIMITS.maxSourceFileChars)
  ]);

  return {
    repoInfo,
    readme,
    tree: limitedTree,
    configFiles,
    sourceFiles,
    isLargeRepo: treeResponse.truncated || tree.length > ANALYSIS_LIMITS.maxTreePaths
  };
}

export async function analyzeWithOpenAICompatible(
  snapshot: RepositorySnapshot,
  settings: ExtensionSettings
): Promise<AnalysisDraft> {
  const response = await fetch(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(settings.reportLanguage)
        },
        {
          role: "user",
          content: buildAnalysisPrompt(snapshot, settings.reportLanguage)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI 分析失败：${response.status} ${response.statusText || "请检查模型配置"}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 分析失败：模型没有返回内容。");
  }

  return normalizeAnalysisDraft(JSON.parse(stripJsonFence(content)) as Partial<AnalysisDraft>);
}

export async function saveAnalysisRecord(record: AnalysisRecord): Promise<void> {
  const history = await loadHistoryIds();
  const nextHistory = [record.analysisId, ...history.filter((id) => id !== record.analysisId)].slice(0, 100);

  await chrome.storage.local.set({
    [analysisKey(record.analysisId)]: record,
    [LATEST_ANALYSIS_KEY]: record.analysisId,
    [HISTORY_KEY]: nextHistory
  });
}

export async function getAnalysisRecord(analysisId: string): Promise<AnalysisRecord | null> {
  const stored = await chrome.storage.local.get(analysisKey(analysisId));
  return (stored[analysisKey(analysisId)] as AnalysisRecord | undefined) ?? null;
}

export async function listAnalysisRecords(): Promise<AnalysisRecord[]> {
  const history = await loadHistoryIds();
  const [indexedRecords, legacyRecords] = await Promise.all([
    Promise.all(history.map((analysisId) => getAnalysisRecord(analysisId))),
    loadAllStoredAnalysisRecords()
  ]);

  const byId = new Map<string, AnalysisRecord>();
  [...indexedRecords, ...legacyRecords].forEach((record) => {
    if (record) {
      byId.set(record.analysisId, record);
    }
  });

  return [...byId.values()]
    .filter((record): record is AnalysisRecord => Boolean(record))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getMarkdown(analysisId: string): Promise<string> {
  const record = await requireSuccessfulRecord(analysisId);
  return record.result.markdown;
}

export async function getHtml(analysisId: string): Promise<string> {
  const record = await requireSuccessfulRecord(analysisId);
  return renderHtml(record.result);
}

export async function openOptionsPage(): Promise<void> {
  if (chrome.runtime.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  await chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
}

export async function openHistoryPage(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL("history.html") });
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
  return trimmed.replace(/\/+$/, "");
}

async function loadHistoryIds(): Promise<string[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const value = stored[HISTORY_KEY];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

async function loadAllStoredAnalysisRecords(): Promise<AnalysisRecord[]> {
  const stored = await chrome.storage.local.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith("repolens.analysis."))
    .map(([, value]) => value)
    .filter(isAnalysisRecord);
}

function isAnalysisRecord(value: unknown): value is AnalysisRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "analysisId" in value &&
    "repoUrl" in value &&
    "status" in value &&
    "updatedAt" in value
  );
}

async function requireSuccessfulRecord(analysisId: string): Promise<AnalysisRecord & { result: NonNullable<AnalysisRecord["result"]> }> {
  const record = await getAnalysisRecord(analysisId);
  if (!record) {
    throw new Error("未找到该分析报告。");
  }
  if (record.status !== "success" || !record.result) {
    throw new Error("分析尚未完成。");
  }
  return record as AnalysisRecord & { result: NonNullable<AnalysisRecord["result"]> };
}

async function getRepoInfo(repo: RepoRef): Promise<RepoInfo> {
  const data = await githubRequest<GitHubRepoApiResponse>(`/repos/${repo.owner}/${repo.repo}`);
  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    htmlUrl: data.html_url,
    stars: data.stargazers_count,
    forks: data.forks_count,
    language: data.language,
    license: data.license?.spdx_id ?? data.license?.name ?? null,
    defaultBranch: data.default_branch,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at
  };
}

async function getReadme(repo: RepoRef, branch: string): Promise<TextFileSnapshot | undefined> {
  try {
    const data = await githubRequest<GitHubContentApiResponse>(
      `/repos/${repo.owner}/${repo.repo}/readme?ref=${encodeURIComponent(branch)}`
    );
    return truncateFile(data.path, decodeBase64Content(data), ANALYSIS_LIMITS.maxReadmeChars);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return undefined;
    }
    throw error;
  }
}

async function getTree(repo: RepoRef, branch: string): Promise<GitHubTreeApiResponse> {
  return githubRequest<GitHubTreeApiResponse>(
    `/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
}

async function getFiles(repo: RepoRef, branch: string, paths: string[], maxChars: number): Promise<TextFileSnapshot[]> {
  const files = await Promise.all(
    paths.map(async (path) => {
      try {
        const data = await githubRequest<GitHubContentApiResponse>(
          `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
        );
        return truncateFile(data.path, decodeBase64Content(data), maxChars);
      } catch {
        return undefined;
      }
    })
  );

  return files.filter((file): file is TextFileSnapshot => Boolean(file));
}

async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (response.status === 404) {
    throw new Error("无法获取该仓库信息，请检查仓库是否存在或是否为公开仓库。");
  }

  if (response.status === 403) {
    throw new Error("GitHub API 请求受限，请稍后重试。");
  }

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败：${response.status}`);
  }

  return (await response.json()) as T;
}

async function ensureHostPermission(apiBaseUrl: string): Promise<void> {
  const origin = `${new URL(apiBaseUrl).origin}/*`;
  if (origin === "https://api.openai.com/*") {
    return;
  }

  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (hasPermission) {
    return;
  }

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error("未授予该 API Base URL 的访问权限。");
  }
}

function buildAnalysisPrompt(snapshot: RepositorySnapshot, reportLanguage: ReportLanguage): string {
  return JSON.stringify(
    {
      repoInfo: snapshot.repoInfo,
      readme: snapshot.readme?.content ?? "",
      tree: snapshot.tree,
      configFiles: snapshot.configFiles,
      sourceFiles: snapshot.sourceFiles,
      isLargeRepo: snapshot.isLargeRepo,
      languageRequirement: languageInstruction(reportLanguage),
      largeRepoNote: snapshot.isLargeRepo ? "当前仓库较大，请在风险里说明本次是抽样分析。" : "",
      outputShape: {
        summary: "string",
        targetUsers: ["string"],
        coreValue: "string",
        techStack: ["string"],
        directoryExplanation: [{ path: "string", purpose: "string" }],
        keyFiles: [{ path: "string", role: "string", reason: "string", readingAdvice: "string" }],
        runGuide: "string",
        learningPath: ["string"],
        developmentAdvice: "string",
        risks: ["string"],
        conclusion: "string"
      }
    },
    null,
    2
  );
}

function normalizeAnalysisDraft(value: Partial<AnalysisDraft>): AnalysisDraft {
  return {
    summary: stringOrDefault(value.summary, "无法从当前文件确认项目概览。"),
    targetUsers: stringArrayOrDefault(value.targetUsers, ["希望快速理解该仓库的开发者"]),
    coreValue: stringOrDefault(value.coreValue, "帮助用户建立项目阅读地图。"),
    techStack: stringArrayOrDefault(value.techStack, ["无法从当前文件确认完整技术栈"]),
    directoryExplanation: Array.isArray(value.directoryExplanation) ? value.directoryExplanation : [],
    keyFiles: Array.isArray(value.keyFiles) ? value.keyFiles : [],
    runGuide: stringOrDefault(value.runGuide, "请优先查看 README 和配置文件中的运行命令。"),
    learningPath: stringArrayOrDefault(value.learningPath, [
      "先读 README，理解项目目标。",
      "查看配置文件，理解技术栈和运行命令。",
      "查找入口文件，理解启动流程。",
      "阅读核心模块，理解主要逻辑。",
      "查看 examples 或 tests，理解使用方式。"
    ]),
    developmentAdvice: stringOrDefault(value.developmentAdvice, "建议先从文档、配置和入口文件开始。"),
    risks: stringArrayOrDefault(value.risks, ["部分判断来自抽样文件，需要回到源码继续确认。"]),
    conclusion: stringOrDefault(value.conclusion, "该报告适合作为项目初读地图。")
  };
}

function buildSystemPrompt(reportLanguage: ReportLanguage): string {
  return [
    "你是 RepoLens 的 GitHub 项目分析器。",
    "只基于用户提供的真实文件和目录输出 JSON；不确定时明确写“可能”或“无法从当前文件确认”。",
    "不要编造不存在的文件路径。",
    languageInstruction(reportLanguage)
  ].join("\n");
}

function languageInstruction(reportLanguage: ReportLanguage): string {
  if (reportLanguage === "zh-en") {
    return "报告必须使用中英双语：每个字段先写简体中文，再给出英文对应内容；数组项也使用“中文 / English”的形式。";
  }

  return "报告必须使用简体中文输出，除专有名词、库名、命令和文件路径外不要使用英文。";
}

function normalizeReportLanguage(value: unknown): ReportLanguage {
  return value === "zh-en" ? "zh-en" : DEFAULT_SETTINGS.reportLanguage;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") && value.length > 0 ? value : fallback;
}

function stripJsonFence(content: string): string {
  return content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

function decodeBase64Content(data: GitHubContentApiResponse): string {
  if (data.type !== "file" || data.encoding !== "base64" || !data.content) {
    return "";
  }

  const binary = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function analysisKey(analysisId: string): string {
  return `repolens.analysis.${analysisId}`;
}
