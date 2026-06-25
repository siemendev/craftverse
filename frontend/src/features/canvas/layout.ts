import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type { Graph, ItemSummary, Location } from "@/api/types";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;
const CLUSTER_GAP_X = 140;
const CLUSTER_GAP_Y = 120;
const CLUSTER_PADDING = 48;
const CLUSTER_HEADER = 40;
const PORT_GAP = 8; // dead zone perpendicular to the card border
const PORT_INSET = 12; // keep attach points this far from each corner

export interface ItemNodeData extends Record<string, unknown> {
  item: ItemSummary;
  clusterName: string;
  highlighted: boolean;
  dimmed: boolean;
}

export interface ClusterNodeData extends Record<string, unknown> {
  label: string;
}

export type CanvasNode = Node<ItemNodeData> | Node<ClusterNodeData>;

const UNCLUSTERED = "__none__";

/**
 * Cluster items by their primary/first location, run a directed dagre layout
 * per cluster, then arrange the clusters side-by-side. Cluster regions are
 * rendered as group nodes; item nodes are positioned relative to them.
 */
export function computeLayout(
  graph: Graph,
): { nodes: CanvasNode[]; edges: Edge[] } {
  const locById = new Map<string, Location>(
    graph.locations.map((l) => [l.id, l]),
  );

  // Bucket items by cluster (first location id, or "unclustered").
  const buckets = new Map<string, ItemSummary[]>();
  for (const item of graph.items) {
    const clusterId = item.locationIds[0] ?? UNCLUSTERED;
    const arr = buckets.get(clusterId) ?? [];
    arr.push(item);
    buckets.set(clusterId, arr);
  }

  // Stable cluster order: named clusters alphabetically, unclustered last.
  const clusterIds = [...buckets.keys()].sort((a, b) => {
    if (a === UNCLUSTERED) return 1;
    if (b === UNCLUSTERED) return -1;
    const an = locById.get(a)?.name ?? a;
    const bn = locById.get(b)?.name ?? b;
    return an.localeCompare(bn);
  });

  const itemToCluster = new Map<string, string>();
  for (const [cid, items] of buckets) {
    for (const it of items) itemToCluster.set(it.id, cid);
  }

  const nodes: CanvasNode[] = [];
  const childNodes: Node<ItemNodeData>[] = [];
  // Absolute center of each item node (flow coords), used to lay out edge ports.
  const centerById = new Map<string, { cx: number; cy: number }>();

  // Pack clusters into a roughly square grid instead of one long horizontal
  // row, so the graph is compact and edges are easier to follow.
  const cols = Math.max(1, Math.ceil(Math.sqrt(clusterIds.length)));
  let colIndex = 0;
  let cursorX = 0;
  let rowY = 0;
  let rowMaxHeight = 0;

  for (const clusterId of clusterIds) {
    const items = buckets.get(clusterId)!;
    const clusterName =
      clusterId === UNCLUSTERED
        ? "No location"
        : (locById.get(clusterId)?.name ?? "Location");

    // Per-cluster dagre layout including only intra-cluster edges so each
    // cluster reads as its own crafting hierarchy.
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 70, marginx: 8, marginy: 8 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const it of items) {
      g.setNode(it.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const e of graph.edges) {
      if (
        itemToCluster.get(e.fromItemId) === clusterId &&
        itemToCluster.get(e.toItemId) === clusterId
      ) {
        if (g.hasNode(e.fromItemId) && g.hasNode(e.toItemId)) {
          g.setEdge(e.fromItemId, e.toItemId);
        }
      }
    }
    dagre.layout(g);

    let maxX = 0;
    let maxY = 0;
    const positioned: { id: string; x: number; y: number }[] = [];
    for (const it of items) {
      const n = g.node(it.id);
      // dagre gives center coords; convert to top-left within the cluster.
      const x = (n?.x ?? NODE_WIDTH / 2) - NODE_WIDTH / 2 + CLUSTER_PADDING;
      const y =
        (n?.y ?? NODE_HEIGHT / 2) -
        NODE_HEIGHT / 2 +
        CLUSTER_PADDING +
        CLUSTER_HEADER;
      positioned.push({ id: it.id, x, y });
      maxX = Math.max(maxX, x + NODE_WIDTH);
      maxY = Math.max(maxY, y + NODE_HEIGHT);
    }

    const clusterWidth = Math.max(maxX + CLUSTER_PADDING, NODE_WIDTH + CLUSTER_PADDING * 2);
    const clusterHeight = Math.max(
      maxY + CLUSTER_PADDING,
      CLUSTER_HEADER + CLUSTER_PADDING * 2,
    );

    const clusterNodeId = `cluster:${clusterId}`;
    nodes.push({
      id: clusterNodeId,
      type: "cluster",
      position: { x: cursorX, y: rowY },
      data: { label: clusterName },
      draggable: false,
      selectable: false,
      style: { width: clusterWidth, height: clusterHeight },
    } as Node<ClusterNodeData>);

    for (const it of items) {
      const p = positioned.find((q) => q.id === it.id)!;
      childNodes.push({
        id: it.id,
        type: "item",
        parentId: clusterNodeId,
        extent: "parent",
        position: { x: p.x, y: p.y },
        data: {
          item: it,
          clusterName,
          highlighted: false,
          dimmed: false,
        },
      } as Node<ItemNodeData>);
      // Absolute center = cluster position + child position + half extents.
      centerById.set(it.id, {
        cx: cursorX + p.x + NODE_WIDTH / 2,
        cy: rowY + p.y + NODE_HEIGHT / 2,
      });
    }

    rowMaxHeight = Math.max(rowMaxHeight, clusterHeight);
    cursorX += clusterWidth + CLUSTER_GAP_X;
    colIndex += 1;
    if (colIndex >= cols) {
      colIndex = 0;
      cursorX = 0;
      rowY += rowMaxHeight + CLUSTER_GAP_Y;
      rowMaxHeight = 0;
    }
  }

  // Child (item) nodes must come after their parent group nodes.
  nodes.push(...childNodes);

  const edges = buildEdges(graph, centerById);

  return { nodes, edges };
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

function buildEdges(
  graph: Graph,
  centerById: Map<string, Center>,
): Edge[] {
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
