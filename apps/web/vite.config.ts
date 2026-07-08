import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolveApiProxyTarget } from "./src/utils/viteProxyTarget";

const repoEnvDir = fileURLToPath(new URL("../..", import.meta.url));

function createApiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: false,
    ws: true,
    configure(proxy) {
      proxy.on("error", (error) => {
        console.warn(`[vite proxy] /api -> ${target} failed: ${error.message}`);
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoEnvDir, ["VITE_"]);
  const apiProxyTarget = resolveApiProxyTarget(env);

  return {
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
        "/api": createApiProxy(apiProxyTarget)
      }
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
      proxy: {
        "/api": createApiProxy(apiProxyTarget)
      }
    }
  };
});
