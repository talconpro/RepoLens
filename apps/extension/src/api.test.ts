import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type AnalysisRecord } from "@repolens/shared";
import {
  deleteAnalysisRecords,
  getAnalysisRecord,
  listAnalysisRecords,
  loadSettings,
  normalizeApiBaseUrl,
  saveAnalysisRecord,
  saveSettings,
  testGitHubConnection
} from "./api";

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
        },
        async remove(keys: string | string[]) {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => storage.delete(key));
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
      reportLanguage: "zh-en",
      githubToken: " ghp-test "
    });

    await expect(loadSettings()).resolves.toEqual({
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      reportLanguage: "zh-en",
      githubToken: "ghp-test"
    });
  });

  it("normalizes API base URLs", () => {
    expect(normalizeApiBaseUrl("https://example.com/v1///")).toBe("https://example.com/v1");
    expect(normalizeApiBaseUrl("")).toBe(DEFAULT_SETTINGS.apiBaseUrl);
  });
});

describe("GitHub connection", () => {
  it("tests GitHub quota with token authentication", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          resources: {
            core: {
              limit: 5000,
              remaining: 4999,
              reset: 1_779_408_000
            }
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testGitHubConnection({
        ...DEFAULT_SETTINGS,
        githubToken: " ghp-test "
      })
    ).resolves.toMatchObject({
      authenticated: true,
      limit: 5000,
      remaining: 4999
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/rate_limit",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp-test"
        })
      })
    );
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

  it("deletes analysis records from storage and history", async () => {
    const record: AnalysisRecord = {
      analysisId: "analysis_delete",
      repoUrl: "https://github.com/owner/delete-me",
      status: "processing",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    };

    await saveAnalysisRecord(record);
    await deleteAnalysisRecords([record.analysisId]);

    await expect(getAnalysisRecord(record.analysisId)).resolves.toBeNull();
    await expect(listAnalysisRecords()).resolves.toEqual([]);
  });
});
