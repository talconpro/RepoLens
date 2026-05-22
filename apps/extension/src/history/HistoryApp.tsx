import {
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileText,
  Loader2,
  RotateCw,
  Search,
  Settings,
  Trash2,
  TriangleAlert
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisRecord } from "@repolens/shared";
import { deleteAnalysisRecords, listAnalysisRecords, openOptionsPage } from "../api";

interface HistoryGroup {
  key: string;
  title: string;
  repoUrl: string;
  records: AnalysisRecord[];
}

export function HistoryApp() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadHistory();
  }, []);

  const groups = useMemo(() => groupRecords(records, query), [records, query]);
  const visibleIds = useMemo(() => groups.flatMap((group) => group.records.map((record) => record.analysisId)), [groups]);
  const selectedVisibleCount = visibleIds.filter((analysisId) => selectedIds.has(analysisId)).length;

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

  async function handleDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const confirmed = window.confirm(ids.length === 1 ? "确定删除这条分析记录吗？" : `确定删除选中的 ${ids.length} 条分析记录吗？`);
    if (!confirmed) {
      return;
    }

    await deleteAnalysisRecords(ids);
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    await loadHistory();
  }

  function toggleSelected(analysisId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(analysisId)) {
        next.delete(analysisId);
      } else {
        next.add(analysisId);
      }
      return next;
    });
  }

  function toggleVisibleSelection(): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((analysisId) => next.has(analysisId));
      visibleIds.forEach((analysisId) => {
        if (allVisibleSelected) {
          next.delete(analysisId);
        } else {
          next.add(analysisId);
        }
      });
      return next;
    });
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
            <p className="subtitle">按仓库分组查看最近分析过的 GitHub 项目。</p>
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

      <section className="history-controls">
        <label className="search-box">
          <Search size={16} />
          <input value={query} placeholder="按组织/仓库搜索，例如 openai/gpt" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="toolbar">
          <button className="ghost-button" type="button" disabled={visibleIds.length === 0} onClick={toggleVisibleSelection}>
            <CheckSquare size={16} />
            {selectedVisibleCount === visibleIds.length && visibleIds.length > 0 ? "取消全选" : "全选当前"}
          </button>
          <button className="danger-button" type="button" disabled={selectedIds.size === 0} onClick={() => void handleDelete([...selectedIds])}>
            <Trash2 size={16} />
            删除选中
          </button>
        </div>
      </section>

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
      ) : groups.length === 0 ? (
        <section className="history-empty">
          <Search size={18} />
          没有匹配的历史记录。
        </section>
      ) : (
        <section className="history-list">
          {groups.map((group) => (
            <HistoryGroupSection
              group={group}
              key={group.key}
              selectedIds={selectedIds}
              onDelete={handleDelete}
              onToggleSelected={toggleSelected}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function HistoryGroupSection({
  group,
  selectedIds,
  onDelete,
  onToggleSelected
}: {
  group: HistoryGroup;
  selectedIds: Set<string>;
  onDelete: (ids: string[]) => Promise<void>;
  onToggleSelected: (analysisId: string) => void;
}) {
  const latest = group.records[0];

  return (
    <article className="history-group">
      <header className="history-group-header">
        <div>
          <h2 className="history-title">{group.title}</h2>
          <p className="muted">
            {group.records.length} 条报告 · 最近更新 {new Date(latest.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="history-actions">
          <a className="ghost-button" href={group.repoUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            GitHub
          </a>
          <button className="danger-button" type="button" onClick={() => void onDelete(group.records.map((record) => record.analysisId))}>
            <Trash2 size={16} />
            删除整组
          </button>
        </div>
      </header>
      <div className="history-group-records">
        {group.records.map((record) => (
          <HistoryItem
            key={record.analysisId}
            record={record}
            selected={selectedIds.has(record.analysisId)}
            onDelete={onDelete}
            onToggleSelected={onToggleSelected}
          />
        ))}
      </div>
    </article>
  );
}

function HistoryItem({
  record,
  selected,
  onDelete,
  onToggleSelected
}: {
  record: AnalysisRecord;
  selected: boolean;
  onDelete: (ids: string[]) => Promise<void>;
  onToggleSelected: (analysisId: string) => void;
}) {
  const result = record.result;
  const statusLabel = record.status === "success" ? "已完成" : record.status === "failed" ? "失败" : "分析中";
  const statusClass = record.status === "success" ? "status-success" : record.status === "failed" ? "status-failed" : "status-pending";

  return (
    <article className="history-item">
      <label className="history-checkbox" title="选择记录">
        <input checked={selected} type="checkbox" onChange={() => onToggleSelected(record.analysisId)} />
      </label>
      <div>
        <div className="history-title-row">
          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
          <span className="history-run-title">{new Date(record.updatedAt).toLocaleString()}</span>
        </div>
        <div className="history-meta">
          {result?.repoInfo.language && <span>{result.repoInfo.language}</span>}
          {result && <span>{result.repoInfo.stars} stars</span>}
          <span>{record.analysisId}</span>
        </div>
        {record.error?.message && <p className="history-error">{record.error.message}</p>}
      </div>
      <div className="history-actions">
        <a className="secondary-button" href={`report.html?id=${record.analysisId}`}>
          <FileText size={16} />
          报告
        </a>
        <button className="danger-button icon-danger" type="button" title="删除记录" onClick={() => void onDelete([record.analysisId])}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function groupRecords(records: AnalysisRecord[], query: string): HistoryGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const groups = new Map<string, HistoryGroup>();

  records.forEach((record) => {
    const title = record.result?.repoInfo.fullName ?? safeRepoTitle(record.repoUrl);
    const key = title.toLowerCase();
    if (normalizedQuery && !key.includes(normalizedQuery)) {
      return;
    }

    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      return;
    }

    groups.set(key, {
      key,
      title,
      repoUrl: record.repoUrl,
      records: [record]
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      records: group.records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    }))
    .sort((a, b) => Date.parse(b.records[0].updatedAt) - Date.parse(a.records[0].updatedAt));
}

function safeRepoTitle(repoUrl: string): string {
  try {
    return new URL(repoUrl).pathname.split("/").filter(Boolean).slice(0, 2).join("/");
  } catch {
    return repoUrl;
  }
}
