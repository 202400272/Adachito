import { defineConfig } from "vite";
import { resolve, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { transform } from "esbuild";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const page = (p) => resolve(root, p);

const runtimeCopies = [
  ["assets", "assets"],
  ["src/data", "src/data"],
  ["src/css/legal.css", "src/css/legal.css"],
  ["src/components/styles", "src/components/styles"],
  ["src/components/menu.html", "src/components/menu.html"],
  ["src/components/footer.html", "src/components/footer.html"],
  ["src/components/feedback.html", "src/components/feedback.html"],
  ["_redirects", "_redirects"],
  ["_headers", "_headers"],
  ["sw.js", "sw.js"],
];

// These are classic scripts loaded by URL rather than through Vite's module graph.
// Minify them with esbuild before placing them in dist/.
const runtimeJs = [
  ["src/js", "src/js"],
  ["src/pages/otros/js", "src/pages/otros/js"],
  ["src/pages/game.js", "src/pages/game.js"],
];

const previewRoutes = {
  "/Adashima_About": "src/pages/Adashima_About.html",
  "/Adashima_Settings": "src/pages/Adashima_Settings.html",
  "/Adashima_Help": "src/pages/Adashima_Help.html",
  "/Adashima_Anime": "src/pages/Adashima_Anime.html",
  "/Adashima_Drama": "src/pages/Adashima_Drama.html",
  "/Adashima_Estrella": "src/pages/Adashima_Estrella.html",
  "/Adashima_Extra_Stories": "src/pages/Adashima_Extra_Stories.html",
  "/Adashima_Gallery": "src/pages/Adashima_Gallery.html",
  "/Adashima_Linea": "src/pages/Adashima_Linea.html",
  "/Adashima_Manga": "src/pages/Adashima_Manga.html",
  "/Adashima_Music": "src/pages/Adashima_Music.html",
  "/Adashima_Novelas": "src/pages/Adashima_Novelas.html",
  "/Adashima_Otros": "src/pages/Adashima_Otros.html",
  "/Adashima_Stats": "src/pages/Adashima_Stats.html",
  "/Juego": "src/pages/Juego.html",
  "/otros/Author_Archive": "src/pages/otros/Author_Archive.html",
  "/otros/Web_Stories": "src/pages/otros/Web_Stories.html",
  "/Adashima_PWA": "src/pages/Adashima_PWA.html",
  "/privacy": "src/pages/Privacy.html",
  "/terms": "src/pages/Terms.html",
  "/otros/Web_Stories": "src/pages/otros/Web_Stories.html",
};

function themeBootstrap() {
  return {
    name: "theme-bootstrap",
    transformIndexHtml: {
      order: "pre",
      handler() {
        const script = `(function(){try{var a=localStorage.getItem("adashima_time_based_appearance"),m=localStorage.getItem("adashima_manual_appearance"),h=new Date().getHours(),t=h>=5&&h<12?"morning":h>=12&&h<19?"afternoon":"night";if(a!==null&&a!=="true"&&["morning","afternoon","night"].includes(m))t=m;document.body.classList.add("time-"+t);document.body.dataset.theme=t}catch(e){}})();`;
        return [{ tag: "script", children: script, injectTo: "body-prepend" }];
      },
    },
  };
}

const existingLoadingScreenCss = `
.loading-overlay{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;background:linear-gradient(165deg,#1a1028 0%,#2a1a3a 25%,#3a2a4a 55%,#4a2a5a 80%,#3a2a4a 100%);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:1;visibility:visible;transition:opacity .7s ease,visibility .7s ease;will-change:opacity;pointer-events:all}
.loading-overlay.hidden{opacity:0;visibility:hidden;pointer-events:none}
.loading-content{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:20px;text-align:center;transform:translateY(0) scale(1);opacity:1;transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .45s ease}
.loading-overlay.hidden .loading-content{transform:translateY(-8px) scale(.985);opacity:0}
.loading-title{font-family:"Noto Serif JP",serif;font-size:clamp(2.2rem,8vw,4.5rem);font-weight:700;color:rgba(255,255,255,.92);text-shadow:0 0 30px rgba(209,135,162,.3),0 0 60px rgba(209,135,162,.15),0 4px 20px rgba(0,0,0,.3);letter-spacing:2px;line-height:1.1;animation:loadingTitlePulse 2.8s ease-in-out infinite}
@keyframes loadingTitlePulse{0%,100%{text-shadow:0 0 30px rgba(209,135,162,.3),0 0 60px rgba(209,135,162,.15),0 4px 20px rgba(0,0,0,.3)}50%{text-shadow:0 0 40px rgba(209,135,162,.5),0 0 80px rgba(209,135,162,.25),0 4px 30px rgba(0,0,0,.4)}}
.loading-indicator{display:flex;gap:10px;align-items:center;justify-content:center}.loading-dot{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.7);box-shadow:0 0 12px rgba(209,135,162,.3);animation:loadingDotBounce 1.4s ease-in-out infinite}.loading-dot:nth-child(1){animation-delay:0s}.loading-dot:nth-child(2){animation-delay:.2s}.loading-dot:nth-child(3){animation-delay:.4s}
@keyframes loadingDotBounce{0%,60%,100%{transform:translateY(0) scale(.8);opacity:.5}30%{transform:translateY(-12px) scale(1.1);opacity:1}}
.loading-message{font-family:"Quicksand",sans-serif;font-size:clamp(.85rem,2vw,1.05rem);font-weight:400;color:rgba(255,255,255,.6);letter-spacing:.3px;margin-top:4px;animation:loadingMessagePulse 2.4s ease-in-out infinite}@keyframes loadingMessagePulse{0%,100%{opacity:.6}50%{opacity:.9}}
html.is-loading,body.is-loading{overflow:hidden!important}
@media (prefers-reduced-motion:reduce){.loading-title,.loading-dot,.loading-message{animation:none!important}.loading-overlay,.loading-content{transition:none!important}}
`;

function globalLoadingScreen() {
  return {
    name: "global-loading-screen",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const markup = `<div id="loadingScreen" class="loading-overlay" role="status" aria-label="Loading" aria-hidden="false"><div class="loading-content"><div class="loading-title">AdashimaVerse</div><div class="loading-indicator"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div><p class="loading-message" id="loadingMessage">Loading archive...</p></div></div>`;
        const script = `(function(){var s=document.getElementById("loadingScreen");if(!s)return;var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;try{var lang=localStorage.getItem("lang")||"es",msg={es:"Cargando archivo...",en:"Loading archive..."}[lang];if(msg){var el=document.getElementById("loadingMessage");if(el)el.textContent=msg}}catch(e){}var html=document.documentElement,body=document.body,start=performance.now(),hidden=false,navigating=false,maxWait=2200,quietWindow=reduced?0:160,lastMutation=performance.now(),observer;html.classList.add("is-loading");body.classList.add("is-loading");function show(){navigating=true;hidden=false;s.classList.remove("hidden");s.setAttribute("aria-hidden","false");html.classList.add("is-loading");body.classList.add("is-loading")}function hide(){if(hidden)return;hidden=true;if(observer)observer.disconnect();s.classList.add("hidden");s.setAttribute("aria-hidden","true");html.classList.remove("is-loading");body.classList.remove("is-loading");navigating=false}function waitFonts(){return document.fonts&&document.fonts.ready?document.fonts.ready.catch(function(){}):Promise.resolve()}function visibleImagesReady(){var imgs=Array.prototype.filter.call(document.images,function(img){var r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight*1.2&&r.bottom>-innerHeight*.2});return Promise.all(imgs.map(function(img){if(img.complete)return img.decode?img.decode().catch(function(){}):Promise.resolve();return new Promise(function(resolve){var done=function(){resolve()};img.addEventListener("load",done,{once:true});img.addEventListener("error",done,{once:true})})}))}function waitForStableDOM(){return new Promise(function(resolve){function check(){var now=performance.now();if(now-start>=maxWait){resolve();return}if(now-lastMutation>=quietWindow){requestAnimationFrame(function(){requestAnimationFrame(resolve)})}else requestAnimationFrame(check)}check()})}function ready(){Promise.all([waitFonts(),visibleImagesReady()]).then(waitForStableDOM).then(function(){var elapsed=performance.now()-start;setTimeout(function(){requestAnimationFrame(function(){requestAnimationFrame(hide)})},reduced?0:Math.max(0,260-elapsed))}).catch(hide)}if(window.MutationObserver){observer=new MutationObserver(function(){lastMutation=performance.now()});observer.observe(body,{subtree:true,childList:true,attributes:true})}document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.hasAttribute("download")||a.target&&a.target!=="_self")return;try{var u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname===location.pathname&&u.search===location.search)return}catch(err){return}e.preventDefault();show();var href=a.href;setTimeout(function(){location.href=href},reduced?0:180)},true);window.addEventListener("pageshow",function(e){navigating=false;if(e.persisted){hidden=false;hide()}});document.addEventListener("visibilitychange",function(){body.classList.toggle("decor-paused",document.hidden)});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});else ready();setTimeout(function(){if(!hidden)hide()},maxWait)})();`;
        const hasLoader = /id=["']loadingScreen["']/.test(html);
        const loadingMarkup = hasLoader ? "" : markup;
        return html
          .replace(
            /<head>/i,
            `<head><style data-global-loading-screen>${existingLoadingScreenCss}</style>`,
          )
          .replace(/<body([^>]*)>/i, `<body$1>${loadingMarkup}`)
          .replace(/<\/body>/i, `<script>${script}</script></body>`);
      },
    },
  };
}

