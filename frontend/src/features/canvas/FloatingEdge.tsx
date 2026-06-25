import { BaseEdge, getBezierPath, Position, type EdgeProps } from "@xyflow/react";

// Highlight state pushed onto each edge's `data` by the canvas on hover/search.
export type EdgeState = "normal" | "active" | "dim";

const STROKE = {
  normal: { stroke: "hsl(258 70% 72%)", opacity: 0.3, width: 1.2 },
  active: { stroke: "hsl(258 95% 80%)", opacity: 0.95, width: 2 },
  dim: { stroke: "hsl(258 40% 60%)", opacity: 0.06, width: 1 },
} as const;

const ARROW = 8; // arrowhead length (px)

// Unit vector pointing from the attach point INTO the node.
function dirInto(pos: Position): { x: number; y: number } {
  if (pos === Position.Right) return { x: -1, y: 0 };
  if (pos === Position.Left) return { x: 1, y: 0 };
  if (pos === Position.Top) return { x: 0, y: 1 };
  return { x: 0, y: -1 }; // Bottom
}

// Triangle with tip at (x,y) pointing along dir (into the node).
function arrowPath(x: number, y: number, dir: { x: number; y: number }): string {
  const bx = x - dir.x * ARROW;
  const by = y - dir.y * ARROW;
  const px = -dir.y;
  const py = dir.x;
  const w = ARROW * 0.6;
  return `M ${x} ${y} L ${bx + px * w} ${by + py * w} L ${bx - px * w} ${by - py * w} Z`;
}

interface EdgeGeo {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
  state?: EdgeState;
}

/**
 * Floating edge. Geometry (attach points + sides, with ports fanned out) is
 * precomputed in layout.ts and passed via `data`; this just draws the curve and
 * its own arrowhead, which shares the line's colour + opacity (so it dims with
 * the line). The line stops at the arrow base so nothing pokes through.
 */
export function FloatingEdge({ data }: EdgeProps) {
  const geo = data as unknown as EdgeGeo | undefined;
  if (!geo || geo.sx == null) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = geo;
  const dir = dirInto(targetPos);
  const lineTx = tx - dir.x * ARROW;
  const lineTy = ty - dir.y * ARROW;

  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: lineTx,
    targetY: lineTy,
  });

  const s = STROKE[geo.state ?? "normal"];

  return (
    <>
      <BaseEdge
        path={path}
        style={{ stroke: s.stroke, strokeOpacity: s.opacity, strokeWidth: s.width }}
      />
      <path
        d={arrowPath(tx, ty, dir)}
        fill={s.stroke}
        fillOpacity={s.opacity}
        stroke="none"
      />
    </>
  );
}
