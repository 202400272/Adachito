import { defineConfig } from "vite";
import { resolve, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { transform } from "esbuild";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const page = (p) => resolve(root, p);

const runtimeCopies = [
  ["assets", "assets"],
  ["src/data", "src/data"],
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

function copyRuntimeFiles() {
  return {
    name: "copy-runtime-files",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      const dist = resolve(root, "dist");

      // Copy genuinely static/runtime files unchanged.
      for (const [from, to] of runtimeCopies) {
        const source = resolve(root, from);
        const destination = resolve(dist, to);
        try {
          await cp(source, destination, { recursive: true, force: true });
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
    },
  };
}

function previewCleanRoutes() {
  return {
    name: "preview-clean-routes",
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

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

  plugins: [tailwindcss(), themeBootstrap(), copyRuntimeFiles(), previewCleanRoutes()],

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
      },
    },
  },
});
