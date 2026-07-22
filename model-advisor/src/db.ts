/**
 * D1 access — the single `analyses` table.
 * Serves as system-of-record + exact-match cache + history/leaderboard source.
 */

export interface StoredAnalysis {
  id: string;
  promptHash: string;
  prompt: string;
  taskType: string;
  response: unknown; // the full /api/analyze response object
}

/** Normalize + SHA-256 hash a prompt for cache lookup. */
export async function hashPrompt(prompt: string): Promise<string> {
  const norm = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Return a cached response object for this prompt hash, or null. */
export async function getCached(db: D1Database, promptHash: string): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT result_json FROM analyses WHERE prompt_hash = ? ORDER BY created_at DESC LIMIT 1")
    .bind(promptHash)
    .first<{ result_json: string }>();
  return row ? JSON.parse(row.result_json) : null;
}

/** Persist one analysis. */
export async function saveAnalysis(db: D1Database, a: StoredAnalysis): Promise<void> {
  await db
    .prepare(
      "INSERT INTO analyses (id, prompt_hash, prompt, task_type, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(a.id, a.promptHash, a.prompt, a.taskType, JSON.stringify(a.response), Date.now())
    .run();
}

export interface HistoryItem {
  id: string;
  prompt: string;
  taskType: string | null;
  topModel: string | null;
  createdAt: number;
}

/** Recent analyses for the history view. */
export async function getHistory(db: D1Database, limit: number): Promise<HistoryItem[]> {
  const { results } = await db
    .prepare("SELECT id, prompt, task_type, result_json, created_at FROM analyses ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<{ id: string; prompt: string; task_type: string | null; result_json: string; created_at: number }>();

  return results.map((r) => {
    let topModel: string | null = null;
    try {
      const parsed = JSON.parse(r.result_json) as { results?: Array<{ name?: string }> };
      topModel = parsed.results?.[0]?.name ?? null;
    } catch {
      // ignore malformed rows
    }
    return { id: r.id, prompt: r.prompt, taskType: r.task_type, topModel, createdAt: r.created_at };
  });
}
