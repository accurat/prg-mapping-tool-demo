import Link from "next/link";

const TESTS = [
  { id: "t0", title: "The rig", desc: "A 5760x1080 canvas, a frame counter, the cost of the surface alone", ready: true },
  { id: "t1", title: "Descent onto a city", desc: "MapLibre, from the globe to street scale", ready: true },
  { id: "t2", title: "The cost of the basemap", desc: "Styles, terrain, buildings, measured separately", ready: false },
  { id: "t3", title: "deck.gl over MapLibre", desc: "Overlaid against interleaved", ready: true },
  { id: "t4", title: "Hexagonal columns", desc: "The relief: cells, aggregation, transitions, shadows", ready: true },
  { id: "t5", title: "Store-to-hub arcs", desc: "Quantity and animation", ready: true },
  { id: "t6", title: "Points and selection", desc: "27,000 points, with and without hit testing", ready: true },
  { id: "t7", title: "Interactions", desc: "Gestures, flight, dragging with continuous selection", ready: true },
  { id: "t8", title: "Three screens", desc: "One 5760 canvas against three of 1920", ready: false },
  { id: "t9", title: "Legibility", desc: "Minimum sizes at twelve metres", ready: true },
  { id: "t10", title: "Full sequence", desc: "Merged into T12: same sequence, real data", ready: false },
  { id: "t11", title: "The stories", desc: "Drawn from the real data, deterministic, each with its staging", ready: true },
  { id: "t12", title: "The scene", desc: "Globe, descent, relief, network, panels. Real data, and what it costs to compose them", ready: true },
  { id: "t13", title: "The story tour", desc: "The stories drive the camera: one flight per story, each with its stores and its layer", ready: true },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 font-mono text-sm">
      <h1 className="text-lg font-bold">Mapping Tool 2026 — feasibility tests</h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        Test plan in <code>masterplan/</code>. Each page measures one thing.
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
