import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3001),
  meilisearchHost: process.env.MEILISEARCH_HOST ?? "http://127.0.0.1:7700",
  meilisearchApiKey: process.env.MEILISEARCH_API_KEY ?? "masterKey",
  meilisearchIndex: process.env.MEILISEARCH_INDEX ?? "documents",
} as const;
