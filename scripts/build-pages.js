import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcPages = path.join(__dirname, "..", "src", "pages");
const root = path.join(__dirname, "..");

function copyHtmlFiles(srcDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(srcDir, entry.name);

    if (entry.isDirectory()) {
      copyHtmlFiles(fullPath);
      continue;
    }

    if (!entry.name.endsWith(".html")) {
      continue;
    }

    const destPath = path.join(root, entry.name);
    const content = fs.readFileSync(fullPath, "utf8");
    fs.writeFileSync(destPath, content, "utf8");
    console.log(`Copied ${path.relative(root, fullPath)} -> ${path.relative(root, destPath)}`);
  }
}

function main() {
  if (!fs.existsSync(srcPages)) {
    console.error("src/pages directory not found.");
    process.exit(1);
  }

  copyHtmlFiles(srcPages);
}

main();
