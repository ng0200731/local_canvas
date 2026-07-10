import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
      "server-only": `${import.meta.dirname}/lib/test/server-only.ts`,
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "out"],
  },
});
