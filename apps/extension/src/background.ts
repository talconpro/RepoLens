import { DEFAULT_SETTINGS } from "@repolens/shared";
import { loadSettings, saveSettings } from "./api";

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
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
  })();
});