async function minifyJsFile(source, destination) {
  const code = await readFile(source, "utf8");
  const result = await transform(code, {
    loader: "js",
    minify: true,
    target: "es2020",
    legalComments: "none",
    sourcefile: relative(root, source),
  });
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, result.code, "utf8");
}

async function copyMinifiedJs(from, to, dist) {
  const sourceRoot = resolve(root, from);
  const destinationRoot = resolve(dist, to);

  async function walk(sourceDir, destinationDir) {
    await mkdir(destinationDir, { recursive: true });
    for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
      const source = resolve(sourceDir, entry.name);
      const destination = resolve(destinationDir, entry.name);
      if (entry.isDirectory()) {
        await walk(source, destination);
      } else if (entry.isFile()) {
        if (extname(entry.name).toLowerCase() === ".js") {
          await minifyJsFile(source, destination);
        }
      }
    }
  }

  await walk(sourceRoot, destinationRoot);
}

// Vite does not minify standalone HTML files as aggressively as the JS/CSS
// pipeline. Minify the final emitted HTML after the build while protecting
// whitespace-sensitive/code blocks.
function minifyHtml(html) {
  const protectedBlocks = [];
  const protect = (match) => {
    const token = `___VITE_HTML_BLOCK_${protectedBlocks.length}___`;
    protectedBlocks.push(match);
    return token;
  };

  html = html.replace(/<(pre|textarea|script|style|template)\b[\s\S]*?<\/\1>/gi, protect);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/>\s+</g, "><");
  html = html.replace(/[\t\r\n ]+/g, " ");
  html = html.replace(/\s+([>])/g, "$1");
  html = html.replace(/([<])\s+/g, "$1");

  return html.replace(/___VITE_HTML_BLOCK_(\d+)___/g, (_, index) => protectedBlocks[Number(index)]);
}

