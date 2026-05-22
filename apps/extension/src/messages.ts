import type { AnalysisRecord, RepoRef } from "@repolens/shared";

export const START_ANALYSIS_MESSAGE = "repolens.startAnalysis";

export interface StartAnalysisMessage {
  type: typeof START_ANALYSIS_MESSAGE;
  repo: RepoRef;
}

export interface StartAnalysisResponse {
  ok: boolean;
  record?: AnalysisRecord;
  message?: string;
}

export function isStartAnalysisMessage(value: unknown): value is StartAnalysisMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === START_ANALYSIS_MESSAGE &&
    "repo" in value
  );
}
