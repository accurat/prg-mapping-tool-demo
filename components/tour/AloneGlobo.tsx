"use client";

import { useEffect, useRef } from "react";

/**
 * L'alone attorno al globo.
 *
 * Senza, il pianeta e' un disco grigio ritagliato sul nero: si legge come
 * un'immagine piu' che come un oggetto nello spazio. MapLibre ha un'atmosfera
 * propria, ma e' un'ombreggiatura giorno-notte che sbianca mezzo globo; qui
 * serve solo un bordo di luce.
 *
 * **E' un gradiente, non una somma di tratti.** La prima versione sovrapponeva
 * tre linee di spessore e opacita' diversi, e l'occhio le leggeva per quello
 * che erano: tre fasce a tinta piatta. Un gradiente radiale sfuma davvero, e
 * costa meno — un'ellisse sola invece di tre tracciati da seicento punti.
 *
 * Il bordo arriva dalla regia gia' proiettato. Visto in prospettiva il
 * contorno di una sfera e' un'ellisse — un cerchio a camera dritta — quindi se
 * ne ricavano centro, assi e rotazione, e il gradiente si stende su quella.
 * Si ricalcola solo quando il bordo si sposta: mentre il globo gira resta
 * fermo, e il ciclo costa un confronto.
 */

/** Quanto si allarga la luce oltre il bordo, in pixel di muro. */
const SPESSORE = 170;

/** I passi della sfumatura, in pixel dal bordo: negativi dentro il pianeta. */
const PASSI: [number, number][] = [
  [-10, 0],
  [0, 0.5],
  [8, 0.34],
  [24, 0.2],
  [55, 0.1],
  [100, 0.04],
  [SPESSORE, 0],
];

type Ellisse = { cx: number; cy: number; a: number; b: number; angolo: number };

/**
 * L'ellisse che passa per i punti del bordo.
 *
 * L'asse maggiore e' la coppia di punti piu' lontani fra loro; il minore e'
 * la distanza massima da quell'asse. Per un'ellisse campionata fitta basta, e
 * a differenza di una media dei punti non si sposta verso il lato in cui la
 * prospettiva li addensa.
 */
function ellisseDi(punti: [number, number][]): Ellisse | null {
  if (punti.length < 8) return null;
  let migliore = 0;
  let p1 = punti[0];
  let p2 = punti[0];
  for (let i = 0; i < punti.length; i++) {
    for (let j = i + 1; j < punti.length; j++) {
      const d = (punti[i][0] - punti[j][0]) ** 2 + (punti[i][1] - punti[j][1]) ** 2;
      if (d > migliore) {
        migliore = d;
        p1 = punti[i];
        p2 = punti[j];
      }
    }
  }
  const a = Math.sqrt(migliore) / 2;
  if (!(a > 1)) return null;
  const cx = (p1[0] + p2[0]) / 2;
  const cy = (p1[1] + p2[1]) / 2;
  const ux = (p2[0] - p1[0]) / (2 * a);
  const uy = (p2[1] - p1[1]) / (2 * a);
  let b = 0;
  for (const [x, y] of punti) b = Math.max(b, Math.abs(-(x - cx) * uy + (y - cy) * ux));
  return { cx, cy, a, b: Math.max(1, b), angolo: (Math.atan2(uy, ux) * 180) / Math.PI };
}

export function AloneGlobo({
  leggi,
  larghezza,
  altezza,
}: {
  leggi: () => { punti: [number, number][]; intensita: number } | null;
  larghezza: number;
  altezza: number;
}) {
  const gruppo = useRef<SVGGElement>(null);
  const ellisse = useRef<SVGEllipseElement>(null);
  const passi = useRef<(SVGStopElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let ultimi = "";
    let ultimaIntensita = -1;
    const passo = () => {
      raf = requestAnimationFrame(passo);
      const g = gruppo.current;
      const el = ellisse.current;
      if (!g || !el) return;
      const bordo = leggi();
      const intensita = bordo?.intensita ?? 0;
      if (Math.abs(intensita - ultimaIntensita) > 0.003) {
        g.style.opacity = String(intensita);
        ultimaIntensita = intensita;
      }
      if (!bordo) return;

      // Mezzo pixel di tolleranza: sotto, lo spostamento non si vede e
      // ridisegnare vorrebbe dire ridipingere mezzo muro per niente.
      const chiave = bordo.punti
        .filter((_, i) => i % 8 === 0)
        .map(([x, y]) => `${Math.round(x * 2)},${Math.round(y * 2)}`)
        .join(" ");
      if (chiave === ultimi) return;
      ultimi = chiave;

      const e = ellisseDi(bordo.punti);
      if (!e) return;

      /**
       * Il gradiente vive nel riquadro dell'ellisse, quindi i suoi passi sono
       * frazioni del raggio. Si convertono dai pixel ogni volta: cosi' la
       * luce resta spessa quanto deve sia attorno al globo piccolo
       * dell'apertura sia attorno a quello, dieci volte piu' grande, del
       * paese inclinato.
       */
      const esterno = e.a + SPESSORE;
      el.setAttribute("cx", String(e.cx));
      el.setAttribute("cy", String(e.cy));
      el.setAttribute("rx", String(esterno));
      el.setAttribute("ry", String((e.b * esterno) / e.a));
      el.setAttribute("transform", `rotate(${e.angolo} ${e.cx} ${e.cy})`);
      PASSI.forEach(([px], i) => {
        const offset = Math.max(0, Math.min(1, (e.a + px) / esterno));
        passi.current[i]?.setAttribute("offset", String(offset));
      });
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [leggi]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={larghezza}
      height={altezza}
      aria-hidden
    >
      <defs>
        <radialGradient id="t13-alone">
          <stop offset={0} stopColor="rgb(120, 170, 255)" stopOpacity={0} />
          {PASSI.map(([, opacita], i) => (
            <stop
              key={i}
              ref={(el) => {
                passi.current[i] = el;
              }}
              offset={0}
              stopColor="rgb(120, 170, 255)"
              stopOpacity={opacita}
            />
          ))}
        </radialGradient>
      </defs>
      <g ref={gruppo} style={{ opacity: 0 }}>
        <ellipse ref={ellisse} fill="url(#t13-alone)" />
      </g>
    </svg>
  );
}
