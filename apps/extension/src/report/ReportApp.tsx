import { FileCode2, FileText, History, ImageDown, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { AnalysisRecord, AnalysisResult } from "@repolens/shared";
import { createReportFilename, parseGitHubRepoUrl } from "@repolens/shared";
import { getAnalysisRecord, getHtml, getMarkdown, openHistoryPage } from "../api";
import { downloadTextFile } from "../download";
import { START_ANALYSIS_MESSAGE, type StartAnalysisResponse } from "../messages";

const sections = [
  ["overview", "项目概览"],
  ["audience", "适合人群"],
  ["value", "核心价值"],
  ["tech", "技术栈分析"],
  ["directory", "目录结构说明"],
  ["files", "关键文件导读"],
  ["run", "运行方式"],
  ["learning", "学习路线"],
  ["development", "二次开发建议"],
  ["risks", "风险与注意事项"],
  ["conclusion", "总结"]
] as const;

export function ReportApp() {
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>("");
  const [loadingMessage, setLoadingMessage] = useState<string>("正在加载报告...");
  const [downloading, setDownloading] = useState<"md" | "html" | "png" | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const reportRef = useRef<HTMLElement | null>(null);
  const analysisId = useMemo(() => new URLSearchParams(window.location.search).get("id") ?? "", []);

  useEffect(() => {
    let cancelled = false;

    async function pollReport(): Promise<void> {
      const shouldContinue = await loadReport();
      if (!cancelled && shouldContinue) {
        window.setTimeout(pollReport, 1500);
      }
    }

    void pollReport();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  async function loadReport(): Promise<boolean> {
    if (!analysisId) {
      setError("缺少分析任务 ID。");
      return false;
    }

    const nextRecord = await getAnalysisRecord(analysisId);
    setRecord(nextRecord);
    if (!nextRecord) {
      setLoadingMessage("分析任务正在初始化...");
      return true;
    }

    if (nextRecord.status === "failed") {
      setError(nextRecord.error?.message ?? "项目分析失败，请重新发起分析。");
      return false;
    }

    if (nextRecord.status !== "success" || !nextRecord.result) {
      setLoadingMessage("正在后台分析项目，完成后会自动显示报告...");
      return true;
    }

    setResult(nextRecord.result);
    return false;
  }

  async function handleDownload(type: "md" | "html" | "png"): Promise<void> {
    if (!result) {
      return;
    }

    setDownloading(type);
    try {
      const [owner, repo] = result.repoInfo.fullName.split("/");
      if (type === "md") {
        const markdown = await getMarkdown(analysisId);
        downloadTextFile(createReportFilename(owner, repo, "md"), markdown, "text/markdown;charset=utf-8");
      } else if (type === "html") {
        const html = await getHtml(analysisId);
        downloadTextFile(createReportFilename(owner, repo, "html"), html, "text/html;charset=utf-8");
      } else if (reportRef.current) {
        const dataUrl = await toPng(reportRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#ffffff"
        });
        downloadDataUrl(createReportFilename(owner, repo, "png"), dataUrl);
      }
    } finally {
      setDownloading(null);
    }
  }

  async function handleReanalyze(): Promise<void> {
    const repoUrl = result?.repoInfo.htmlUrl ?? record?.repoUrl;
    const repo = repoUrl ? parseGitHubRepoUrl(repoUrl) : null;
    if (!repo) {
      setError("无法识别当前报告对应的 GitHub 仓库。");
      return;
    }

    setReanalyzing(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: START_ANALYSIS_MESSAGE,
        repo
      })) as StartAnalysisResponse;
      if (!response.ok || !response.record) {
        throw new Error(response.message ?? "重新分析启动失败。");
      }
      window.location.href = `report.html?id=${response.record.analysisId}`;
    } catch (reanalyzeError) {
      setError(reanalyzeError instanceof Error ? reanalyzeError.message : "重新分析启动失败。");
    } finally {
      setReanalyzing(false);
    }
  }

  return (
    <main className="report-page">
      <header className="report-header">
        <div>
          <h1 className="report-title">{result ? result.repoInfo.fullName : "RepoLens 分析报告"}</h1>
          <p className="muted">{result ? `生成时间：${new Date(result.generatedAt).toLocaleString()}` : "正在准备报告内容"}</p>
        </div>
        <div className="toolbar">
          <button className="ghost-button" type="button" disabled={reanalyzing || (!result && !record)} onClick={() => void handleReanalyze()}>
            <RefreshCw size={16} />
            重新分析
          </button>
          <button className="secondary-button" type="button" disabled={!result || downloading === "md"} onClick={() => void handleDownload("md")}>
            <FileText size={16} />
            Markdown
          </button>
          <button className="secondary-button" type="button" disabled={!result || downloading === "html"} onClick={() => void handleDownload("html")}>
            <FileCode2 size={16} />
            HTML
          </button>
          <button className="secondary-button" type="button" disabled={!result || downloading === "png"} onClick={() => void handleDownload("png")}>
            <ImageDown size={16} />
            PNG
          </button>
          <button className="ghost-button" type="button" onClick={() => void openHistoryPage()}>
            <History size={16} />
            历史
          </button>
        </div>
      </header>

      {error ? (
        <section className="report-layout">
          <div className="report-content">
            <p className="error-box">
              <TriangleAlert size={16} /> {error}
            </p>
          </div>
        </section>
      ) : result ? (
        <section className="report-layout">
          <nav className="toc" aria-label="报告目录">
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <ReportContent ref={reportRef} result={result} />
        </section>
      ) : (
        <section className="report-layout">
          <div className="report-content">
            <p className="status-row">
              <Loader2 size={16} /> {loadingMessage}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

const ReportContent = forwardRef<HTMLElement, { result: AnalysisResult }>(function ReportContent({ result }, ref) {
  return (
    <article className="report-content" ref={ref}>
      <h1>GitHub 项目分析报告：{result.repoInfo.fullName}</h1>
      <div className="metric-grid">
        <Metric label="主要语言" value={result.repoInfo.language ?? "无法确认"} />
        <Metric label="Stars" value={String(result.repoInfo.stars)} />
        <Metric label="Forks" value={String(result.repoInfo.forks)} />
        <Metric label="License" value={result.repoInfo.license ?? "无法确认"} />
        <Metric label="默认分支" value={result.repoInfo.defaultBranch} />
        <Metric label="最近推送" value={new Date(result.repoInfo.pushedAt).toLocaleDateString()} />
      </div>

      <h2 id="overview">项目概览</h2>
      <p>{result.summary}</p>

      <h2 id="audience">适合人群</h2>
      <List items={result.targetUsers} />

      <h2 id="value">核心价值</h2>
      <p>{result.coreValue}</p>

      <h2 id="tech">技术栈分析</h2>
      <List items={result.techStack} />

      <h2 id="directory">目录结构说明</h2>
      {result.directoryExplanation.map((item) => (
        <p key={item.path}>
          <strong>{item.path}</strong>：{item.purpose}
        </p>
      ))}

      <h2 id="files">关键文件导读</h2>
      {result.keyFiles.length > 0 ? (
        result.keyFiles.map((file) => (
          <section className="key-file" key={file.path}>
            <h3>{file.path}</h3>
            <p>文件作用：{file.role}</p>
            <p>推荐原因：{file.reason}</p>
            <p>阅读建议：{file.readingAdvice}</p>
          </section>
        ))
      ) : (
        <p>当前抽样范围内未识别到明确关键源码文件。</p>
      )}

      <h2 id="run">运行方式</h2>
      <p>{result.runGuide}</p>

      <h2 id="learning">学习路线</h2>
      <ol>
        {result.learningPath.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      <h2 id="development">二次开发建议</h2>
      <p>{result.developmentAdvice}</p>

      <h2 id="risks">风险与注意事项</h2>
      <List items={result.risks} />

      <h2 id="conclusion">总结</h2>
      <p>{result.conclusion}</p>
    </article>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function downloadDataUrl(filename: string, dataUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
