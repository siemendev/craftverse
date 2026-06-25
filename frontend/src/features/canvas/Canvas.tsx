import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Search, X } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { useAppAuth } from "@/auth/auth";
import type { Graph, Item, ItemSummary, Location } from "@/api/types";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  computeLayout,
  type CanvasNode,
  type ItemNodeData,
  type LayoutMode,
} from "./layout";
import { edgeTypes, nodeTypes } from "./nodes";
import type { EdgeState } from "./FloatingEdge";
import {
  AmbiguousRecipeDialog,
  CreateItemOnDropDialog,
  type AmbiguousState,
  type CreateOnDropState,
} from "./EdgeDragDialogs";

interface CanvasProps {
  graph: Graph;
  allItems: Item[];
  locations: Location[];
  onOpenItem: (itemId: string) => void;
  onChanged: () => void;
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ graph, onOpenItem, onChanged }: CanvasProps) {
  const { toast } = useToast();
  const { isAuthenticated: canEdit } = useAppAuth();
  const rf = useReactFlow();
  const [search, setSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const itemsById = useMemo(() => {
    const m = new Map<string, ItemSummary>();
    for (const it of graph.items) m.set(it.id, it);
    return m;
  }, [graph.items]);

  // Controlled node/edge state. Using the React Flow state hooks (with the
  // matching onNodesChange/onEdgesChange handlers below) lets React Flow apply
  // drag/selection changes internally and efficiently — without them, dragging
  // is laggy because position changes are never committed.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Container size drives the aspect-ratio shaping of the force layout
  // (portrait → taller, landscape → wider). We keep the raw dimensions in a ref
  // and only re-layout when the aspect *bucket* flips, not on every pixel.
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      viewportRef.current = { width: r.width, height: r.height };
      if (r.height > 0) setAspect(Math.round((r.width / r.height) * 4) / 4);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Layout mode: "radial" (dynamic depth onion) or "clusters" (location boxes).
  // Remembered across sessions.
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    () => (localStorage.getItem("cv-layout-mode") as LayoutMode) || "radial",
  );
  const changeLayout = useCallback((m: LayoutMode) => {
    localStorage.setItem("cv-layout-mode", m);
    setLayoutMode(m);
  }, []);

  // Base layout: node positions are computed only when the graph, aspect or
  // layout mode changes — not on hover/search — so highlighting never resets
  // positions or relayouts. We fit the view on first layout, aspect flips and
  // mode switches, but not on plain graph edits (the layout is deterministic,
  // so positions stay stable).
  const fitKeyRef = useRef<string>("");
  useEffect(() => {
    if (viewportRef.current.width === 0) return;
    const layout = computeLayout(graph, layoutMode, viewportRef.current);
    setNodes(layout.nodes);
    setEdges(layout.edges);
    const fitKey = `${layoutMode}|${aspect}`;
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      setTimeout(() => rf.fitView({ duration: 300, padding: 0.2 }), 60);
    }
  }, [graph, aspect, layoutMode, setNodes, setEdges, rf]);

  // Dependency adjacency (product -> ingredient), matching the arrow direction.
  const depAdj = useMemo(() => {
    const m = new Map<string, { nodeId: string; edgeId: string }[]>();
    for (const e of graph.edges) {
      const arr = m.get(e.toItemId) ?? [];
      arr.push({ nodeId: e.fromItemId, edgeId: e.id });
      m.set(e.toItemId, arr);
    }
    return m;
  }, [graph.edges]);

  // Collect the entire dependency subtree of a node: itself plus every
  // ingredient needed, transitively, following the arrows. Returns both the
  // node set and the edge set so callers can highlight (focus effect) and zoom
  // (search) to the same set.
  const collectSubtree = useCallback(
    (rootId: string) => {
      const nodeIds = new Set<string>([rootId]);
      const edgeIds = new Set<string>();
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const { nodeId, edgeId } of depAdj.get(cur) ?? []) {
          edgeIds.add(edgeId);
          if (!nodeIds.has(nodeId)) {
            nodeIds.add(nodeId);
            queue.push(nodeId);
          }
        }
      }
      return { nodeIds, edgeIds };
    },
    [depAdj],
  );

  // Focus = hovered node (preferred) or search match. Highlights the ENTIRE
  // dependency subtree and dims the rest. Applied in place so positions are
  // preserved.
  const focusId = hoveredId ?? highlightId;

  useEffect(() => {
    const sub = focusId ? collectSubtree(focusId) : null;
    const an = sub?.nodeIds ?? null;
    const ae = sub?.edgeIds ?? null;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "item") return n;
        const d = n.data as ItemNodeData;
        const highlighted = focusId != null && n.id === focusId;
        const dimmed = an != null && !an.has(n.id);
        if (d.highlighted === highlighted && d.dimmed === dimmed) return n;
        return { ...n, data: { ...d, highlighted, dimmed } };
      }),
    );
    setEdges((eds) =>
      eds.map((e) => {
        const next: EdgeState =
          ae == null ? "normal" : ae.has(e.id) ? "active" : "dim";
        const cur =
          (e.data as { state?: EdgeState } | undefined)?.state ?? "normal";
        if (cur === next) return e;
        return { ...e, data: { ...e.data, state: next } };
      }),
    );
  }, [focusId, collectSubtree, setNodes, setEdges]);

  // Edge-drag dialog state.
  const [ambiguous, setAmbiguous] = useState<AmbiguousState | null>(null);
  const [createOnDrop, setCreateOnDrop] = useState<CreateOnDropState | null>(
    null,
  );
  const connectStart = useRef<string | null>(null);

  // --- Search: zoom-to + highlight the matching node -----------------------
  const runSearch = useCallback(
    (q: string) => {
      const term = q.trim().toLowerCase();
      if (!term) {
        setHighlightId(null);
        return;
      }
      const match = graph.items.find((i) =>
        i.name.toLowerCase().includes(term),
      );
      if (match) {
        setHighlightId(match.id);
        // Zoom to fit the whole highlighted subtree (the match plus every item
        // it depends on), not just the matched node — so all dependent items
        // are actually on screen.
        const { nodeIds } = collectSubtree(match.id);
        void rf.fitView({
          nodes: [...nodeIds].map((id) => ({ id })),
          duration: 600,
          padding: 0.25,
          maxZoom: 1.2,
        });
      } else {
        setHighlightId(null);
      }
    },
    [graph.items, rf, collectSubtree],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(search), 200);
    return () => clearTimeout(t);
  }, [search, runSearch]);

  // --- Node click opens the panel -----------------------------------------
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.type === "item") onOpenItem(node.id);
    },
    [onOpenItem],
  );

  // Hover highlights the downstream subtree (see the focus effect above).
  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    if (node.type === "item") setHoveredId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHoveredId(null), []);

  // --- Draw an edge between two existing nodes -> add ingredient ----------
  const addIngredientEdge = useCallback(
    async (fromItemId: string, toItemId: string, quantity = 1) => {
      try {
        await api.addIngredientEdge({
          outputItemId: toItemId,
          ingredientItemId: fromItemId,
          quantity,
        });
        toast({ title: "Ingredient added" });
        onChanged();
      } catch (e) {
        if (e instanceof ApiError && e.code === "ambiguous_recipe") {
          const out = itemsById.get(toItemId);
          const ing = itemsById.get(fromItemId);
          if (out && ing) {
            setAmbiguous({
              outputItem: out,
              ingredientItem: ing,
              recipeIds: e.body?.error?.details?.recipeIds ?? [],
            });
          }
        } else {
          toast({
            title: "Could not connect",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        }
      }
    },
    [itemsById, onChanged, toast],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) {
        void addIngredientEdge(c.source, c.target);
      }
    },
    [addIngredientEdge],
  );

  const onConnectStart = useCallback(
    (_: unknown, params: { nodeId: string | null }) => {
      connectStart.current = params.nodeId;
    },
    [],
  );

  // Dropping a connection on empty canvas -> create-new-item flow.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const targetIsPane =
        event.target instanceof Element &&
        event.target.classList.contains("react-flow__pane");
      const sourceId = connectStart.current;
      connectStart.current = null;
      if (targetIsPane && sourceId) {
        const src = itemsById.get(sourceId);
        if (src) setCreateOnDrop({ sourceItem: src });
      }
    },
    [itemsById],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full cv-universe-bg">
      {/* Layout switch */}
      <div className="absolute left-4 top-4 z-10 inline-flex rounded-lg border border-border/60 bg-card p-0.5 text-xs font-medium shadow-sm">
        {(
          [
            { id: "radial", label: "Radial" },
            { id: "clusters", label: "Orte" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            onClick={() => changeLayout(opt.id)}
            className={
              layoutMode === opt.id
                ? "rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
                : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search box */}
      <div className="absolute left-1/2 top-4 z-10 w-[min(420px,90vw)] -translate-x-1/2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="h-10 border-border/60 bg-card pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        defaultEdgeOptions={{ type: "floating" }}
        nodesDraggable={false}
        nodesConnectable={canEdit}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="hsl(250 30% 30% / 0.4)"
        />
        <Controls className="!bottom-4 !left-4" />
        <MiniMap
          className="!hidden sm:!block"
          pannable
          zoomable
          nodeColor={(n) =>
            n.type !== "item"
              ? "transparent"
              : (n.data as ItemNodeData)?.highlighted
                ? "hsl(258 90% 70%)"
                : "hsl(250 22% 30%)"
          }
          maskColor="hsl(248 30% 5% / 0.7)"
        />
      </ReactFlow>

      <AmbiguousRecipeDialog
        state={ambiguous}
        recipes={graph.recipes}
        onCancel={() => setAmbiguous(null)}
        onPick={async (recipeId, quantity) => {
          if (!ambiguous) return;
          try {
            await api.updateRecipe(recipeId, {
              ingredients: [
                // PATCH replaces the ingredient set, so we must include existing
                // ingredients. We fetch the output item detail to merge them.
                ...(await mergeIngredients(
                  ambiguous.outputItem.id,
                  recipeId,
                  ambiguous.ingredientItem.id,
                  quantity,
                )),
              ],
            });
            toast({ title: "Ingredient added" });
            setAmbiguous(null);
            onChanged();
          } catch (e) {
            toast({
              title: "Could not add ingredient",
              description: e instanceof Error ? e.message : String(e),
              variant: "destructive",
            });
          }
        }}
      />

      <CreateItemOnDropDialog
        state={createOnDrop}
        onCancel={() => setCreateOnDrop(null)}
        onCreate={async (name, quantity) => {
          if (!createOnDrop) return;
          try {
            // Create the new output item, then wire the source as its ingredient.
            const created = await api.createItem(graph.atlas.id, { name });
            await api.addIngredientEdge({
              outputItemId: created.id,
              ingredientItemId: createOnDrop.sourceItem.id,
              quantity,
            });
            toast({ title: `Created "${name}"` });
            setCreateOnDrop(null);
            onChanged();
          } catch (e) {
            toast({
              title: "Could not create item",
              description: e instanceof Error ? e.message : String(e),
              variant: "destructive",
            });
          }
        }}
      />
    </div>
  );
}

/**
 * The ambiguous-recipe case needs the full ingredient set since PATCH replaces
 * it. Fetch the output item's detail, find the chosen recipe, and append.
 */
async function mergeIngredients(
  outputItemId: string,
  recipeId: string,
  newIngredientItemId: string,
  quantity: number,
): Promise<{ itemId: string; quantity: number }[]> {
  const detail = await api.getItem(outputItemId);
  const recipe = detail.recipes.find((r) => r.id === recipeId);
  const existing =
    recipe?.ingredients.map((i) => ({ itemId: i.itemId, quantity: i.quantity })) ??
    [];
  if (existing.some((e) => e.itemId === newIngredientItemId)) return existing;
  return [...existing, { itemId: newIngredientItemId, quantity }];
}

// Re-export type used by callers if needed.
export type { Edge };