async function minifyBuiltHtml(dist) {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".html") {
        const html = await readFile(file, "utf8");
        await writeFile(file, minifyHtml(html), "utf8");
      }
    }
  }
  await walk(dist);
}

async function optimizeBuiltAssets(dist) {
  const assetRoot = resolve(dist, "assets");
  const files = [];

  async function collect(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) files.push(file);
    }
  }

  await collect(assetRoot);

  const groups = new Map();
  for (const file of files) {
    const data = await readFile(file);
    const hash = createHash("sha256").update(data).digest("hex");
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(file);
  }

  const replacements = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Prefer the stable /assets/... path over a Vite-generated hashed copy.
    const preferred = group.slice().sort((a, b) => {
      const ar = relative(assetRoot, a);
      const br = relative(assetRoot, b);
      const aNested = ar.includes("/");
      const bNested = br.includes("/");
      if (aNested !== bNested) return aNested ? -1 : 1;
      return ar.length - br.length;
    })[0];

    for (const duplicate of group) {
      if (duplicate === preferred) continue;
      const relDuplicate = relative(dist, duplicate).replaceAll("\\", "/");
      const relPreferred = relative(dist, preferred).replaceAll("\\", "/");
      replacements.set(`/${relDuplicate}`, `/${relPreferred}`);
      replacements.set(relDuplicate, relPreferred);
      await unlink(duplicate);
    }
  }

  if (replacements.size === 0) return;

  async function rewrite(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await rewrite(file);
        continue;
      }
      if (!/\.(html?|css|js|mjs|json)$/i.test(entry.name)) continue;
      let text = await readFile(file, "utf8");
      const original = text;
      for (const [from, to] of replacements) text = text.split(from).join(to);
      if (text !== original) await writeFile(file, text, "utf8");
    }
  }

  await rewrite(dist);
  console.log(`Deduplicated ${replacements.size / 2} generated asset copies.`);
}

