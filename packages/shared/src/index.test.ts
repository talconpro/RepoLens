import { describe, expect, it } from "vitest";
import {
  createReportFilename,
  parseGitHubRepoUrl,
  selectConfigFiles,
  selectImportantSourceFiles,
  truncateFile
} from "./index";

describe("parseGitHubRepoUrl", () => {
  it("parses repository home pages", () => {
    expect(parseGitHubRepoUrl("https://github.com/openai/openai-node")).toEqual({
      owner: "openai",
      repo: "openai-node",
      canonicalUrl: "https://github.com/openai/openai-node"
    });
  });

  it("parses repository sub pages as the same repo", () => {
    expect(parseGitHubRepoUrl("https://github.com/owner/repo/tree/main/src")?.canonicalUrl).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("rejects non GitHub URLs and GitHub non-repo pages", () => {
    expect(parseGitHubRepoUrl("https://example.com/owner/repo")).toBeNull();
    expect(parseGitHubRepoUrl("https://github.com/features")).toBeNull();
  });
});

describe("file helpers", () => {
  it("selects config files in a stable priority order", () => {
    expect(selectConfigFiles(["src/index.ts", "Dockerfile", "package.json"])).toEqual(["package.json", "Dockerfile"]);
  });

  it("prioritizes entry source files", () => {
    expect(selectImportantSourceFiles(["src/utils.ts", "src/index.ts", "examples/demo.ts"], 2)).toEqual([
      "src/index.ts",
      "src/utils.ts"
    ]);
  });

  it("truncates oversized files", () => {
    expect(truncateFile("README.md", "abcdef", 3)).toEqual({
      path: "README.md",
      content: "abc\n\n[Content truncated by RepoLens]",
      truncated: true
    });
  });

  it("creates export filenames", () => {
    expect(createReportFilename("owner", "repo", "md")).toBe("owner-repo-analysis.md");
  });
});
