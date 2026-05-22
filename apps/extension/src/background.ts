import { DEFAULT_SETTINGS, type AnalysisRecord, type RepoRef } from "@repolens/shared";
import {
  completeAnalysisRecord,
  createAnalysisRecord,
  getAnalysisRecord,
  listAnalysisRecords,
  loadSettings,
  saveAnalysisRecord,
  saveSettings
} from "./api";
import { isStartAnalysisMessage, type StartAnalysisResponse } from "./messages";

const QUEUE_KEY = "repolens.analysisQueue";
const SWEEP_ALARM = "repolens.analysisSweep";
const STALE_AFTER_MS = 10 * 60 * 1000;
const runningAnalyses = new Set<string>();

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeBackground();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) {
    void processBackgroundQueue();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isStartAnalysisMessage(message)) {
    return false;
  }

  void (async () => {
    try {
      const record = await createAnalysisRecord(message.repo);
      await enqueueAnalysis(record.analysisId, message.repo);
      void processQueuedAnalysis(record.analysisId, message.repo);
      sendResponse({ ok: true, record } satisfies StartAnalysisResponse);
    } catch (error) {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : "分析任务启动失败。"
      } satisfies StartAnalysisResponse);
    }
  })();

  return true;
});

async function initializeBackground(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({
    apiBaseUrl: settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_SETTINGS.model,
    reportLanguage: settings.reportLanguage || DEFAULT_SETTINGS.reportLanguage
  });
  await chrome.storage.local.set({
    repolensInstalledAt: new Date().toISOString()
  });
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  await processBackgroundQueue();
}

async function processBackgroundQueue(): Promise<void> {
  await markOrphanedProcessingRecordsFailed();
  const queue = await loadQueue();
  await Promise.all(Object.entries(queue).map(([analysisId, repo]) => processQueuedAnalysis(analysisId, repo)));
}

async function enqueueAnalysis(analysisId: string, repo: RepoRef): Promise<void> {
  const queue = await loadQueue();
  await chrome.storage.local.set({
    [QUEUE_KEY]: {
      ...queue,
      [analysisId]: repo
    }
  });
}

async function dequeueAnalysis(analysisId: string): Promise<void> {
  const queue = await loadQueue();
  delete queue[analysisId];
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

async function loadQueue(): Promise<Record<string, RepoRef>> {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  const value = stored[QUEUE_KEY];
  return isQueue(value) ? value : {};
}

async function processQueuedAnalysis(analysisId: string, repo: RepoRef): Promise<void> {
  if (runningAnalyses.has(analysisId)) {
    return;
  }

  runningAnalyses.add(analysisId);
  try {
    const record = await getAnalysisRecord(analysisId);
    if (!record || record.status === "success" || record.status === "failed") {
      await dequeueAnalysis(analysisId);
      return;
    }

    await completeAnalysisRecord(record, repo);
    await dequeueAnalysis(analysisId);
  } catch {
    await dequeueAnalysis(analysisId);
  } finally {
    runningAnalyses.delete(analysisId);
  }
}

async function markOrphanedProcessingRecordsFailed(): Promise<void> {
  const queue = await loadQueue();
  const records = await listAnalysisRecords();
  const now = Date.now();

  await Promise.all(
    records
      .filter((record) => record.status === "processing")
      .filter((record) => !queue[record.analysisId])
      .filter((record) => now - Date.parse(record.updatedAt) > STALE_AFTER_MS)
      .map((record) =>
        saveAnalysisRecord({
          ...record,
          status: "failed",
          error: {
            code: "ANALYSIS_INTERRUPTED",
            message: "分析任务已中断，请重新发起分析。"
          },
          updatedAt: new Date().toISOString()
        } satisfies AnalysisRecord)
      )
  );
}

function isQueue(value: unknown): value is Record<string, RepoRef> {
  return typeof value === "object" && value !== null;
}
