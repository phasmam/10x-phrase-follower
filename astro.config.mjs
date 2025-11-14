// astro.config.ts
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";
import cloudflare from "@astrojs/cloudflare";

const onPages = !!process.env.CF_PAGES || !!process.env.ASTRO_ADAPTER;

export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  server: { port: 3000 },
  vite: {
    plugins: [tailwindcss()],
  },
  // Ensure Rollup treats the optional runtime helper as external during build
  build: {
    rollupOptions: {
      external: ["astro/runtime/server"],
    },
  },
  adapter: onPages ? cloudflare() : node({ mode: "standalone" }),
});
