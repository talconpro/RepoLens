import { CheckCircle2, Loader2, Save, TestTube2, TriangleAlert } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { ExtensionSettings } from "@repolens/shared";
import { DEFAULT_SETTINGS } from "@repolens/shared";
import { loadSettings, saveSettings, testConnection } from "../api";

type Status = { type: "idle" | "success" | "error" | "loading"; message: string };

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
    })();
  }, []);

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus({ type: "loading", message: "正在保存配置..." });
    try {
      await saveSettings(settings);
      setSettings(await loadSettings());
      setStatus({ type: "success", message: "配置已保存。" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "保存失败。" });
    }
  }

  async function handleTest(): Promise<void> {
    setStatus({ type: "loading", message: "正在测试连接..." });
    try {
      await testConnection(settings);
      setStatus({ type: "success", message: "连接成功。" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "连接失败。" });
    }
  }

  return (
    <main className="options-page">
      <section className="options-card">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <h1 className="options-title">RepoLens 设置</h1>
            <p className="subtitle">配置 OpenAI 兼容接口，用于在插件内直接生成报告。</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={(event) => void handleSave(event)}>
          <label className="field">
            <span>API Base URL</span>
            <input
              value={settings.apiBaseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })}
            />
          </label>

          <label className="field">
            <span>API Key</span>
            <input
              value={settings.apiKey}
              placeholder="sk-xxxxxxxx"
              type="password"
              onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Model</span>
            <input
              value={settings.model}
              placeholder="gpt-4o-mini"
              onChange={(event) => setSettings({ ...settings, model: event.target.value })}
            />
          </label>

          <label className="field">
            <span>报告语言</span>
            <select
              value={settings.reportLanguage}
              onChange={(event) => setSettings({ ...settings, reportLanguage: event.target.value === "zh-en" ? "zh-en" : "zh-CN" })}
            >
              <option value="zh-CN">中文</option>
              <option value="zh-en">中英双语</option>
            </select>
          </label>

          <div className="toolbar">
            <button className="secondary-button" type="submit" disabled={status.type === "loading"}>
              <Save size={16} />
              保存配置
            </button>
            <button className="ghost-button" type="button" disabled={status.type === "loading"} onClick={() => void handleTest()}>
              <TestTube2 size={16} />
              测试连接
            </button>
          </div>
        </form>

        {status.message && (
          <div className={status.type === "error" ? "error-box" : "status-row"}>
            {status.type === "loading" ? <Loader2 size={16} /> : status.type === "error" ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />}
            <span>{status.message}</span>
          </div>
        )}
      </section>
    </main>
  );
}
