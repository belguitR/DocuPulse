import { Meilisearch } from "meilisearch";
import { config } from "./config";

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
        searchableAttributes: ["title", "fileName", "content", "tags", "source", "documentType"],
        displayedAttributes: ["id", "title", "fileName", "content", "tags", "uploadedAt", "documentType", "source"],
        filterableAttributes: ["documentType", "source", "tags", "uploadedAt"],
        sortableAttributes: ["uploadedAt", "title"],
      });

      await meiliClient.tasks.waitForTask(settingsTask.taskUid);
    } catch (error) {
      indexReadyPromise = null;
      throw error;
    }
  })();

  return indexReadyPromise;
}
