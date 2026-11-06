import { readdir } from "node:fs/promises";
import path from "path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";

import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";

function registerAudioManifest(
  server: ViteDevServer,
  route: string,
  directoryName: string,
  gameTitle: string,
  extension: string,
) {
  server.middlewares.use(route, async (_request, response, next) => {
    try {
      const audioDirectory = path.resolve(
        process.cwd(),
        "public",
        directoryName,
      );
      const files = await readdir(audioDirectory);
      const audioFiles = files
        .filter((file) =>
          file.toLowerCase().endsWith(`.${extension.toLowerCase()}`),
        )
        .sort((left, right) => left.localeCompare(right, "pt-BR"));

      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(audioFiles));
    } catch (error) {
      next(
        error instanceof Error
          ? error
          : new Error(`Falha ao listar os áudios de ${gameTitle}.`),
      );
    }
  });
}

function audioManifestPlugin(): Plugin {
  return {
    name: "game-audio-manifests",
    configureServer(server) {
      registerAudioManifest(
        server,
        "/__dev/relogio-musical-audios",
        "relogio-musical",
        "Relógio musical",
        "mp3",
      );
      registerAudioManifest(
        server,
        "/__dev/jogo-dos-versos-audios",
        "jogo-dos-versos",
        "Jogo dos versos",
        "mp3",
      );
      registerAudioManifest(
        server,
        "/__dev/tunel-do-tempo-audios",
        "tunel-do-tempo",
        "Túnel do tempo",
        "mp3",
      );
      registerAudioManifest(
        server,
        "/__dev/vitrola-musical-audios",
        "vitrola-musical",
        "Vitrola musical",
        "mp3",
      );
      registerAudioManifest(
        server,
        "/__dev/segredo-musical-videos",
        "segredo-musical",
        "Segredo musical",
        "mp4",
      );
      registerAudioManifest(
        server,
        "/__dev/vitrine-musical-videos",
        "vitrine-musical",
        "Vitrine musical",
        "mp4",
      );
    },
  };
}

export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwind(), autoprefixer()],
    },
  },
  plugins: [vue(), audioManifestPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
