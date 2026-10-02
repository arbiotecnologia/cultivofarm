import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const BUILD_ID_ENV_KEYS = [
  "LOVABLE_DEPLOY_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "SOURCE_VERSION",
  "COMMIT_SHA",
] as const;

function resolveBuildId(): string {
  const deployId = BUILD_ID_ENV_KEYS
    .map((key) => process.env[key]?.trim())
    .find((value) => value && /^[A-Za-z0-9._-]{7,128}$/.test(value));
  return deployId ?? `build-${Date.now().toString(36)}`;
}

const productionBuildId = resolveBuildId();

function buildIdMetaPlugin(mode: string): Plugin {
  return {
    name: "cultivo-build-id",
    transformIndexHtml() {
      if (mode !== "production") return [];
      return [{
        tag: "meta",
        attrs: { name: "cultivo-build-id", content: productionBuildId },
        injectTo: "head",
      }];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    buildIdMetaPlugin(mode),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
