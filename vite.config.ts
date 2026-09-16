import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({ root, plugins: [react()], test: { environment: "node", include: ["test/**/*.test.ts"] } });
