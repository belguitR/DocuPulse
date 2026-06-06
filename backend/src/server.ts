import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { watchFile } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express from "express";
import mammoth from "mammoth";
import multer from "multer";
import pdf from "pdf-parse";
import { z } from "zod";
import { config } from "./config";
import { ensureIndexReady, meiliClient } from "./meili";
import type { IndexedDocument, SearchResult } from "./types";
import { buildSearchText, buildSnippet, normalizeText, parseTags } from "./utils";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const uploadsDir = path.resolve(__dirname, "..", "uploads");
const reindexTimers = new Map<string, NodeJS.Timeout>();
const watchedDocuments = new Set<string>();
const searchSchema = z.object({
  q: z.string().trim().min(1),
});

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await ensureIndexReady();
    await mkdir(uploadsDir, { recursive: true });
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
    res.status(400).json({ error: "At least one PDF or DOCX file is required." });
    return;
  }

  try {
    await ensureIndexReady();
    await mkdir(uploadsDir, { recursive: true });

    const tags = parseTags(typeof req.body.tags === "string" ? req.body.tags : undefined);
    const source = typeof req.body.source === "string" && req.body.source.trim() ? req.body.source.trim() : "manual-upload";
    const documents: IndexedDocument[] = [];
    const unsupportedFiles: string[] = [];

    for (const file of files) {
      const fileName = normalizeFileName(file.originalname);
      const documentType = documentTypeFromFile(fileName, file.mimetype);

      if (!documentType) {
        unsupportedFiles.push(fileName);
        continue;
      }

      const content = await extractDocumentText(file.buffer, documentType);

      if (!content) {
        continue;
      }

      const id = randomUUID();
      const storedFileName = `${id}${path.extname(fileName).toLowerCase()}`;
      await writeFile(path.join(uploadsDir, storedFileName), file.buffer);

      documents.push({
        id,
        title: path.parse(fileName).name,
        fileName,
        content,
        contentSearch: buildSearchText(content),
        storedFileName,
        mimeType: mimeTypeForDocument(documentType),
        originalFileUrl: `/api/files/${id}/original`,
        previewFileUrl: `/api/files/${id}/preview`,
        tags,
        uploadedAt: new Date().toISOString(),
        documentType,
        source,
      });
    }

    if (unsupportedFiles.length > 0 && documents.length === 0) {
      res.status(415).json({ error: `Unsupported file type. Use PDF or DOCX only: ${unsupportedFiles.join(", ")}` });
      return;
    }

    if (documents.length === 0) {
      res.status(422).json({ error: "No extractable text was found in the uploaded PDF/DOCX files." });
      return;
    }

    const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
    const task = await index.addDocuments(documents);
    await meiliClient.tasks.waitForTask(task.taskUid);
    documents.forEach((document) => ensureStoredDocumentWatcher(document));

    res.status(201).json({
      indexedCount: documents.length,
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        contentLength: document.content.length,
        originalFileUrl: document.originalFileUrl,
        previewFileUrl: document.previewFileUrl,
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
      fields: [
        "id",
        "title",
        "fileName",
        "content",
        "storedFileName",
        "mimeType",
        "originalFileUrl",
        "previewFileUrl",
        "tags",
        "uploadedAt",
        "documentType",
        "source",
      ],
    });

    res.json({
      documents: response.results
        .filter((document) => document.id && document.title && document.fileName)
        .map((document) => ({
          id: document.id,
          title: normalizeFileName(document.title),
          fileName: normalizeFileName(document.fileName),
          contentLength: document.content?.length ?? 0,
          originalFileUrl: document.originalFileUrl,
          previewFileUrl: document.previewFileUrl,
          mimeType: document.mimeType,
          tags: document.tags ?? [],
          uploadedAt: document.uploadedAt,
          documentType: document.documentType ?? "pdf",
          source: document.source ?? "manual-upload",
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

    const hits = response.hits
      .filter((hit) => hit.id && hit.title && hit.fileName && hit.content)
      .map((hit) => {
        const formatted = hit as IndexedDocument & { _formatted?: { content?: string } };
        const snippet = formatted._formatted?.content ?? buildSnippet(hit.content, parsedQuery.data.q);

        const result: SearchResult = {
          id: hit.id,
          title: normalizeFileName(hit.title),
          fileName: normalizeFileName(hit.fileName),
          content: hit.content,
          storedFileName: hit.storedFileName,
          mimeType: hit.mimeType,
          originalFileUrl: hit.originalFileUrl,
          previewFileUrl: hit.previewFileUrl,
          tags: hit.tags ?? [],
          uploadedAt: hit.uploadedAt,
          documentType: hit.documentType ?? "pdf",
          source: hit.source ?? "manual-upload",
          snippet,
        };

        return result;
      });

    res.json({
      query: parsedQuery.data.q,
      estimatedTotalHits: hits.length,
      hits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";

    res.status(500).json({ error: message });
  }
});

app.get("/api/files/:id/original", async (req, res) => {
  try {
    await ensureIndexReady();
    const document = await findDocumentForFile(req.params.id);

    if (!document?.storedFileName) {
      res.status(404).send("Original file is not available for this document.");
      return;
    }

    const filePath = path.join(uploadsDir, document.storedFileName);
    res.setHeader("Content-Type", document.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeHeaderFileName(document.fileName)}"`);
    res.sendFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file error";
    res.status(500).send(message);
  }
});

app.get("/api/files/:id/preview", async (req, res) => {
  try {
    await ensureIndexReady();
    const document = await findDocumentForFile(req.params.id);

    if (!document?.storedFileName) {
      res.status(404).send("Original file is not available for this document.");
      return;
    }

    const filePath = path.join(uploadsDir, document.storedFileName);

    if (document.documentType === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeHeaderFileName(document.fileName)}"`);
      res.sendFile(filePath);
      return;
    }

    if (document.documentType === "docx") {
      const converted = await mammoth.convertToHtml({ path: filePath });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderDocxPreviewHtml(document.title, converted.value));
      return;
    }

    res.status(415).send("Preview is not supported for this document type.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview error";
    res.status(500).send(message);
  }
});

app.post("/api/files/:id/open", async (req, res) => {
  try {
    await ensureIndexReady();
    const document = await findDocumentForFile(req.params.id);

    if (!document?.storedFileName) {
      res.status(404).json({ error: "Original file is not available for this document." });
      return;
    }

    const filePath = path.join(uploadsDir, document.storedFileName);
    ensureStoredDocumentWatcher(document);
    await openInDesktopApp(filePath);

    res.json({
      opened: true,
      autoReindex: true,
      fileName: document.fileName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown open error";
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

function documentTypeFromFile(fileName: string, mimeType: string): "pdf" | "docx" | null {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  if (
    extension === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }

  return null;
}

function mimeTypeForDocument(documentType: "pdf" | "docx"): string {
  if (documentType === "pdf") {
    return "application/pdf";
  }

  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

async function extractDocumentText(buffer: Buffer, documentType: "pdf" | "docx"): Promise<string> {
  if (documentType === "pdf") {
    const parsed = await pdf(buffer);
    return normalizeText(parsed.text ?? "");
  }

  const parsed = await mammoth.extractRawText({ buffer });
  return normalizeText(parsed.value ?? "");
}

async function findDocumentForFile(id: string): Promise<IndexedDocument | null> {
  try {
    const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);

    const document = await index.getDocument(id, {
      fields: [
        "id",
        "title",
        "fileName",
        "content",
        "storedFileName",
        "mimeType",
        "uploadedAt",
        "documentType",
        "source",
        "tags",
      ],
    });

    return document as IndexedDocument;
  } catch {
    return null;
  }
}

function encodeHeaderFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}

function renderDocxPreviewHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color: #211b16;
        background: #f8f6f1;
        font-family: Arial, Helvetica, sans-serif;
      }

      body {
        margin: 0;
        padding: 32px;
      }

      main {
        max-width: 820px;
        min-height: calc(100vh - 96px);
        margin: 0 auto;
        padding: 56px 64px;
        border: 1px solid #e4dbd0;
        border-radius: 4px;
        background: #fffdf9;
        box-shadow: 0 10px 30px rgba(33, 27, 22, 0.08);
        line-height: 1.7;
        font-size: 16px;
      }

      h1, h2, h3, p, ul, ol, table {
        margin-top: 0;
      }

      img {
        max-width: 100%;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      td, th {
        border: 1px solid #ddd3c8;
        padding: 8px;
      }
    </style>
  </head>
  <body>
    <main>${body || "<p>No previewable DOCX content was found.</p>"}</main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureStoredDocumentWatcher(document: IndexedDocument): void {
  if (!document.storedFileName || watchedDocuments.has(document.id)) {
    return;
  }

  const filePath = path.join(uploadsDir, document.storedFileName);
  watchedDocuments.add(document.id);

  watchFile(filePath, { interval: 1200, persistent: false }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs || current.size === 0) {
      return;
    }

    scheduleStoredDocumentReindex(document.id);
  });
}

function scheduleStoredDocumentReindex(documentId: string): void {
  const existingTimer = reindexTimers.get(documentId);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const nextTimer = setTimeout(() => {
    reindexTimers.delete(documentId);
    void reindexStoredDocument(documentId).catch((error) => {
      console.error(`Auto reindex failed for ${documentId}:`, error);
    });
  }, 1500);

  reindexTimers.set(documentId, nextTimer);
}

async function reindexStoredDocument(documentId: string): Promise<void> {
  const document = await findDocumentForFile(documentId);

  if (!document?.storedFileName || !document.documentType) {
    return;
  }

  const filePath = path.join(uploadsDir, document.storedFileName);
  const buffer = await readFile(filePath);
  const content = await extractDocumentText(buffer, document.documentType as "pdf" | "docx");

  if (!content) {
    return;
  }

  const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
  const task = await index.updateDocuments([
    {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      content,
      contentSearch: buildSearchText(content),
      storedFileName: document.storedFileName,
      mimeType: document.mimeType,
      originalFileUrl: `/api/files/${document.id}/original`,
      previewFileUrl: `/api/files/${document.id}/preview`,
      tags: document.tags ?? [],
      uploadedAt: document.uploadedAt,
      documentType: document.documentType,
      source: document.source,
    },
  ]);

  await meiliClient.tasks.waitForTask(task.taskUid);
}

function openInDesktopApp(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", "Start-Process -FilePath $env:TARGET_FILE -ErrorAction Stop"],
      {
        windowsHide: true,
        env: {
          ...process.env,
          TARGET_FILE: filePath,
        },
      },
    );
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error((stderr || stdout || `Desktop open command exited with code ${code}.`).trim()));
    });
  });
}
