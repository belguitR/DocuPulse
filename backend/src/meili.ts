import { Meilisearch } from "meilisearch";
import { config } from "./config";
import type { IndexedDocument } from "./types";
import { buildSearchText } from "./utils";

export const meiliClient = new Meilisearch({
  host: config.meilisearchHost,
  apiKey: config.meilisearchApiKey,
});

let indexReadyPromise: Promise<void> | null = null;

export async function ensureIndexReady(): Promise<void> {
  if (indexReadyPromise) {
    return indexReadyPromise;
  }

  indexReadyPromise = (async () => {
    try {
      const task = await meiliClient.createIndex(config.meilisearchIndex, { primaryKey: "id" }).catch(() => null);

      if (task?.taskUid) {
        await meiliClient.tasks.waitForTask(task.taskUid);
      }

      const index = meiliClient.index(config.meilisearchIndex);
      const settingsTask = await index.updateSettings({
        searchableAttributes: [
          "title",
          "fileName",
          "content",
          "contentSearch",
          "applicationNames",
          "documentCategory",
          "programmingLanguages",
          "tags",
          "source",
          "documentType",
        ],
        displayedAttributes: [
          "id",
          "title",
          "fileName",
          "content",
          "applicationNames",
          "documentCategory",
          "programmingLanguages",
          "storedFileName",
          "mimeType",
          "originalFileUrl",
          "previewFileUrl",
          "tags",
          "uploadedAt",
          "documentType",
          "source",
        ],
        filterableAttributes: ["documentType", "source", "tags", "uploadedAt", "applicationNames", "documentCategory", "programmingLanguages"],
        sortableAttributes: ["uploadedAt", "title"],
      });

      await meiliClient.tasks.waitForTask(settingsTask.taskUid);
      await backfillSearchText();
    } catch (error) {
      indexReadyPromise = null;
      throw error;
    }
  })();

  return indexReadyPromise;
}

async function backfillSearchText(): Promise<void> {
  const index = meiliClient.index<IndexedDocument>(config.meilisearchIndex);
  const updateIndex = meiliClient.index<Record<string, unknown>>(config.meilisearchIndex);
  const response = await index.getDocuments({
    limit: 1000,
    fields: ["id", "content", "contentSearch"],
  });
  const missingSearchText = response.results.filter((document) => !document.contentSearch && document.content);

  if (missingSearchText.length === 0) {
    return;
  }

  const task = await updateIndex.updateDocuments(
    missingSearchText.map((document) => ({
      id: document.id,
      contentSearch: buildSearchText(document.content),
    })),
  );

  await meiliClient.tasks.waitForTask(task.taskUid);
}
