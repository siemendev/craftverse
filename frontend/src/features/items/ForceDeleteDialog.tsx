import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ApiErrorBody } from "@/api/types";

interface Props {
  body: ApiErrorBody | null | undefined;
  itemName: string;
  onCancel: () => void;
  onForceDelete: () => void;
}

/**
 * Shown when DELETE returns 409 item_in_use. Lists where the item is used as
 * an ingredient and offers a "Force delete" (calls ?force=true).
 */
export function ForceDeleteDialog({
  body,
  itemName,
  onCancel,
  onForceDelete,
}: Props) {
  const usedIn = body?.error?.details?.usedIn ?? [];
  const open = !!body;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cannot delete &ldquo;{itemName}&rdquo;</DialogTitle>
          <DialogDescription>
            This item is used as an ingredient in other recipes. Forcing the
            delete will also remove those ingredient references.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-card/40 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Used in
          </div>
          {usedIn.length === 0 ? (
            <p className="text-muted-foreground">No usage details provided.</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {usedIn.map((u) => (
                <li key={u.recipeId}>{u.outputItemName}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onForceDelete}>
            Force delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
