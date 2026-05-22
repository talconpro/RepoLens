import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type AnalysisRecord } from "@repolens/shared";
import { getAnalysisRecord, listAnalysisRecords, loadSettings, normalizeApiBaseUrl, saveAnalysisRecord, saveSettings } from "./api";

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        async get(key: string | null) {
          if (key === null) {
            return Object.fromEntries(storage.entries());
          }
          return { [key]: storage.get(key) };
        },
        async set(values: Record<string, unknown>) {
          Object.entries(values).forEach(([key, value]) => storage.set(key, value));
        }
      }
    },
    permissions: {
      async contains() {
        return true;
      },
      async request() {
        return true;
      }
    },
    runtime: {
      getURL(path: string) {
        return `chrome-extension://test/${path}`;
      },
      async openOptionsPage() {}
    },
    tabs: {
      async create() {}
    }
  });
});

describe("extension settings", () => {
  it("loads defaults when no settings are stored", async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("saves and reloads normalized settings", async () => {
    await saveSettings({
      apiBaseUrl: "https://api.openai.com/v1/",
      apiKey: " sk-test ",
      model: "gpt-4o-mini",
      reportLanguage: "zh-en"
    });

    await expect(loadSettings()).resolves.toEqual({
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      reportLanguage: "zh-en"
    });
  });

  it("normalizes API base URLs", () => {
    expect(normalizeApiBaseUrl("https://example.com/v1///")).toBe("https://example.com/v1");
    expect(normalizeApiBaseUrl("")).toBe(DEFAULT_SETTINGS.apiBaseUrl);
  });
});

describe("analysis storage", () => {
  it("stores and reads local analysis records", async () => {
    const record: AnalysisRecord = {
      analysisId: "analysis_test",
      repoUrl: "https://github.com/owner/repo",
      status: "processing",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    };

    await saveAnalysisRecord(record);
    await expect(getAnalysisRecord(record.analysisId)).resolves.toEqual(record);
  });

  it("keeps a newest-first analysis history without duplicates", async () => {
    const first: AnalysisRecord = {
      analysisId: "analysis_first",
      repoUrl: "https://github.com/owner/first",
      status: "processing",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    };
    const second: AnalysisRecord = {
      analysisId: "analysis_second",
      repoUrl: "https://github.com/owner/second",
      status: "failed",
      createdAt: "2026-05-22T00:00:01.000Z",
      updatedAt: "2026-05-22T00:00:01.000Z"
    };

    await saveAnalysisRecord(first);
    await saveAnalysisRecord(second);
    await saveAnalysisRecord({ ...first, updatedAt: "2026-05-22T00:00:02.000Z" });

    const history = await listAnalysisRecords();
    expect(history.map((record) => record.analysisId)).toEqual(["analysis_first", "analysis_second"]);
  });
});
