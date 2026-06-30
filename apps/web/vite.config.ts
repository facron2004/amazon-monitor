import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET?.trim() || "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes("node_modules/echarts") ? "echarts" : undefined;
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5188,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
