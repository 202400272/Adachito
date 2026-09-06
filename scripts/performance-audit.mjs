import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.argv[2] || "dist";
if (!existsSync(root)) {
  console.error(`Performance audit: ${root}/ does not exist. Run npm run build first.`);
  process.exit(2);
}

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else files.push(p);
  }
}
walk(root);

const byExt = new Map();
for (const file of files) {
  const ext = extname(file).toLowerCase() || "[none]";
  const size = statSync(file).size;
  const item = byExt.get(ext) || { count: 0, bytes: 0 };
  item.count += 1;
  item.bytes += size;
  byExt.set(ext, item);
}

const html = files.filter((f) => extname(f).toLowerCase() === ".html");
const css = files.filter((f) => extname(f).toLowerCase() === ".css");
const js = files.filter((f) => extname(f).toLowerCase() === ".js");
const images = files.filter((f) =>
  [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(extname(f).toLowerCase()),
);

const warnings = [];
for (const file of images) {
  const size = statSync(file).size;
  if (size > 750 * 1024)
    warnings.push(`Large image: ${relative(".", file)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

let cssText = "";
for (const file of css) cssText += readFileSync(file, "utf8") + "\n";
const blurCount = (cssText.match(/backdrop-filter\s*:/g) || []).length;
const imports = (cssText.match(/@import\s+/g) || []).length;
if (blurCount > 100) warnings.push(`High backdrop-filter usage: ${blurCount} declarations`);
if (imports > 0) warnings.push(`CSS @import remains in built CSS: ${imports}`);

let htmlText = "";
for (const file of html) htmlText += readFileSync(file, "utf8") + "\n";
const renderBlockingStyles = (htmlText.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [])
  .length;
const printDeferredStyles = (htmlText.match(/media=["']print["'][^>]*onload=/gi) || []).length;
const syncScripts = (
  htmlText.match(/<script(?![^>]*(?:defer|async|type=["']module["']))[^>]*src=/gi) || []
).length;
if (printDeferredStyles)
  warnings.push(`Print/onload stylesheet trick still present: ${printDeferredStyles}`);
if (syncScripts) warnings.push(`Potentially parser-blocking classic scripts: ${syncScripts}`);

const total = files.reduce((sum, f) => sum + statSync(f).size, 0);
console.log("AdashimaVerse production performance audit");
console.log("==========================================");
console.log(`Files: ${files.length}`);
console.log(
  `HTML: ${html.length} | CSS: ${css.length} | JS: ${js.length} | Images: ${images.length}`,
);
console.log(`Total dist size: ${(total / 1024 / 1024).toFixed(2)} MB`);
console.log(`CSS backdrop-filter declarations: ${blurCount}`);
console.log(`CSS @imports: ${imports}`);
console.log(`Potential blocking stylesheets: ${renderBlockingStyles}`);
console.log(`Potential sync scripts: ${syncScripts}`);

console.log("\nLargest assets:");
for (const file of [...files].sort((a, b) => statSync(b).size - statSync(a).size).slice(0, 15)) {
  console.log(
    `  ${(statSync(file).size / 1024).toFixed(1).padStart(8)} KB  ${relative(".", file)}`,
  );
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`  - ${warning}`);
  process.exitCode = 1;
} else {
  console.log("\nNo static performance warnings detected.");
}
