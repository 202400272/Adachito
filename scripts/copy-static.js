import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const BUILD_ID = Date.now().toString(36);

function isCacheBustSafeUrl(url) {
  return (
    !url ||
    url.startsWith("#") ||
    url.startsWith("data:") ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    /^([a-z]+:)?\/\//i.test(url)
  );
}

async function appendCacheBustToHtml(filePath) {
  let content = await fs.readFile(filePath, "utf8");
  const updated = content.replace(
    /(src|href)=(['"])([^'"?#]+)(\?[^'"#]*)?\2/g,
    (match, attr, quote, url, existingQuery) => {
      if (isCacheBustSafeUrl(url)) return match;
      if (url.startsWith("/")) {
        const params = new URLSearchParams(existingQuery ? existingQuery.replace(/^\?/, "") : "");
        params.set("v", BUILD_ID);
        const queryString = params.toString();
        return `${attr}=${quote}${url}${queryString ? `?${queryString}` : ""}${quote}`;
      }
      return match;
    },
  );

  if (updated !== content) {
    await fs.writeFile(filePath, updated, "utf8");
  }
}

async function addBuildStampToHtmlFiles() {
  const entries = await fs.readdir(dist, { recursive: true });
  for (const entry of entries) {
    if (!entry.endsWith(".html")) continue;
    const filePath = path.join(dist, entry);
    await appendCacheBustToHtml(filePath);
  }
}

// [source relative to project root, dest relative to dist]
const ITEMS = [
  ["assets", "assets"], // Imagenes/ + Sound/, referenced by dynamic JS paths
  ["src/data", "src/data"], // JSON content, fetch()'d by string path per page
  ["src/css", "src/css"], // Raw CSS files referenced directly by static pages
  ["src/components/styles", "src/components/styles"], // CSS files loaded as static runtime assets
  ["src/components/menu.html", "src/components/menu.html"], // fetch()'d fragment
  ["src/components/feedback.html", "src/components/feedback.html"], // fetch()'d fragment
  ["_redirects", "_redirects"], // Cloudflare Pages reads this from the output dir
  ["robots.txt", "robots.txt"], // Crawler rules + sitemap pointer
  ["sitemap.xml", "sitemap.xml"], // Full URL list for search engines
  ["manifest.json", "manifest.json"],
  ["sw.js", "sw.js"],
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

  await addBuildStampToHtmlFiles();
  console.log(`\nStatic copy complete with build stamp ${BUILD_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
