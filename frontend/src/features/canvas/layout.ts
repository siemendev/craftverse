import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type { Graph, ItemSummary, Location } from "@/api/types";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

const PORT_GAP = 8; // dead zone perpendicular to the card border
const PORT_INSET = 12; // keep attach points this far from each corner

// --- Classic "location boxes" tuning ----------------------------------------
const CLUSTER_PADDING = 34; // inner padding of a location box
const CLUSTER_HEADER = 34; // top space reserved for the box label
const CLUSTER_GAP = 90; // gap between location boxes in the outer grid
const COMP_GAP = 40; // gap between components/items inside a box
const UNCLUSTERED = "__none__";

// --- Radial "onion" tuning --------------------------------------------------
// Min radial gap between rings. Must exceed NODE_WIDTH (180): where a spoke
// runs horizontally, radially-aligned cards on adjacent rings are separated
// only by this gap, so a smaller value lets their full widths overlap.
const RING_GAP = 220;
const ANGULAR_SLOT = 230; // arc length (px) reserved per node on a ring
const BARYCENTER_SWEEPS = 8; // crossing-reduction passes
// Aspect band the circular layout is stretched toward (ellipse) — moderate so
// it fills the viewport without becoming an extreme ribbon.
const ASPECT_MIN = 0.62;
const ASPECT_MAX = 1.7;
const ASPECT_FALLBACK = 1.3;

export interface ItemNodeData extends Record<string, unknown> {
  item: ItemSummary;
  depth: number; // 0 = raw material (outermost ring)
  locationNames: string[]; // resolved from the item's locationIds
  highlighted: boolean;
  dimmed: boolean;
}

export interface ClusterNodeData extends Record<string, unknown> {
  label: string;
}

export type CanvasNode = Node<ItemNodeData> | Node<ClusterNodeData>;

export type LayoutMode = "radial" | "clusters";

export interface Viewport {
  width: number;
  height: number;
}

interface XY {
  x: number;
  y: number;
}

/**
 * Two layout strategies, selectable by the user:
 *  - "radial": the dynamic dependency-depth onion (see computeRadialLayout).
 *  - "clusters": classic location boxes, improved (see computeClusterLayout).
 */
export function computeLayout(
  graph: Graph,
  mode: LayoutMode,
  viewport?: Viewport,
): { nodes: CanvasNode[]; edges: Edge[] } {
  return mode === "clusters"
    ? computeClusterLayout(graph, viewport)
    : computeRadialLayout(graph, viewport);
}

/**
 * Radial dependency-depth layout. An item's depth is the longest path back to a
 * raw material (an item with no ingredients): raw = 0, anything crafted from
 * raws = 1, and so on. Depth maps to ring radius (inverted) — the most-
 * processed items sit in the center, raw materials on the outermost ring (read
 * inward = more refined). Because depth is the
 * *longest* path, every ingredient is guaranteed a strictly smaller depth than
 * its product, so all edges point outward and the radial flow stays clean.
 * Locations are ignored entirely in this view. Within each ring, items are
 * ordered by repeated barycenter sorting so connected items line up radially
 * and edge crossings are minimized.
 */
