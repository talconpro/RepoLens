import { BookOpen, ExternalLink, FileText, Loader2, RotateCw, Settings, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { AnalysisRecord } from "@repolens/shared";
import { listAnalysisRecords, openOptionsPage } from "../api";

export function HistoryApp() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      setRecords(await listAnalysisRecords());
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "历史记录加载失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="history-page">
      <header className="history-header">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={18} />
          </span>
          <div>
            <h1 className="options-title">分析历史</h1>
            <p className="subtitle">查看最近分析过的 GitHub 项目。</p>
          </div>
        </div>
        <div className="toolbar">
          <button className="ghost-button" type="button" onClick={() => void loadHistory()}>
            <RotateCw size={16} />
            刷新
          </button>
          <button className="ghost-button" type="button" onClick={() => void openOptionsPage()}>
            <Settings size={16} />
            设置
          </button>
        </div>
      </header>

      {loading ? (
        <section className="history-empty">
          <Loader2 size={18} />
          正在加载历史记录...
        </section>
      ) : error ? (
        <section className="history-empty error-box">
          <TriangleAlert size={18} />
          {error}
        </section>
      ) : records.length === 0 ? (
        <section className="history-empty">
          <FileText size={18} />
          暂无历史记录。打开 GitHub 仓库并完成一次分析后会出现在这里。
        </section>
      ) : (
        <section className="history-list">
          {records.map((record) => (
            <HistoryItem key={record.analysisId} record={record} />
          ))}
        </section>
      )}
    </main>
  );
}

function HistoryItem({ record }: { record: AnalysisRecord }) {
  const result = record.result;
  const title = result?.repoInfo.fullName ?? safeRepoTitle(record.repoUrl);
  const statusLabel = record.status === "success" ? "已完成" : record.status === "failed" ? "失败" : "分析中";
  const statusClass = record.status === "success" ? "status-success" : record.status === "failed" ? "status-failed" : "status-pending";

  return (
    <article className="history-item">
      <div>
        <div className="history-title-row">
          <h2 className="history-title">{title}</h2>
          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
        </div>
        <p className="muted">{record.repoUrl}</p>
        <div className="history-meta">
          {result?.repoInfo.language && <span>{result.repoInfo.language}</span>}
          {result && <span>{result.repoInfo.stars} stars</span>}
          <span>{new Date(record.updatedAt).toLocaleString()}</span>
        </div>
        {record.error?.message && <p className="history-error">{record.error.message}</p>}
      </div>
      <div className="history-actions">
        <a className="ghost-button" href={record.repoUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          GitHub
        </a>
        <a className="secondary-button" href={`report.html?id=${record.analysisId}`}>
          <FileText size={16} />
          报告
        </a>
      </div>
    </article>
  );
}

function safeRepoTitle(repoUrl: string): string {
  try {
    return new URL(repoUrl).pathname.split("/").filter(Boolean).slice(0, 2).join("/");
  } catch {
    return repoUrl;
  }
}
