import { useState } from "react";
import { ChevronDown, ChevronRight, CornerDownLeft, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TreeNode, TreeRecipeBranch } from "@/api/types";

/**
 * Recursive crafting tree. Multiple recipes render as parallel OR-branches.
 * Cyclic nodes show a "↩ cyclic" marker and stop.
 *
 * Phase-2 hook: `inventoryLookup(itemId)` is threaded through so a later
 * inventory feature can render green "have it" markers without restructuring.
 */
interface TreeProps {
  root: TreeNode;
  /** Phase 2: return owned-quantity for an item (undefined => no inventory). */
  inventoryLookup?: (itemId: string) => number | undefined;
}

export function CraftingTree({ root, inventoryLookup }: TreeProps) {
  return (
    <div className="text-sm">
      <TreeNodeView node={root} depth={0} isRoot inventoryLookup={inventoryLookup} />
    </div>
  );
}

function TreeNodeView({
  node,
  depth,
  isRoot = false,
  inventoryLookup,
}: {
  node: TreeNode;
  depth: number;
  isRoot?: boolean;
  inventoryLookup?: (itemId: string) => number | undefined;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.recipes.length > 0 && !node.cyclic;
  const owned = inventoryLookup?.(node.itemId);

  return (
    <div className={cn(!isRoot && "border-l border-border/60 pl-3")}>
      <div className="flex items-center gap-1.5 py-1">
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}

        {!isRoot && node.quantity > 1 && (
          <span className="text-xs font-semibold text-primary">
            {node.quantity}×
          </span>
        )}
        <span className="font-medium">{node.itemName}</span>

        {node.isRaw && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            raw
          </Badge>
        )}
        {node.cyclic && (
          <span className="inline-flex items-center gap-0.5 rounded bg-destructive/20 px-1.5 py-0 text-[10px] text-destructive-foreground">
            <CornerDownLeft className="h-3 w-3" /> cyclic
          </span>
        )}
        {/* Phase-2 inventory marker placeholder. */}
        {owned !== undefined && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0 text-[10px] text-emerald-300">
            have {owned}
          </span>
        )}
      </div>

      {open && hasChildren && (
        <div className="ml-2">
          {node.recipes.length > 1 ? (
            node.recipes.map((branch, i) => (
              <OrBranch
                key={branch.recipeId}
                branch={branch}
                index={i}
                depth={depth}
                inventoryLookup={inventoryLookup}
              />
            ))
          ) : (
            <SingleRecipe
              branch={node.recipes[0]}
              depth={depth}
              inventoryLookup={inventoryLookup}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RecipeMeta({ branch }: { branch: TreeRecipeBranch }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground">
      {branch.locations.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {branch.locations.map((l) => l.name).join(", ")}
        </span>
      )}
    </div>
  );
}

function SingleRecipe({
  branch,
  depth,
  inventoryLookup,
}: {
  branch: TreeRecipeBranch;
  depth: number;
  inventoryLookup?: (itemId: string) => number | undefined;
}) {
  return (
    <div className="border-l border-border/60 pl-3">
      <RecipeMeta branch={branch} />
      {branch.ingredients.map((ing) => (
        <TreeNodeView
          key={ing.itemId + branch.recipeId}
          node={ing}
          depth={depth + 1}
          inventoryLookup={inventoryLookup}
        />
      ))}
    </div>
  );
}

function OrBranch({
  branch,
  index,
  depth,
  inventoryLookup,
}: {
  branch: TreeRecipeBranch;
  index: number;
  depth: number;
  inventoryLookup?: (itemId: string) => number | undefined;
}) {
  return (
    <div className="mt-1 rounded-md border border-border/50 bg-card/40 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
        {index === 0 ? "Recipe" : "OR — alternative recipe"}
      </div>
      <RecipeMeta branch={branch} />
      {branch.ingredients.map((ing) => (
        <TreeNodeView
          key={ing.itemId + branch.recipeId}
          node={ing}
          depth={depth + 1}
          inventoryLookup={inventoryLookup}
        />
      ))}
    </div>
  );
}
