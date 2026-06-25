import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
import type { Currency } from "@/api/types";

/**
 * Manages an atlas's list of currencies and which one is the default. The
 * default currency is preselected when entering item prices.
 */
export function CurrenciesDialog({
  atlasId,
  atlasName,
  open,
  onOpenChange,
}: {
  atlasId: string;
  atlasName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (title: string, e: unknown) =>
      toast({
        title,
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
    [toast],
  );

  const load = useCallback(async () => {
    try {
      setCurrencies(await api.listCurrencies(atlasId));
    } catch (e) {
      fail("Failed to load currencies", e);
    }
  }, [atlasId, fail]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createCurrency(atlasId, { name });
      setNewName("");
      await load();
    } catch (e) {
      fail("Failed to add currency", e);
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    try {
      await api.updateCurrency(id, { isDefault: true });
      await load();
    } catch (e) {
      fail("Failed to set default", e);
    }
  }

  async function rename(id: string, name: string) {
    const trimmed = name.trim();
    const current = currencies.find((c) => c.id === id);
    if (!trimmed || !current || current.name === trimmed) return;
    try {
      await api.updateCurrency(id, { name: trimmed });
      await load();
    } catch (e) {
      fail("Failed to rename currency", e);
      void load();
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteCurrency(id);
      await load();
    } catch (e) {
      fail("Failed to delete currency", e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Currencies</DialogTitle>
          <DialogDescription>
            Currencies for &ldquo;{atlasName}&rdquo;. The default is preselected
            when entering prices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {currencies.length === 0 && (
            <p className="text-sm text-muted-foreground">No currencies yet.</p>
          )}
          {currencies.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <label
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title="Default currency"
              >
                <input
                  type="radio"
                  name="default-currency"
                  checked={c.isDefault}
                  onChange={() => void setDefault(c.id)}
                />
                Default
              </label>
              <Input
                key={c.id + ":" + c.name}
                defaultValue={c.name}
                onBlur={(e) => void rename(c.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-8 flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => void remove(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="New currency (e.g. Gold)"
            className="h-8 flex-1"
          />
          <Button
            size="sm"
            onClick={() => void add()}
            disabled={busy || !newName.trim()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
