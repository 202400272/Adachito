// Runs after `vite build`. Copies files that are loaded via runtime
// fetch()/string paths rather than <link>/<script> tags Vite can see,
// so it can't hash or bundle them — they just need to reach dist/ as-is.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

// [source relative to project root, dest relative to dist]
const ITEMS = [
  ["assets", "assets"], // Imagenes/ + Sound/, referenced by dynamic JS paths
  ["src/data", "src/data"], // JSON content, fetch()'d by string path per page
  ["src/components/menu.html", "src/components/menu.html"], // fetch()'d fragment
  ["src/components/feedback.html", "src/components/feedback.html"], // fetch()'d fragment
  ["_redirects", "_redirects"], // Cloudflare Pages reads this from the output dir
  // Plain (non type="module") <script src="..."> tags aren't bundled by
  // Vite and aren't moved into dist either — it just leaves the src
  // reference as-is, so the actual files need to land at that same
  // path or every page's JS 404s in the built site. This is a stopgap;
  // switching these to type="module" lets Vite bundle/minify/hash them
  // properly instead of copying them raw.
  ["src/js", "src/js"],
  ["src/pages/otros/js", "src/pages/otros/js"],
];

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(src)) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

async function main() {
  for (const [src, dest] of ITEMS) {
    const srcPath = path.join(root, src);
    const destPath = path.join(dist, dest);
    try {
      await fs.access(srcPath);
      await copyRecursive(srcPath, destPath);
      console.log("Copied", src);
    } catch {
      console.log(`Skipping ${src}: not found`);
    }
  }
  console.log("\nStatic copy complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});