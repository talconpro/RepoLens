import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const extensionDir = join(rootDir, "apps", "extension");
const distDir = join(extensionDir, "dist");
const releaseDir = join(rootDir, "release");
const manifestPath = join(extensionDir, "public", "manifest.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const version = manifest.version;
const zipName = `repolens-extension-v${version}.zip`;
const zipPath = join(releaseDir, zipName);

await assertDirectory(distDir, "Extension dist directory not found. Run `pnpm run build` before packaging.");
await mkdir(releaseDir, { recursive: true });
await cleanOldZips(releaseDir);
await zipDirectory(distDir, zipPath);

console.log(`Created ${join("release", zipName)}`);

async function assertDirectory(path, message) {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      throw new Error(message);
    }
  } catch {
    throw new Error(message);
  }
}

async function cleanOldZips(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
      .map((entry) => rm(join(directory, entry.name), { force: true }))
  );
}

async function zipDirectory(sourceDir, targetPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(targetPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}