function computeRadialLayout(
  graph: Graph,
  viewport?: Viewport,
): { nodes: CanvasNode[]; edges: Edge[] } {
  const itemById = new Map(graph.items.map((it) => [it.id, it]));
  const nameById = (id: string) => itemById.get(id)?.name ?? id;
  const locNameById = new Map(graph.locations.map((l) => [l.id, l.name]));

  // Dependency adjacency. Edge convention: toItemId = product, fromItemId =
  // ingredient (the product depends on the ingredient).
  const ingredients = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!itemById.has(e.fromItemId) || !itemById.has(e.toItemId)) continue;
    (ingredients.get(e.toItemId) ?? ingredients.set(e.toItemId, []).get(e.toItemId)!).push(
      e.fromItemId,
    );
    (dependents.get(e.fromItemId) ?? dependents.set(e.fromItemId, []).get(e.fromItemId)!).push(
      e.toItemId,
    );
  }

  // --- Depth = longest path from a raw material, with cycle guard.
  const depth = new Map<string, number>();
  const STATE = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on-stack, 2 done
  const visit = (id: string): number => {
    const s = STATE.get(id) ?? 0;
    if (s === 2) return depth.get(id)!;
    if (s === 1) return 0; // back-edge in a cycle → no contribution
    STATE.set(id, 1);
    let d = 0;
    for (const ing of ingredients.get(id) ?? []) {
      d = Math.max(d, 1 + visit(ing));
    }
    STATE.set(id, 2);
    depth.set(id, d);
    return d;
  };
  for (const it of graph.items) visit(it.id);

  // --- Group into rings by depth.
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  const order: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const it of graph.items) order[depth.get(it.id) ?? 0].push(it.id);
  for (const ring of order) ring.sort((a, b) => nameById(a).localeCompare(nameById(b)));

  // --- Barycenter ordering: pull each item toward the average angular slot of
  // its neighbors (ingredients + dependents) so spokes align and crossings drop.
  const neighbors = (id: string) => [
    ...(ingredients.get(id) ?? []),
    ...(dependents.get(id) ?? []),
  ];
  const fractionOf = () => {
    const f = new Map<string, number>();
    for (const ring of order) {
      const n = ring.length;
      ring.forEach((id, i) => f.set(id, n > 1 ? i / (n - 1) : 0.5));
    }
    return f;
  };
  for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep++) {
    const f = fractionOf();
    for (const ring of order) {
      const key = new Map<string, number>();
      for (const id of ring) {
        const nb = neighbors(id);
        const k = nb.length
          ? nb.reduce((s, n) => s + (f.get(n) ?? 0.5), 0) / nb.length
          : (f.get(id) ?? 0.5);
        key.set(id, k);
      }
      ring.sort(
        (a, b) => key.get(a)! - key.get(b)! || nameById(a).localeCompare(nameById(b)),
      );
    }
  }

  // --- Radius per ring. Inverted onion: the most-processed items (max depth)
  // sit at the center, raw materials (depth 0, the leaves) on the outermost
  // ring. We size from the center outward so each ring fits its items — and the
  // typically-large raw ring lands outside where the circumference is biggest.
  const radiusFor = (n: number) => (n <= 1 ? 0 : (ANGULAR_SLOT * n) / (Math.PI * 2));
  const radius: number[] = [];
  for (let L = maxDepth; L >= 0; L--) {
    const content = radiusFor(order[L].length);
    radius[L] = L === maxDepth ? content : Math.max(radius[L + 1] + RING_GAP, content);
  }

  // --- Place each item on its ring.
  const centerById = new Map<string, Center>();
  const positioned: { id: string; xy: XY }[] = [];
  for (let L = 0; L <= maxDepth; L++) {
    const ring = order[L];
    const n = ring.length;
    const r = radius[L];
    ring.forEach((id, i) => {
      const angle = n > 0 ? (i / n) * Math.PI * 2 : 0;
      const xy = r === 0 ? { x: 0, y: 0 } : { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      positioned.push({ id, xy });
    });
  }

  // Stretch the circle toward the viewport aspect (ellipse) — only spreads, so
  // no overlaps appear.
  shapeToAspect(positioned.map((p) => p.xy), viewport);

  const nodes: CanvasNode[] = positioned.map(({ id, xy }) => {
    centerById.set(id, { cx: xy.x, cy: xy.y });
    return {
      id,
      type: "item",
      position: { x: xy.x - NODE_WIDTH / 2, y: xy.y - NODE_HEIGHT / 2 },
      data: {
        item: itemById.get(id)!,
        depth: depth.get(id) ?? 0,
        locationNames: (itemById.get(id)!.locationIds ?? [])
          .map((lid) => locNameById.get(lid))
          .filter((n): n is string => !!n),
        highlighted: false,
        dimmed: false,
      },
    } as Node<ItemNodeData>;
  });

  const edges = buildEdges(graph, centerById);
  return { nodes, edges };
}

/**
 * Stretch a set of points toward the viewport aspect by spreading the shorter
 * axis. Only ever enlarges gaps — never compresses — so it cannot create
 * overlaps. Target aspect is clamped to [MIN, MAX].
 */
