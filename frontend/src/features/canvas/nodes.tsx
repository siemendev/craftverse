import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { ClusterNodeData, ItemNodeData } from "./layout";
import { FloatingEdge } from "./FloatingEdge";

// One connection point per side. With ConnectionMode.Loose each can act as
// source or target; floating edges then attach to whichever side faces the
// other node. Handles fade in on node hover to keep the canvas calm.
const SIDES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
] as const;

function tagAccent(data: ItemNodeData): string | undefined {
  const withColor = data.item.tags.find((t) => t.color);
  return withColor?.color ?? undefined;
}

export const ItemNode = memo(function ItemNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ItemNodeData;
  const accent = tagAccent(d);
  return (
    <div
      className={cn(
        "group relative flex h-[56px] w-[180px] flex-col justify-center rounded-lg border bg-card px-3 text-card-foreground transition-colors",
        "border-border hover:border-primary/70",
        selected && "border-primary ring-2 ring-primary/50",
        d.highlighted && "border-primary ring-2 ring-primary",
        d.dimmed && "opacity-35",
      )}
      style={
        // Cheap inset accent bar only — no outer blur glow (box-shadow blur on
        // many nodes is a repaint cost during pan/zoom).
        accent ? { boxShadow: `inset 3px 0 0 0 ${accent}` } : undefined
      }
    >
      {SIDES.map((s) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={s.position}
          isConnectable
          className="!h-2 !w-2 !bg-primary/70 opacity-0 transition-opacity group-hover:opacity-100"
        />
      ))}
      <div className="truncate text-sm font-medium">{d.item.name}</div>
      <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
        {d.item.isRaw ? (
          <span className="rounded bg-secondary px-1 py-px">raw</span>
        ) : null}
        {d.item.tags.slice(0, 2).map((t) => (
          <span
            key={t.id}
            className="rounded px-1 py-px"
            style={{
              backgroundColor: t.color ? `${t.color}33` : "hsl(var(--secondary))",
              color: t.color ?? undefined,
            }}
          >
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
});

export const ClusterNode = memo(function ClusterNode({ data }: NodeProps) {
  const d = data as ClusterNodeData;
  return (
    <div className="pointer-events-none h-full w-full rounded-2xl border border-dashed border-primary/25 bg-primary/5">
      <div className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-primary/70">
        {d.label}
      </div>
    </div>
  );
});

export const nodeTypes = {
  item: ItemNode,
  cluster: ClusterNode,
};

export const edgeTypes = {
  floating: FloatingEdge,
};
