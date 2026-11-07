import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Processos isolados evitam que os ensaios PostgreSQL síncronos bloqueiem o RPC do worker de threads.
    pool: "forks",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@edge-shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
});
