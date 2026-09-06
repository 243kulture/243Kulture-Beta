import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Config Vite + PWA — voir README.md pour le déploiement (Vercel/Netlify)
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "243Kulture",
        short_name: "243Kulture",
        description: "Rumba, histoire et culture congolaise — pour la diaspora.",
        theme_color: "#08090D",
        background_color: "#08090D",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
