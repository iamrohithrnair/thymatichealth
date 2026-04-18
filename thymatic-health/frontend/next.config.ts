import fs from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// Keep local frontend env files first-class, but also support the repo-root .env
// used by the backend and documented at the workspace root.
const rootEnvFallbacks = ['SPEECHMATICS_API_KEY', 'NEXT_PUBLIC_BACKEND_URL'] as const

if (rootEnvFallbacks.some((key) => !process.env[key])) {
  const rootEnvPath = path.join(process.cwd(), "..", ".env");

  if (fs.existsSync(rootEnvPath)) {
    const envFile = fs.readFileSync(rootEnvPath, "utf8");

    for (const line of envFile.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      for (const key of rootEnvFallbacks) {
        if (process.env[key]) continue;

        const match = trimmed.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
        if (!match) continue;

        const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
        if (value) process.env[key] = value;
      }
    }
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