function shapeToAspect(pts: XY[], viewport?: Viewport): void {
  if (pts.length < 2) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return;
  const a0 = w / h;
  const ar =
    viewport && viewport.height > 0 ? viewport.width / viewport.height : ASPECT_FALLBACK;
  const target = Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, ar));
  let scaleX = 1;
  let scaleY = 1;
  if (target > a0) scaleX = target / a0;
  else scaleY = a0 / target;
  if (scaleX === 1 && scaleY === 1) return;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (const p of pts) {
    p.x = cx + (p.x - cx) * scaleX;
    p.y = cy + (p.y - cy) * scaleY;
  }
}

// --- Classic location-box layout -------------------------------------------

/**
 * Classic layout: one box per location, improved over the original. Each box is
 * laid out internally by splitting its items into connected components (using
 * only intra-box edges), running dagre on multi-item components (so recipes
 * read as little top-down trees) and treating lone items as 1×1 boxes, then
 * shelf-packing those components into a roughly square grid — so a box full of
 * unconnected items wraps instead of becoming one endless row. The boxes are
 * then arranged in an outer grid whose column count follows the viewport aspect
 * (landscape → more columns/wider, portrait → fewer/taller).
 */
function computeClusterLayout(
  graph: Graph,
  viewport?: Viewport,
): { nodes: CanvasNode[]; edges: Edge[] } {
  const locById = new Map<string, Location>(graph.locations.map((l) => [l.id, l]));
  const itemById = new Map(graph.items.map((it) => [it.id, it]));

  // Bucket items by primary (first) location.
  const buckets = new Map<string, ItemSummary[]>();
  for (const it of graph.items) {
    const cid = it.locationIds[0] ?? UNCLUSTERED;
    (buckets.get(cid) ?? buckets.set(cid, []).get(cid)!).push(it);
  }
  const clusterIds = [...buckets.keys()].sort((a, b) => {
    if (a === UNCLUSTERED) return 1;
    if (b === UNCLUSTERED) return -1;
    return (locById.get(a)?.name ?? a).localeCompare(locById.get(b)?.name ?? b);
  });
  const itemToCluster = new Map<string, string>();
  for (const [cid, items] of buckets) for (const it of items) itemToCluster.set(it.id, cid);

  const locNamesFor = (it: ItemSummary) =>
    (it.locationIds ?? [])
      .map((lid) => locById.get(lid)?.name)
      .filter((n): n is string => !!n);

  // Lay out each box internally.
  const laid = clusterIds.map((cid) => {
    const items = buckets.get(cid)!;
    const intra = graph.edges.filter(
      (e) =>
        itemToCluster.get(e.fromItemId) === cid &&
        itemToCluster.get(e.toItemId) === cid &&
        itemById.has(e.fromItemId) &&
        itemById.has(e.toItemId),
    );
    return { cid, items, inner: layoutClusterInner(items, intra) };
  });

  // Outer grid: column count shaped by viewport aspect.
  const C = laid.length;
  const ar = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1.3;
  const cols = Math.max(1, Math.min(C, Math.round(Math.sqrt(C * Math.max(0.5, ar)))));

  const clusterNodes: Node<ClusterNodeData>[] = [];
  const childNodes: Node<ItemNodeData>[] = [];
  const centerById = new Map<string, Center>();
  let col = 0;
  let cursorX = 0;
  let rowY = 0;
  let rowMaxH = 0;
  for (const { cid, items, inner } of laid) {
    const label =
      cid === UNCLUSTERED ? "No location" : (locById.get(cid)?.name ?? "Location");
    const cw = inner.width + CLUSTER_PADDING * 2;
    const ch = inner.height + CLUSTER_PADDING * 2 + CLUSTER_HEADER;
    const clusterNodeId = `cluster:${cid}`;
    clusterNodes.push({
      id: clusterNodeId,
      type: "cluster",
      position: { x: cursorX, y: rowY },
      data: { label },
      draggable: false,
      selectable: false,
      style: { width: cw, height: ch },
    } as Node<ClusterNodeData>);

    for (const it of items) {
      const p = inner.pos.get(it.id)!;
      const x = p.x + CLUSTER_PADDING;
      const y = p.y + CLUSTER_PADDING + CLUSTER_HEADER;
      childNodes.push({
        id: it.id,
        type: "item",
        parentId: clusterNodeId,
        extent: "parent",
        position: { x, y },
        data: {
          item: it,
          depth: 0,
          locationNames: locNamesFor(it),
          highlighted: false,
          dimmed: false,
        },
      } as Node<ItemNodeData>);
      centerById.set(it.id, {
        cx: cursorX + x + NODE_WIDTH / 2,
        cy: rowY + y + NODE_HEIGHT / 2,
      });
    }

    rowMaxH = Math.max(rowMaxH, ch);
    cursorX += cw + CLUSTER_GAP;
    col += 1;
    if (col >= cols) {
      col = 0;
      cursorX = 0;
      rowY += rowMaxH + CLUSTER_GAP;
      rowMaxH = 0;
    }
  }

  // Parent (cluster) nodes must precede their children in the array.
  const nodes: CanvasNode[] = [...clusterNodes, ...childNodes];
  const edges = buildEdges(graph, centerById);
  return { nodes, edges };
}

