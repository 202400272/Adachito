import { defineConfig } from "vite";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";

const root = resolve(__dirname);
const page = (p) => resolve(root, p);

export default defineConfig({
  plugins: [tailwindcss()],

  build: {
    cssMinify: "esbuild",
    rollupOptions: {
      input: {
        main: page("index.html"),
        offline: page("offline.html"),
        about: page("src/pages/Adashima_About.html"),
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
        authorArchive: page("src/pages/otros/Author_Archive.html"),
      },
    },
  },
});
