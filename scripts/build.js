import fs from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

const ITEMS_TO_COPY = [
  "index.html",
  "offline.html",
  "sw.js",
  "_redirects",
  "assets",
  "src",
  "css",
  "js",
  "data",
  "pages",
];

const MINIFY_EXTENSIONS = new Set([".js", ".css"]);

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

async function normalizeRedirects(srcPath, destPath) {
  const raw = await fs.readFile(srcPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/\s+/g, " "));

  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, `${lines.join("\n")}\n`, "utf8");
}

async function minifyRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await minifyRecursive(fullPath);
    } else {
      const ext = path.extname(entry.name);
      if (MINIFY_EXTENSIONS.has(ext)) {
        const code = await fs.readFile(fullPath, "utf8");
        const loader = ext === ".css" ? "css" : "js";
        try {
          const result = await esbuild.transform(code, {
            loader,
            minify: true,
          });
          await fs.writeFile(fullPath, result.code, "utf8");
          console.log("Minified", path.relative(process.cwd(), fullPath));
        } catch (err) {
          console.warn(`Skipping minify for ${fullPath}:`, err.message);
        }
      }
    }
  }
}

async function main() {
  const root = process.cwd();
  const dist = path.join(root, "dist");

  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });

  for (const item of ITEMS_TO_COPY) {
    const src = path.join(root, item);
    const dest = path.join(dist, item);
    try {
      await fs.access(src);
      if (item === "_redirects") {
        await normalizeRedirects(src, dest);
        console.log("Copied and normalized _redirects");
      } else {
        await copyRecursive(src, dest);
        console.log("Copied", item);
      }
    } catch {
      console.log(`Skipping ${item}: not found`);
    }
  }

  console.log("\nMinifying JS and CSS...");
  await minifyRecursive(dist);

  console.log("\nBuild complete — output folder: dist");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
