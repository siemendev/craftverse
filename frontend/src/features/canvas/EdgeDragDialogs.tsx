import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ItemSummary, RecipeSummary } from "@/api/types";

/** Popup to disambiguate which recipe an edge-drag ingredient should join. */
export interface AmbiguousState {
  outputItem: ItemSummary;
  ingredientItem: ItemSummary;
  recipeIds: string[];
}

export function AmbiguousRecipeDialog({
  state,
  recipes,
  onCancel,
  onPick,
}: {
  state: AmbiguousState | null;
  recipes: RecipeSummary[];
  onCancel: () => void;
  onPick: (recipeId: string, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    if (state) setQuantity(1);
  }, [state]);

  if (!state) return null;
  const candidate = state.recipeIds
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is RecipeSummary => !!r);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which recipe?</DialogTitle>
          <DialogDescription>
            &ldquo;{state.outputItem.name}&rdquo; has multiple recipes. Add{" "}
            &ldquo;{state.ingredientItem.name}&rdquo; to which one?
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-sm">
          Quantity
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20"
          />
        </label>

        <div className="space-y-1.5">
          {(candidate.length ? candidate : state.recipeIds.map((id) => ({ id }))).map(
            (r, i) => (
              <Button
                key={r.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => onPick(r.id, quantity)}
              >
                <span>Recipe {i + 1}</span>
              </Button>
            ),
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline "create new item" flow when an edge is dropped on empty canvas. */
export interface CreateOnDropState {
  sourceItem: ItemSummary;
}

export function CreateItemOnDropDialog({
  state,
  onCancel,
  onCreate,
}: {
  state: CreateOnDropState | null;
  onCancel: () => void;
  onCreate: (name: string, quantity: number) => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (state) {
      setName("");
      setQuantity(1);
    }
  }, [state]);

  if (!state) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New item from connection</DialogTitle>
          <DialogDescription>
            Create a new item and wire &ldquo;{state.sourceItem.name}&rdquo; as
            one of its ingredients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              New item name
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engine"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Quantity of {state.sourceItem.name}
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
              className="h-8 w-20"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), quantity)}
          >
            Create &amp; connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
