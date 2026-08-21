import globals from "globals";

// Third-party globals loaded via <script> tags / CDN that ESLint
// can't see from the source files alone.
const emailjsGlobal = { emailjs: "readonly" };
const pdfjsGlobal = { pdfjsLib: "readonly" };
const iconifyGlobal = { Iconify: "readonly" };
// Set via `window.APP_VERSION = "..."` in an inline <script> on the page.
const appVersionGlobal = { APP_VERSION: "readonly" };

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".wrangler/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": "error",
      "no-undef": "error",
    },
  },
  {
    // Node-based build tooling: these run under `node` (package.json has
    // "type": "module") and use import/export + Node globals, not the
    // browser <script>-tag sourceType the rest of the codebase uses.
    files: ["eslint.config.js", "vite.config.js", "scripts/*.js", "scripts/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Service worker runs in its own global scope, not the window/document one.
    files: ["sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    // Loaded via <script type="module">, so it needs ESM sourceType,
    // but still runs in the browser (keeps globals.browser from above).
    files: ["src/components/config/feedback-config.js", "src/components/js/feedback.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["src/components/js/feedback.js", "src/js/index.js"],
    languageOptions: { globals: emailjsGlobal },
  },
  {
    files: ["src/components/js/pdf-reader.js", "src/js/novelas.js", "src/js/manga.js"],
    languageOptions: { globals: pdfjsGlobal },
  },
  {
    files: ["src/js/about.js", "src/js/music.js"],
    languageOptions: { globals: iconifyGlobal },
  },
  {
    files: ["src/js/estrella.js"],
    languageOptions: { globals: appVersionGlobal },
  },
];