/**
 * Internal layout of one location box. Returns item positions (top-left, box-
 * local) plus the content width/height. Connected components are laid out with
 * dagre; everything is shelf-packed into a roughly square area.
 */
function layoutClusterInner(
  items: ItemSummary[],
  edges: Graph["edges"],
): { pos: Map<string, XY>; width: number; height: number } {
  const ids = new Set(items.map((i) => i.id));

  // Undirected adjacency → connected components.
  const adj = new Map<string, string[]>();
  for (const it of items) adj.set(it.id, []);
  for (const e of edges) {
    if (ids.has(e.fromItemId) && ids.has(e.toItemId)) {
      adj.get(e.fromItemId)!.push(e.toItemId);
      adj.get(e.toItemId)!.push(e.fromItemId);
    }
  }
  const comp = new Map<string, number>();
  let nComp = 0;
  for (const it of items) {
    if (comp.has(it.id)) continue;
    const queue = [it.id];
    comp.set(it.id, nComp);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nx of adj.get(cur)!) {
        if (!comp.has(nx)) {
          comp.set(nx, nComp);
          queue.push(nx);
        }
      }
    }
    nComp += 1;
  }

  // Lay out each component into a box at local origin.
  type Box = { pos: Map<string, XY>; width: number; height: number };
  const boxes: Box[] = [];
  for (let c = 0; c < nComp; c++) {
    const members = items.filter((it) => comp.get(it.id) === c).map((i) => i.id);
    if (members.length === 1) {
      boxes.push({
        pos: new Map([[members[0], { x: 0, y: 0 }]]),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
      continue;
    }
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 34, ranksep: 56, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const m of members) g.setNode(m, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const e of edges) {
      if (comp.get(e.fromItemId) === c && comp.get(e.toItemId) === c) {
        // ingredient (from) above product (to): raw on top, refined below.
        g.setEdge(e.fromItemId, e.toItemId);
      }
    }
    dagre.layout(g);
    const pos = new Map<string, XY>();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const m of members) {
      const n = g.node(m);
      const x = (n?.x ?? NODE_WIDTH / 2) - NODE_WIDTH / 2;
      const y = (n?.y ?? NODE_HEIGHT / 2) - NODE_HEIGHT / 2;
      pos.set(m, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_WIDTH);
      maxY = Math.max(maxY, y + NODE_HEIGHT);
    }
    for (const m of members) {
      const p = pos.get(m)!;
      p.x -= minX;
      p.y -= minY;
    }
    boxes.push({ pos, width: maxX - minX, height: maxY - minY });
  }

  // Shelf-pack the component boxes into a roughly square grid.
  const slotW = NODE_WIDTH + COMP_GAP;
  const maxBoxW = boxes.reduce((m, b) => Math.max(m, b.width), 0);
  const targetW = Math.max(maxBoxW, Math.ceil(Math.sqrt(items.length)) * slotW);
  const ordered = boxes.slice().sort((a, b) => b.height - a.height); // tall first

  const pos = new Map<string, XY>();
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  let usedW = 0;
  for (const b of ordered) {
    if (cx > 0 && cx + b.width > targetW) {
      cx = 0;
      cy += rowH + COMP_GAP;
      rowH = 0;
    }
    for (const [id, p] of b.pos) pos.set(id, { x: cx + p.x, y: cy + p.y });
    cx += b.width + COMP_GAP;
    rowH = Math.max(rowH, b.height);
    usedW = Math.max(usedW, cx - COMP_GAP);
  }
  return { pos, width: usedW, height: cy + rowH };
}

