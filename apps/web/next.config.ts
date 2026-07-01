import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Env lives at the repo root (one .env for web app, Prisma CLI, and seed).
config({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@veritariff/db", "@veritariff/shared"],
};

export default nextConfig;
