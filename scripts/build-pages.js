const fs = require("fs");
const path = require("path");

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
