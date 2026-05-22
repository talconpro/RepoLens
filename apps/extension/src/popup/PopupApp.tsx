import { BookOpen, CheckCircle2, ExternalLink, History, Loader2, Play, Settings, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseGitHubRepoUrl } from "@repolens/shared";
import { loadSettings, openHistoryPage, openOptionsPage } from "../api";
import { START_ANALYSIS_MESSAGE, type StartAnalysisResponse } from "../messages";

type PopupState = "idle" | "loading" | "success" | "error";

export function PopupApp() {
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [state, setState] = useState<PopupState>("idle");
  const [message, setMessage] = useState<string>("");
  const repo = useMemo(() => parseGitHubRepoUrl(currentUrl), [currentUrl]);

  useEffect(() => {
    void loadInitialState();
  }, []);

  async function loadInitialState(): Promise<void> {
    await loadActiveTabUrl();
    const settings = await loadSettings();
    setHasApiKey(Boolean(settings.apiKey));
  }

  async function loadActiveTabUrl(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      setCurrentUrl(window.location.href);
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setCurrentUrl(tab?.url ?? "");
  }

  async function handleAnalyze(): Promise<void> {
    if (!repo) {
      setState("error");
      setMessage("当前页面不是 GitHub 仓库页面，请打开一个 GitHub 项目主页后再使用。");
      return;
    }

    if (!hasApiKey) {
      setState("error");
      setMessage("请先在设置页填写 API Key。");
      return;
    }

    setState("loading");
    setMessage("正在读取仓库并生成报告...");

    try {
      const response = (await chrome.runtime.sendMessage({
        type: START_ANALYSIS_MESSAGE,
        repo
      })) as StartAnalysisResponse;
      if (!response.ok || !response.record) {
        throw new Error(response.message ?? "分析任务启动失败。");
      }
      setState("success");
      setMessage("分析完成，正在打开报告页。");
      await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?id=${response.record.analysisId}`) });
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "项目分析失败，请重新发起分析。");
    }
  }

  return (
    <main className="popup-shell">
      <header className="brand-row">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={18} />
          </span>
          <div>
            <h1 className="title">RepoLens</h1>
            <p className="subtitle">GitHub 项目速读</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" title="历史记录" onClick={() => void openHistoryPage()}>
            <History size={17} />
          </button>
          <button className="icon-button" type="button" title="设置" onClick={() => void openOptionsPage()}>
            <Settings size={17} />
          </button>
        </div>
      </header>

      <section className="panel">
        {repo ? (
          <>
            <p className="repo-name">
              {repo.owner}/{repo.repo}
            </p>
            <p className="url-text">{repo.canonicalUrl}</p>
          </>
        ) : (
          <>
            <p className="repo-name">未识别到仓库</p>
            <p className="url-text">请打开 GitHub 公开仓库主页后再使用。</p>
          </>
        )}
      </section>

      <section className="panel">
        <p className="title">分析内容</p>
        <ul className="scope-list">
          <li>
            <CheckCircle2 size={16} />
            README 与项目概览
          </li>
          <li>
            <CheckCircle2 size={16} />
            目录结构与配置文件
          </li>
          <li>
            <CheckCircle2 size={16} />
            关键源码文件导读
          </li>
          <li>
            <CheckCircle2 size={16} />
            运行方式与学习路线
          </li>
        </ul>

        <button className="primary-button" type="button" disabled={!repo || state === "loading"} onClick={handleAnalyze}>
          {state === "loading" ? <Loader2 size={16} /> : <Play size={16} />}
          开始分析
        </button>

        {!hasApiKey && (
          <button className="ghost-button full-width" type="button" onClick={() => void openOptionsPage()}>
            <Settings size={16} />
            配置 API Key
          </button>
        )}

        {message && (
          <div className={state === "error" ? "error-box" : "status-row"}>
            {state === "error" ? <TriangleAlert size={16} /> : <ExternalLink size={16} />}
            <span>{message}</span>
          </div>
        )}
      </section>
    </main>
  );
}
