import Link from "next/link";

const TESTS = [
  { id: "t0", title: "Impianto", desc: "Canvas a 5760x1080, contatore fotogrammi, costo della sola superficie", ready: true },
  { id: "t1", title: "La discesa su una citta'", desc: "MapLibre, dal globo alla scala stradale", ready: true },
  { id: "t2", title: "Il costo della mappa base", desc: "Stili, terreno, edifici, misurati separatamente", ready: false },
  { id: "t3", title: "deck.gl sopra MapLibre", desc: "Sovrapposto contro interlacciato", ready: true },
  { id: "t4", title: "Colonne esagonali", desc: "Il rilievo: celle, aggregazione, transizioni, ombre", ready: true },
  { id: "t5", title: "Archi negozio - hub", desc: "Quantita' e animazione", ready: false },
  { id: "t6", title: "Punti e selezione", desc: "27.000 punti, con e senza rilevamento del tocco", ready: false },
  { id: "t7", title: "Interazioni", desc: "Gesti, volo, trascinamento con selezione continua", ready: false },
  { id: "t8", title: "Tre schermi", desc: "Un canvas da 5760 contro tre da 1920", ready: false },
  { id: "t9", title: "Leggibilita'", desc: "Dimensioni minime a dodici metri", ready: false },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 font-mono text-sm">
      <h1 className="text-lg font-bold">Mapping Tool 2026 — test di fattibilita&apos;</h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        Piano dei test in <code>masterplan/</code>. Ogni pagina misura una cosa sola.
      </p>

      <ul className="mt-10 space-y-1">
        {TESTS.map((t) => (
          <li key={t.id}>
            {t.ready ? (
              <Link
                href={`/${t.id}`}
                className="flex items-baseline gap-4 rounded px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span className="w-8 shrink-0 uppercase text-black/40 dark:text-white/40">{t.id}</span>
                <span className="w-56 shrink-0">{t.title}</span>
                <span className="text-black/50 dark:text-white/50">{t.desc}</span>
              </Link>
            ) : (
              <div className="flex items-baseline gap-4 px-3 py-2 opacity-35">
                <span className="w-8 shrink-0 uppercase">{t.id}</span>
                <span className="w-56 shrink-0">{t.title}</span>
                <span>{t.desc}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
