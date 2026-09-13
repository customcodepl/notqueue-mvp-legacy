/// <reference types="vitest/config" />
import react from "@astrojs/react";
import { getViteConfig } from "astro/config";

export default getViteConfig(
  {
    test: {
      include: ["src/**/*.test.ts"],
      environment: "node",
      environmentMatchGlobs: [
        ["src/components/**/*.test.ts", "jsdom"],
        ["src/pages/api/**/*.test.ts", "node"],
      ],
    },
  },
  {
    // Skip astro.config.mjs so `@astrojs/cloudflare` is not loaded. Vitest 4
    // injects Node builtins into `resolve.external`, which the Cloudflare Vite
    // plugin rejects (astro#15878). Tests run in Node, matching the plan.
    configFile: false,
    srcDir: "./src",
    integrations: [react()],
  },
);
