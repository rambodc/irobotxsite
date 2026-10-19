import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/portal.test.tsx", "tests/trading-app.test.tsx", "tests/qbchem.test.tsx"],
    restoreMocks: true,
  },
});
