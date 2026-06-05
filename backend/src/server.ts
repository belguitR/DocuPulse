import { randomUUID } from "node:crypto";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import pdf from "pdf-parse";
import { z } from "zod";
import { config } from "./config";
import { ensureIndexReady, meiliClient } from "./meili";
import type { IndexedDocument, SearchResult } from "./types";
import { buildSnippet, normalizeText, parseTags } from "./utils";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const searchSchema = z.object({
  q: z.string().trim().min(1),
});

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await ensureIndexReady();
    const health = await meiliClient.health();

    res.json({
      api: "ok",
      search: health.status,
      index: config.meilisearchIndex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown health error";

    res.status(503).json({
      api: "degraded",
      search: "unavailable",
      error: message,
    });
  }
});

app.post("/api/documents/index", upload.array("files"), async (req, res) => {
  const files = req.files;

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "At least one PDF file is required." });
    return;
  }

  try {
    await ensureIndexReady();

    const tags = parseTags(typeof req.body.tags === "string" ? req.body.tags : undefined);
    const source = typeof req.body.source === "string" && req.body.source.trim() ? req.body.source.trim() : "manual-upload";
    const documentType =
      typeof req.body.documentType === "string" && req.body.documentType.trim() ? req.body.documentType.trim() : "pdf";

    const documents: IndexedDocument[] = [];

    for (const file of files) {
      const fileName = normalizeFileName(file.originalname);
      const parsed = await pdf(file.buffer);
      const content = normalizeText(parsed.text ?? "");

      if (!content) {
        continue;
      }

      documents.push({
        id: randomUUID(),
        title: path.parse(fileName).name,
        fileName,
        content,
        tags,
        uploadedAt: new Date().toISOString(),
        documentType,
        source,
      });
    }

    if (documents.length === 0) {
      res.status(422).json({ error: "No extractable text was found in the uploaded PDFs." });
      return;
    }

    const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
    const task = await index.addDocuments(documents);
    await meiliClient.tasks.waitForTask(task.taskUid);

    res.status(201).json({
      indexedCount: documents.length,
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        contentLength: document.content.length,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown indexing error";

    res.status(500).json({ error: message });
  }
});

app.get("/api/documents", async (_req, res) => {
  try {
    await ensureIndexReady();

    const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
    const response = await index.getDocuments({
      limit: 50,
      fields: ["id", "title", "fileName", "content", "tags", "uploadedAt", "documentType", "source"],
    });

    res.json({
      documents: response.results.map((document) => ({
        id: document.id,
        title: normalizeFileName(document.title),
        fileName: normalizeFileName(document.fileName),
        contentLength: document.content.length,
        tags: document.tags,
        uploadedAt: document.uploadedAt,
        documentType: document.documentType,
        source: document.source,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown document listing error";

    res.status(500).json({ error: message });
  }
});

app.get("/api/search", async (req, res) => {
  const parsedQuery = searchSchema.safeParse({ q: req.query.q });

  if (!parsedQuery.success) {
    res.status(400).json({ error: "Query parameter `q` is required." });
    return;
  }

  try {
    await ensureIndexReady();

    const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
    const response = await index.search(parsedQuery.data.q, {
      limit: 12,
      attributesToCrop: ["content"],
      cropLength: 36,
      showMatchesPosition: false,
    });

    const hits = response.hits.map((hit) => {
      const formatted = hit as IndexedDocument & { _formatted?: { content?: string } };
      const snippet = formatted._formatted?.content ?? buildSnippet(hit.content, parsedQuery.data.q);

      const result: SearchResult = {
        ...hit,
        title: normalizeFileName(hit.title),
        fileName: normalizeFileName(hit.fileName),
        snippet,
      };

      return result;
    });

    res.json({
      query: parsedQuery.data.q,
      estimatedTotalHits: response.estimatedTotalHits ?? hits.length,
      hits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";

    res.status(500).json({ error: message });
  }
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://127.0.0.1:${config.port}`);
});

function normalizeFileName(value: string): string {
  if (!/[ÃÂ]/.test(value)) {
    return value;
  }

  return Buffer.from(value, "latin1").toString("utf8");
}
