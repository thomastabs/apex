import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Automatic JSX runtime (matches Next.js) so component files that render JSX
  // without importing React work in component tests.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
