import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Riceve i risultati del banco di prova e li accoda a un file.
 *
 * Esiste solo per non dover trascrivere a mano i numeri dal browser: le
 * misure vanno prese in una finestra vera, non in un pannello incorporato, e
 * qualcuno deve pur raccoglierle. Disponibile solo in sviluppo.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Disponibile solo in sviluppo", { status: 403 });
  }

  const payload = await request.json();
  const dir = join(process.cwd(), "masterplan", "results");
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, "runs.jsonl"), `${JSON.stringify(payload)}\n`, "utf8");

  return Response.json({ ok: true, rows: Array.isArray(payload.rows) ? payload.rows.length : 0 });
}
