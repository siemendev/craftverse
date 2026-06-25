import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Location } from "@/api/types";

interface Props {
  /** All locations defined in the atlas. */
  locations: Location[];
  /** Currently selected location (a relation, referenced by id). */
  value: Location | null;
  onChange: (loc: Location) => void;
  /** Create a new atlas location by name; returns the persisted entity. */
  onCreate: (name: string) => Promise<Location | null>;
  placeholder?: string;
}

/**
 * Single-select for an atlas location: picks an existing location (by id) or
 * creates a new one. The selection is a relation, not free text. Mirrors
 * {@link LocationSelect} but holds a single value (used per price row).
 */
export function LocationPicker({
  locations,
  value,
  onChange,
  onCreate,
  placeholder = "Select location…",
}: Props) {
  const [open, setOpen] = useState(value === null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = locations.filter((l) => l.name.toLowerCase().includes(q));
  const canCreate =
    query.trim().length > 0 &&
    !locations.some((l) => l.name.toLowerCase() === query.trim().toLowerCase());

  function pick(loc: Location) {
    onChange(loc);
    setQuery("");
    setOpen(false);
  }

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const loc = await onCreate(query.trim());
      if (loc) pick(loc);
    } finally {
      setCreating(false);
    }
  }

  if (value && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 text-sm hover:bg-accent/40"
      >
        <span className="truncate">{value.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
    );
  }

  return (
    <Command
      shouldFilter={false}
      className="flex-1 rounded-md border border-border bg-popover"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        autoFocus
      />
      <CommandList>
        {filtered.length === 0 && !canCreate && (
          <CommandEmpty>No locations found.</CommandEmpty>
        )}
        {filtered.length > 0 && (
          <CommandGroup heading="Locations">
            {filtered.slice(0, 50).map((l) => (
              <CommandItem key={l.id} value={l.id} onSelect={() => pick(l)}>
                {l.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {canCreate && (
          <CommandGroup heading="Create">
            <CommandItem
              value={`__create__${query}`}
              onSelect={() => void create()}
            >
              + Create &ldquo;{query.trim()}&rdquo;
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