function productionLoadingOptimization() {
  return {
    name: "production-loading-optimization",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // The print/onload stylesheet trick causes a second style recalculation.
        // Production builds already have the loader/transition layer, so use
        // normal stylesheet loading instead.
        html = html
          .replace(/\s+media=(['"])print\1/gi, "")
          .replace(/\s+onload=(['"])this\.media\s*=\s*(['"])all\2\1/gi, "");

        // Preserve execution order while preventing classic scripts from
        // blocking HTML parsing. Module scripts are already deferred.
        html = html.replace(
          /<script(?![^>]*\btype=(['"])module\1)(?![^>]*\bdefer\b)(?![^>]*\basync\b)([^>]*\bsrc=(['"])[^'"]+\4[^>]*)>/gi,
          (tag, _q1, attrs) => {
            return `<script defer${attrs}>`;
          },
        );

        return html;
      },
    },
  };
}

const optimizedStaticAssets = new Set([
  "Carta shimamura.png",
  "Carta adachi.png",
  "astronauta.png",
  "FondoCD.png",
  "D_1.png",
  "D_2.png",
  "D_3.png",
  "Adachi_perfil.png",
  "Fondo_Estrellado.gif",
]);

async function copyAssetsWithoutLegacyImages(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name);
    const to = resolve(destination, entry.name);
    if (entry.isDirectory()) {
      await copyAssetsWithoutLegacyImages(from, to);
      continue;
    }
    if (optimizedStaticAssets.has(entry.name) && source.endsWith("Imagenes")) continue;
    await cp(from, to, { force: true });
  }
}

async function optimizeBuiltCss(dist) {
  const cssFiles = [];

  async function collect(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".css") cssFiles.push(file);
    }
  }

  await collect(dist);

  for (const file of cssFiles) {
    const source = await readFile(file, "utf8");
    // Keep the glass effect, but cap only the very largest blur radii in
    // production. This reduces expensive backdrop compositing without
    // removing the site's glassmorphism.
    const optimized = source.replace(
      /(backdrop-filter\s*:\s*(?:[^;]*?blur\()|(-webkit-backdrop-filter\s*:\s*(?:[^;]*?blur\()))([0-9.]+)(px)/gi,
      (match, prefix, _unused, value, unit) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 16) return match;
        return `${prefix}16${unit}`;
      },
    );

    const result = await transform(optimized, {
      loader: "css",
      minify: true,
      target: "es2020",
      legalComments: "none",
      sourcefile: relative(root, file),
    });
    await writeFile(file, result.code, "utf8");
  }
}

function copyRuntimeFiles() {
  return {
    name: "copy-runtime-files",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      const dist = resolve(root, "dist");

      // Copy static/runtime files, excluding legacy large images that now have
      // optimized WebP replacements.
      for (const [from, to] of runtimeCopies) {
        const source = resolve(root, from);
        const destination = resolve(dist, to);
        try {
          if (from === "assets") {
            await copyAssetsWithoutLegacyImages(source, destination);
          } else {
            await cp(source, destination, { recursive: true, force: true });
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      // Copy classic scripts, but minified.
      for (const [from, to] of runtimeJs) {
        const source = resolve(root, from);
        const destination = resolve(dist, to);
        try {
          if (extname(source).toLowerCase() === ".js") {
            await minifyJsFile(source, destination);
          } else {
            await copyMinifiedJs(from, to, dist);
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      // Minify every final HTML entry after Vite has rewritten its asset URLs.
      await minifyBuiltHtml(dist);

      // Minify standalone runtime CSS and cap only the most expensive blur radii.
      await optimizeBuiltCss(dist);

      // Vite can emit hashed copies for assets referenced from HTML/CSS while
      // the static asset tree is copied as well. Remove only byte-identical
      // duplicates and rewrite their references to the stable static asset.
      await optimizeBuiltAssets(dist);
    },
  };
}

function cleanRoutes() {
  const legacyRoutes = {
    "/src/pages/Adashima_PWA": "/Adashima_PWA",
    "/src/pages/Adashima_PWA.html": "/Adashima_PWA",
  };

  function redirectLegacyRoute(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const target = legacyRoutes[pathname];
    if (!target) return false;

    res.statusCode = 301;
    res.setHeader("Location", target);
    res.end();
    return true;
  }

  return {
    name: "clean-routes",

    // Clean URLs are needed during normal development too. Cloudflare's
    // _redirects file only exists at deployment time, so Vite must handle
    // the route itself when running `npm run dev`.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        if (redirectLegacyRoute(req, res)) return;

        const pathname = new URL(req.url, "http://localhost").pathname.replace(/\/$/, "") || "/";
        const source = previewRoutes[pathname];
        if (!source) return next();

        try {
          const html = await readFile(resolve(root, source), "utf8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          if (error.code === "ENOENT") return next();
          next(error);
        }
      });
    },

    // Vite Preview serves the built files, so use the corresponding dist
    // path for the same clean URLs.
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        if (redirectLegacyRoute(req, res)) return;

        const pathname = new URL(req.url, "http://localhost").pathname.replace(/\/$/, "") || "/";
        const source = previewRoutes[pathname];
        if (!source) return next();

        try {
          const html = await readFile(resolve(root, "dist", source), "utf8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          if (error.code === "ENOENT") return next();
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  root,
  base: "/",
  publicDir: false,

  plugins: [
    tailwindcss(),
    themeBootstrap(),
    globalLoadingScreen(),
    productionLoadingOptimization(),
    copyRuntimeFiles(),
    cleanRoutes(),
  ],

  server: {
    host: true,
  },

  preview: {
    host: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "oxc",
    cssMinify: "esbuild",

    rollupOptions: {
      input: {
        main: page("index.html"),
        offline: page("offline.html"),
        about: page("src/pages/Adashima_About.html"),
        settings: page("src/pages/Adashima_Settings.html"),
        help: page("src/pages/Adashima_Help.html"),
        anime: page("src/pages/Adashima_Anime.html"),
        drama: page("src/pages/Adashima_Drama.html"),
        estrella: page("src/pages/Adashima_Estrella.html"),
        extraStories: page("src/pages/Adashima_Extra_Stories.html"),
        gallery: page("src/pages/Adashima_Gallery.html"),
        linea: page("src/pages/Adashima_Linea.html"),
        manga: page("src/pages/Adashima_Manga.html"),
        music: page("src/pages/Adashima_Music.html"),
        novelas: page("src/pages/Adashima_Novelas.html"),
        otros: page("src/pages/Adashima_Otros.html"),
        stats: page("src/pages/Adashima_Stats.html"),
        juego: page("src/pages/Juego.html"),
        "otros/Author_Archive": page("src/pages/otros/Author_Archive.html"),
        "otros/Web_Stories": page("src/pages/otros/Web_Stories.html"),
        pwa: page("src/pages/Adashima_PWA.html"),
        privacy: page("src/pages/Privacy.html"),
        terms: page("src/pages/Terms.html"),
      },
    },
  },
});
