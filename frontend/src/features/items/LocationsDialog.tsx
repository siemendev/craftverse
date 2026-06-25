import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/api/client";
import { useAtlas } from "@/features/atlas/AtlasContext";
import type { Location } from "@/api/types";
import { useLocationEditor } from "./LocationEditProvider";

interface Props {
  atlasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manage all locations of an atlas: list, search, create, and open each for
 * editing (via the shared location editor). Refetches whenever the atlas data
 * version bumps, so edits made through the shared dialog stay reflected here.
 */
export function LocationsDialog({ atlasId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { dataVersion, bumpData } = useAtlas();
  const editor = useLocationEditor();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLocations(await api.listLocations(atlasId));
    } catch (e) {
      toast({
        title: "Failed to load locations",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [atlasId, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, dataVersion]);

  async function create() {
    const n = newName.trim();
    if (!n) return;
    setCreating(true);
    try {
      await api.createLocation(atlasId, n);
      setNewName("");
      bumpData();
    } catch (e) {
      toast({
        title: "Failed to create location",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = locations.filter((l) => l.name.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Locations</DialogTitle>
          <DialogDescription>
            Crafting stations and shops in this atlas. Edit a location to
            maintain its notes and address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations…"
          />

          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {loading && locations.length === 0 ? (
              <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted-foreground">
                {locations.length === 0
                  ? "No locations yet."
                  : "No matching locations."}
              </p>
            ) : (
              filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => editor?.edit(l)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{l.name}</span>
                    {(l.address || l.description) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {l.address || l.description}
                      </span>
                    )}
                  </span>
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
                </button>
              ))
            )}
          </div>

          <div className="flex gap-2 border-t border-border pt-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              placeholder="New location name…"
            />
            <Button onClick={() => void create()} disabled={creating || !newName.trim()}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
