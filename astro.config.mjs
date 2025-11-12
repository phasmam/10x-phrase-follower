// astro.config.ts
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";
import cloudflare from "@astrojs/cloudflare";

const onPages = !!process.env.CF_PAGES; // true on Cloudflare Pages

export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  server: { port: 3000 },
  vite: { plugins: [tailwindcss()] },
  adapter: onPages ? cloudflare() : node({ mode: "standalone" }),
});
