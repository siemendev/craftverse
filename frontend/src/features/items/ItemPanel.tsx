import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, GitBranch } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/api/client";
import { useAppAuth } from "@/auth/auth";
import type { Item, ItemDetail, Recipe, TreeNode } from "@/api/types";
import { TokenInput } from "./TokenInput";
import { ItemAutocomplete } from "./ItemAutocomplete";
import { CraftingTree } from "./CraftingTree";
import { ForceDeleteDialog } from "./ForceDeleteDialog";

interface Props {
  itemId: string | null;
  atlasId: string;
  /** All items in atlas (for ingredient autocomplete). */
  items: Item[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refetch graph + caches after a mutation. */
  onChanged: () => void;
  /** Called after a new item is created (create mode). */
  onCreated?: (id: string) => void;
}

export function ItemPanel({
  itemId,
  atlasId,
  items,
  open,
  onOpenChange,
  onChanged,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const { isAuthenticated: canEdit } = useAppAuth();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"edit" | "tree">("edit");

  // editable fields
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteUsage, setDeleteUsage] =
    useState<ApiError["body"] | null>(null);

  // Create mode: drawer is open for a brand-new (not-yet-saved) item.
  const isCreate = open && !itemId;

  // Duplicate check: in create mode, surface existing items whose name matches
  // what's being typed, so the user can jump to the existing one instead of
  // creating a duplicate. Exact (case-insensitive) matches rank first.
  const nameQuery = name.trim().toLowerCase();
  const duplicateMatches = useMemo(() => {
    if (!isCreate || nameQuery.length < 2) return [];
    return items
      .filter((i) => i.name.toLowerCase().includes(nameQuery))
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === nameQuery ? 0 : 1;
        const bExact = b.name.toLowerCase() === nameQuery ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.name.length - b.name.length;
      })
      .slice(0, 6);
  }, [isCreate, nameQuery, items]);
  const hasExactDuplicate = duplicateMatches.some(
    (i) => i.name.toLowerCase() === nameQuery,
  );

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const d = await api.getItem(itemId);
      setDetail(d);
      setName(d.name);
      setNotes(d.notes ?? "");
      setTagNames(d.tags.map((t) => t.name));
    } catch (e) {
      toast({
        title: "Failed to load item",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [itemId, toast]);

  useEffect(() => {
    if (!open) return;
    setTab("edit");
    setTree(null);
    if (itemId) {
      void load();
    } else {
      // Entering create mode: blank form for a new item.
      setDetail(null);
      setName("");
      setNotes("");
      setTagNames([]);
    }
  }, [open, itemId, load]);

  async function createItemNow() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await api.createItem(atlasId, {
        name: trimmed,
        notes: notes.trim() || undefined,
        tagNames,
      });
      toast({ title: "Item created" });
      onChanged();
      // Hand control to the parent, which switches the drawer to the new item
      // (edit mode) so recipes can be added immediately.
      onCreated?.(created.id);
    } catch (e) {
      toast({
        title: "Failed to create item",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const loadTree = useCallback(async () => {
    if (!itemId) return;
    try {
      setTree(await api.getTree(itemId));
    } catch (e) {
      toast({
        title: "Failed to load crafting tree",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [itemId, toast]);

  async function saveItem() {
    if (!itemId) return;
    setSaving(true);
    try {
      await api.updateItem(itemId, { name, notes, tagNames });
      toast({ title: "Saved" });
      onChanged();
      await load();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(force: boolean) {
    if (!itemId) return;
    try {
      await api.deleteItem(itemId, force);
      toast({ title: "Item deleted" });
      setDeleteUsage(null);
      onOpenChange(false);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDeleteUsage(e.body ?? null);
      } else {
        toast({
          title: "Delete failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isCreate ? "New item" : (detail?.name ?? "Item")}
          </SheetTitle>
          <SheetDescription>
            {isCreate
              ? "Name your new item. Recipes can be added once it's created."
              : canEdit
                ? "Edit item, recipes, and view its crafting tree."
                : "View this item, its recipes, and crafting tree."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 border-b border-border px-6">
          <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
            {canEdit ? "Edit" : "Details"}
          </TabButton>
          {!isCreate && (
            <TabButton
              active={tab === "tree"}
              onClick={() => {
                setTab("tree");
                if (!tree) void loadTree();
              }}
            >
              <GitBranch className="mr-1 h-3.5 w-3.5" /> Crafting tree
            </TabButton>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === "edit" && (detail || isCreate) && (
            <div className="space-y-5">
              <Field label="Name">
                <Input
                  value={name}
                  autoFocus={isCreate}
                  disabled={!canEdit}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (isCreate && e.key === "Enter") void createItemNow();
                  }}
                  placeholder={isCreate ? "e.g. Engine" : undefined}
                />
              </Field>
              {isCreate && duplicateMatches.length > 0 && (
                <div className="rounded-md border border-border bg-card/50 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    {hasExactDuplicate
                      ? "An item with this name already exists. Did you mean:"
                      : "Did you mean one of these existing items?"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {duplicateMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onCreated?.(m.id)}
                        className="rounded-md border border-border bg-secondary px-2 py-1 text-sm text-secondary-foreground transition-colors hover:bg-secondary/70"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Field label="Notes">
                {canEdit ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {notes || "—"}
                  </p>
                )}
              </Field>
              <Field label="Tags">
                {canEdit ? (
                  <TokenInput values={tagNames} onChange={setTagNames} placeholder="Add tag…" />
                ) : tagNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tagNames.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </Field>
              {canEdit && (
                <div className="flex gap-2">
                  {isCreate ? (
                    <Button onClick={() => void createItemNow()} disabled={saving || !name.trim()}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Plus className="h-4 w-4" /> Create item
                    </Button>
                  ) : (
                    <>
                      <Button onClick={saveItem} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void doDelete(false)}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              )}

              {!isCreate && detail && (
                <>
                  <hr className="border-border" />

                  <RecipesSection
                    detail={detail}
                    atlasId={atlasId}
                    items={items}
                    canEdit={canEdit}
                    onChanged={() => {
                      onChanged();
                      void load();
                    }}
                  />
                </>
              )}
            </div>
          )}

          {tab === "tree" && (
            <div>
              {tree ? (
                <CraftingTree root={tree} />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading tree…
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>

      <ForceDeleteDialog
        body={deleteUsage}
        itemName={detail?.name ?? ""}
        onCancel={() => setDeleteUsage(null)}
        onForceDelete={() => void doDelete(true)}
      />
    </Sheet>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center border-b-2 px-3 py-2 text-sm transition-colors " +
        (active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---- Recipes editor ------------------------------------------------------

interface IngredientDraft {
  itemId: string;
  itemName: string;
  quantity: number;
}

function RecipesSection({
  detail,
  atlasId,
  items,
  canEdit,
  onChanged,
}: {
  detail: ItemDetail;
  atlasId: string;
  items: Item[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draftIngredients, setDraftIngredients] = useState<IngredientDraft[]>([]);
  const [draftLocations, setDraftLocations] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function reset() {
    setDraftIngredients([]);
    setDraftLocations([]);
    setAdding(false);
  }

  async function createRecipe() {
    setBusy(true);
    try {
      await api.createRecipe(detail.id, {
        ingredients: draftIngredients.map((i) => ({
          itemId: i.itemId,
          quantity: i.quantity,
        })),
        locationNames: draftLocations.length ? draftLocations : undefined,
      });
      toast({ title: "Recipe added" });
      reset();
      onChanged();
    } catch (e) {
      toast({
        title: "Failed to add recipe",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecipe(id: string) {
    try {
      await api.deleteRecipe(id);
      toast({ title: "Recipe deleted" });
      onChanged();
    } catch (e) {
      toast({
        title: "Failed to delete recipe",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recipes</h3>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add recipe
          </Button>
        )}
      </div>

      {detail.recipes.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          No recipes — this item is treated as a raw material.
        </p>
      )}

      {detail.recipes.map((r) => (
        <ExistingRecipe
          key={r.id}
          recipe={r}
          canEdit={canEdit}
          onDelete={() => void deleteRecipe(r.id)}
        />
      ))}

      {adding && (
        <div className="space-y-3 rounded-md border border-border bg-card/50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            New recipe
          </div>

          <div className="space-y-1.5">
            {draftIngredients.map((ing, idx) => (
              <div key={ing.itemId} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{ing.itemName}</span>
                <Input
                  type="number"
                  min={1}
                  value={ing.quantity}
                  onChange={(e) =>
                    setDraftIngredients((arr) =>
                      arr.map((x, i) =>
                        i === idx
                          ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) }
                          : x,
                      ),
                    )
                  }
                  className="h-7 w-16"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() =>
                    setDraftIngredients((arr) => arr.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <ItemAutocomplete
            items={items}
            excludeIds={[
              detail.id,
              ...draftIngredients.map((i) => i.itemId),
            ]}
            placeholder="Add ingredient…"
            onSelect={(it) =>
              setDraftIngredients((arr) => [
                ...arr,
                { itemId: it.id, itemName: it.name, quantity: 1 },
              ])
            }
            onCreate={async (createName) => {
              try {
                const created = await api.createItem(atlasId, { name: createName });
                setDraftIngredients((arr) => [
                  ...arr,
                  { itemId: created.id, itemName: created.name, quantity: 1 },
                ]);
                onChanged();
              } catch (e) {
                toast({
                  title: "Failed to create item",
                  description: e instanceof Error ? e.message : String(e),
                  variant: "destructive",
                });
              }
            }}
          />

          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Locations (on-the-fly)
            </span>
            <TokenInput
              values={draftLocations}
              onChange={setDraftLocations}
              placeholder="Add location…"
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={createRecipe} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create recipe
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExistingRecipe({
  recipe,
  canEdit,
  onDelete,
}: {
  recipe: Recipe;
  canEdit: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {recipe.locations.length > 0
              ? `@ ${recipe.locations.map((l) => l.name).join(", ")}`
              : "Recipe"}
          </span>
        </div>
        {canEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {recipe.ingredients.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ingredients.</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="flex justify-between">
              <span>{ing.itemName}</span>
              <span className="text-muted-foreground">×{ing.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
