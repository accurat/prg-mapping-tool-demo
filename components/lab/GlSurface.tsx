"use client";

import { useEffect, useRef } from "react";

export type SurfaceInfo = {
  /** Dimensioni reali del buffer di disegno, lette dall'elemento canvas. */
  bufferWidth: number;
  bufferHeight: number;
  devicePixelRatio: number;
  renderer: string;
};

/**
 * Scena minima in WebGL: riempie la superficie con un colore che varia nel
 * tempo, eventualmente piu' volte per fotogramma.
 *
 * Perche' WebGL e non un canvas 2D: la domanda di T0 e' quanto costa riempire
 * 6,2 milioni di pixel con lo stesso tipo di lavoro che faranno MapLibre e
 * deck.gl. Un riempimento 2D passerebbe da un percorso diverso e darebbe un
 * numero non confrontabile.
 *
 * `passes` disegna piu' volte l'intera superficie con fusione attiva: serve a
 * misurare quanto margine di riempimento abbiamo. Un passaggio e' la scena
 * vuota; otto passaggi dicono se il margine e' ampio o inesistente.
 */
export function GlSurface({
  width,
  height,
  passes = 1,
  onInfo,
}: {
  width: number;
  height: number;
  passes?: number;
  onInfo?: (info: SurfaceInfo) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const passesRef = useRef(passes);

  // Il numero di passaggi cambia senza ricreare il contesto grafico: il ciclo
  // di disegno legge sempre il valore corrente da qui.
  useEffect(() => {
    passesRef.current = passes;
  }, [passes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Il buffer di disegno viene fissato a mano: nessun fattore di scala dello
    // schermo, altrimenti su un portatile ad alta densita' misureremmo il
    // quadruplo del carico reale.
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      console.error("WebGL2 non disponibile");
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        const lost = gl.isContextLost() ? " (contesto grafico perso)" : "";
        throw new Error(`Compilazione shader fallita${lost}: ${log || "nessun dettaglio"}`);
      }
      return shader;
    };

    // Triangolo a tutto schermo generato dall'indice del vertice: nessun buffer
    // di geometria da allocare.
    const vs = compile(
      gl.VERTEX_SHADER,
      `#version 300 es
       void main() {
         vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
         gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
       }`,
    );
    const fs = compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
       precision highp float;
       uniform vec4 uColor;
       out vec4 fragColor;
       void main() { fragColor = uColor; }`,
    );

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "collegamento fallito");
    }
    gl.useProgram(program);

    const uColor = gl.getUniformLocation(program, "uColor");
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // La fusione impedisce alla scheda video di saltare i passaggi ripetuti.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, width, height);

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    onInfo?.({
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      devicePixelRatio: window.devicePixelRatio,
      renderer: debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER)),
    });

    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const base = 0.5 + 0.5 * Math.sin(t * 0.6);

      gl.clearColor(0.02, 0.02, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const n = Math.max(1, passesRef.current);
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        gl.uniform4f(uColor, 0.05 + base * 0.25 * k, 0.1 * k, 0.25 + base * 0.35, 0.35);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      // Le risorse vengono liberate, ma il contesto NON viene perso di
      // proposito: per uno stesso elemento canvas getContext restituisce sempre
      // lo stesso contesto, e in sviluppo React monta i componenti due volte.
      // Invalidandolo qui, al secondo montaggio troveremmo un contesto morto.
      // Il contesto viene rilasciato dal browser insieme all'elemento.
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteVertexArray(vao);
    };
    // onInfo escluso di proposito: non deve far ripartire il contesto grafico.
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
}
