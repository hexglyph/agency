import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InsightSuggestion } from "../services/azure-openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const STORE_PATH = path.resolve(REPO_ROOT, "insights_store.json");

export type StoredInsightRecord = InsightSuggestion & {
  generatedAt: string;
  usingAzure: boolean;
  model?: string;
  latencyMs?: number;
  rawAzureResponse?: unknown;
};

async function ensureStoreFile() {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, "[]", "utf-8");
  }
}

export async function loadStoredInsights(): Promise<StoredInsightRecord[]> {
  await ensureStoreFile();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as StoredInsightRecord[];
    }
    return [];
  } catch (error) {
    console.error("[api] Falha ao ler insights_store.json:", error);
    return [];
  }
}

export async function upsertStoredInsights(records: StoredInsightRecord[]) {
  if (!records.length) {
    return;
  }
  const existing = await loadStoredInsights();
  const map = new Map<string, StoredInsightRecord>();
  existing.forEach((record) => {
    map.set(record.resourceId, record);
  });
  records.forEach((record) => {
    map.set(record.resourceId, record);
  });
  await fs.writeFile(STORE_PATH, JSON.stringify(Array.from(map.values()), null, 2), "utf-8");
}
