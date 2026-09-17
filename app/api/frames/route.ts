import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Salva fotogrammi catturati dalla pagina.
 *
 * Serve a guardare fotogrammi **consecutivi**: un difetto che compare e sparisce
 * a ogni fotogramma non si cattura con uno strumento esterno, che fotografa
 * quello che il sistema ha gia' composto e a intervalli troppo lunghi.
 * Disponibile solo in sviluppo.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Disponibile solo in sviluppo", { status: 403 });
  }

  const { label, frames } = (await request.json()) as { label: string; frames: string[] };
  const dir = join(process.cwd(), "masterplan", "results", "frames", label);
  await mkdir(dir, { recursive: true });

  await Promise.all(
    frames.map((dataUrl, i) => {
      const base64 = dataUrl.split(",")[1] ?? "";
      return writeFile(join(dir, `${String(i).padStart(2, "0")}.png`), Buffer.from(base64, "base64"));
    }),
  );

  return Response.json({ ok: true, saved: frames.length, dir });
}
