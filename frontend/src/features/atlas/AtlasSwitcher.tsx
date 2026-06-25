import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/api/client";
import { useAppAuth } from "@/auth/auth";
import { useAtlas } from "./AtlasContext";

export function AtlasSwitcher() {
  const { atlases, selectedAtlas, selectAtlas, refresh } = useAtlas();
  const { isAuthenticated: canEdit } = useAppAuth();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function doCreate() {
    if (!nameDraft.trim()) return;
    setBusy(true);
    try {
      const a = await api.createAtlas({ name: nameDraft.trim() });
      await refresh();
      selectAtlas(a.id);
      toast({ title: `Atlas "${a.name}" created` });
      setCreateOpen(false);
      setNameDraft("");
    } catch (e) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doRename() {
    if (!selectedAtlas || !nameDraft.trim()) return;
    setBusy(true);
    try {
      await api.updateAtlas(selectedAtlas.id, { name: nameDraft.trim() });
      await refresh();
      toast({ title: "Atlas renamed" });
      setRenameOpen(false);
    } catch (e) {
      toast({
        title: "Rename failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!selectedAtlas) return;
    setBusy(true);
    try {
      await api.deleteAtlas(selectedAtlas.id);
      await refresh();
      toast({ title: "Atlas deleted" });
      setDeleteOpen(false);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between border-border/60 bg-card/60 sm:w-auto sm:min-w-[180px]"
          >
            <span className="truncate">
              {selectedAtlas?.name ?? "Select atlas"}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px] p-0">
          <Command>
            <CommandInput placeholder="Search atlases…" />
            <CommandList>
              <CommandEmpty>No atlases.</CommandEmpty>
              <CommandGroup heading="Atlases">
                {atlases.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.name}
                    onSelect={() => {
                      selectAtlas(a.id);
                      setMenuOpen(false);
                    }}
                  >
                    <Check
                      className={
                        "mr-2 h-4 w-4 " +
                        (selectedAtlas?.id === a.id ? "opacity-100" : "opacity-0")
                      }
                    />
                    <span className="truncate">{a.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {canEdit && (
              <CommandGroup heading="Manage">
                <CommandItem
                  value="__new__"
                  onSelect={() => {
                    setNameDraft("");
                    setCreateOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> New atlas
                </CommandItem>
                <CommandItem
                  value="__rename__"
                  disabled={!selectedAtlas}
                  onSelect={() => {
                    if (!selectedAtlas) return;
                    setNameDraft(selectedAtlas.name);
                    setRenameOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Rename current
                </CommandItem>
                <CommandItem
                  value="__delete__"
                  disabled={!selectedAtlas}
                  onSelect={() => {
                    if (!selectedAtlas) return;
                    setDeleteOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete current
                </CommandItem>
              </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New atlas</DialogTitle>
            <DialogDescription>Give your game database a name.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doCreate()}
            placeholder="Atlas name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doCreate} disabled={busy || !nameDraft.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename atlas</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doRename()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doRename} disabled={busy || !nameDraft.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{selectedAtlas?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This permanently deletes the atlas and all its items, recipes,
              locations, and tags.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
