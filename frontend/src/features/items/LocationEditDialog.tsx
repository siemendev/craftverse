import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/api/client";
import type { Location } from "@/api/types";

interface Props {
  /** The location to edit; null keeps the dialog closed/empty. */
  location: Location | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save or delete so the caller can refresh. */
  onSaved: () => void;
}

/** Modal to edit a single location's name, description, and address. */
export function LocationEditDialog({ location, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed from the passed location for an instant render, then fetch the full
  // record — some call sites (e.g. the crafting tree) only carry id+name, so we
  // must not let a partial object blank out description/address on save.
  useEffect(() => {
    if (!open || !location) return;
    setName(location.name);
    setDescription(location.description ?? "");
    setAddress(location.address ?? "");
    let cancelled = false;
    api
      .getLocation(location.id)
      .then((full) => {
        if (cancelled) return;
        setName(full.name);
        setDescription(full.description ?? "");
        setAddress(full.address ?? "");
      })
      .catch(() => {
        /* keep the seeded values if the refetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [open, location]);

  async function save() {
    if (!location || !name.trim()) return;
    setSaving(true);
    try {
      await api.updateLocation(location.id, {
        name: name.trim(),
        description: description.trim() || null,
        address: address.trim() || null,
      });
      toast({ title: "Location saved" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Failed to save location",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!location) return;
    setDeleting(true);
    try {
      await api.deleteLocation(location.id);
      toast({ title: "Location deleted" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.body?.error?.details as
          | { recipeCount?: number; priceCount?: number }
          | undefined;
        const parts = [
          d?.recipeCount ? `${d.recipeCount} recipe(s)` : null,
          d?.priceCount ? `${d.priceCount} price(s)` : null,
        ].filter(Boolean);
        toast({
          title: "Location is in use",
          description: `Still referenced by ${parts.join(" and ")}. Remove those first.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to delete location",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit location</DialogTitle>
          <DialogDescription>
            Maintain this location's name, notes, and address. Used across all
            recipes and prices that reference it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Forge"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description / notes
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Address
            </span>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. North district, 3rd street"
            />
          </label>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="destructive"
            onClick={() => void remove()}
            disabled={busy}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