// --- Edge ports -------------------------------------------------------------
// Arrow points in the DEPENDENCY direction: product -> the ingredient it needs
// (source = output item, target = ingredient). Multiple edges that meet the
// same side of a node are fanned out across that side's central band so they
// don't stack on one point (a major source of overlap on the short sides). The
// full geometry is precomputed here — the nodes are static, so the edge just
// renders it. Quantity labels are omitted on the canvas (detail view only).

interface Center {
  cx: number;
  cy: number;
}

function sideOf(self: Center, other: Center): Position {
  const dx = other.cx - self.cx;
  const dy = other.cy - self.cy;
  const sx = dx !== 0 ? NODE_WIDTH / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? NODE_HEIGHT / 2 / Math.abs(dy) : Infinity;
  if (sx < sy) return dx > 0 ? Position.Right : Position.Left;
  return dy > 0 ? Position.Bottom : Position.Top;
}

// Coordinate of `other` along the axis of the hit side — used to order ports so
// edges fan out without crossing each other near the node.
function sortKey(side: Position, other: Center): number {
  return side === Position.Left || side === Position.Right ? other.cy : other.cx;
}

// Attach point on `side`, `frac` in [-0.5, 0.5] along the side's central band,
// pushed out by PORT_GAP perpendicular to the border.
function attach(c: Center, side: Position, frac: number): { x: number; y: number } {
  const w = NODE_WIDTH / 2;
  const h = NODE_HEIGHT / 2;
  const spanX = NODE_WIDTH - 2 * PORT_INSET;
  const spanY = NODE_HEIGHT - 2 * PORT_INSET;
  switch (side) {
    case Position.Right:
      return { x: c.cx + w + PORT_GAP, y: c.cy + frac * spanY };
    case Position.Left:
      return { x: c.cx - w - PORT_GAP, y: c.cy + frac * spanY };
    case Position.Top:
      return { x: c.cx + frac * spanX, y: c.cy - h - PORT_GAP };
    default: // Bottom
      return { x: c.cx + frac * spanX, y: c.cy + h + PORT_GAP };
  }
}

function buildEdges(graph: Graph, centerById: Map<string, Center>): Edge[] {
  // Resolve the side each endpoint attaches to.
  const geos = graph.edges
    .map((e) => {
      const a = centerById.get(e.toItemId); // product (source)
      const b = centerById.get(e.fromItemId); // ingredient (target)
      if (!a || !b) return null;
      return {
        e,
        a,
        b,
        sourcePos: sideOf(a, b),
        targetPos: sideOf(b, a),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  // Group endpoints by (node, side) and assign each a fractional slot.
  const groups = new Map<
    string,
    { i: number; end: "s" | "t"; key: number }[]
  >();
  geos.forEach((g, i) => {
    const sKey = `${g.e.toItemId}|${g.sourcePos}`;
    const tKey = `${g.e.fromItemId}|${g.targetPos}`;
    (groups.get(sKey) ?? groups.set(sKey, []).get(sKey)!).push({
      i,
      end: "s",
      key: sortKey(g.sourcePos, g.b),
    });
    (groups.get(tKey) ?? groups.set(tKey, []).get(tKey)!).push({
      i,
      end: "t",
      key: sortKey(g.targetPos, g.a),
    });
  });

  const sFrac = new Array(geos.length).fill(0);
  const tFrac = new Array(geos.length).fill(0);
  for (const arr of groups.values()) {
    arr.sort((x, y) => x.key - y.key);
    const n = arr.length;
    arr.forEach((item, idx) => {
      const frac = n > 1 ? idx / (n - 1) - 0.5 : 0;
      if (item.end === "s") sFrac[item.i] = frac;
      else tFrac[item.i] = frac;
    });
  }

  return geos.map((g, i) => {
    const sp = attach(g.a, g.sourcePos, sFrac[i]);
    const tp = attach(g.b, g.targetPos, tFrac[i]);
    return {
      id: g.e.id,
      source: g.e.toItemId,
      target: g.e.fromItemId,
      type: "floating",
      data: {
        recipeId: g.e.recipeId,
        quantity: g.e.quantity,
        state: "normal",
        sx: sp.x,
        sy: sp.y,
        tx: tp.x,
        ty: tp.y,
        sourcePos: g.sourcePos,
        targetPos: g.targetPos,
      },
    };
  });
}
