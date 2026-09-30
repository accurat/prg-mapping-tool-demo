import {ScatterplotLayer} from "@deck.gl/layers";
import type {Parameters} from "@luma.gl/core";
import type {LayerContext} from "@deck.gl/core";

/**
 * First-wins union (stencil). luma.gl fissa lo stencil ref a 0.
 * Richiede overlay MapLibre non-interleaved con stencil.
 */
const UNION_STENCIL = {
  depthCompare: "always",
  depthWriteEnabled: false,
  stencilWriteMask: 0xff,
  stencilCompare: "equal",
  stencilPassOperation: "increment-clamp",
  stencilFailOperation: "keep",
  stencilDepthFailOperation: "keep",
} as const;

/** Pass "grasso": bordo colore stroke, alpha pieno, blend standard. */
export const CIRCLE_UNION_RIM_PARAMETERS = {
  ...UNION_STENCIL,
  blend: true,
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one-minus-src-alpha",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
  blendColorOperation: "add",
  blendAlphaOperation: "add",
} as const satisfies Parameters;

/**
 * Pass fill: sostituisce il rim all'interno (one/zero) cosi' resta solo
 * l'anello esterno della union, anche con fill semitrasparente.
 */
export const CIRCLE_UNION_FILL_PARAMETERS = {
  ...UNION_STENCIL,
  blend: true,
  blendColorSrcFactor: "one",
  blendColorDstFactor: "zero",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "zero",
  blendColorOperation: "add",
  blendAlphaOperation: "add",
} as const satisfies Parameters;

/** Spessore stroke in px schermo → metri al centro mappa. */
export function strokePadMeters(
  zoom: number,
  latitude: number,
  strokePx: number,
) {
  const mPerPx =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return Math.max(1, mPerPx * strokePx);
}

function clearStencilBuffer(context: LayerContext) {
  const gl = (context.device as {gl?: WebGL2RenderingContext} | null)?.gl;
  if (!gl) {
    return;
  }
  gl.stencilMask(0xff);
  gl.clearStencil(0);
  gl.clear(gl.STENCIL_BUFFER_BIT);
}

/** Scatterplot in union first-wins; pulisce lo stencil a inizio pass. */
export class UnionFillScatterplotLayer<
  DataT = unknown,
> extends ScatterplotLayer<DataT> {
  static layerName = "UnionFillScatterplotLayer";

  draw(opts: {uniforms: Record<string, unknown>}) {
    clearStencilBuffer(this.context);
    super.draw(opts);
  }
}
