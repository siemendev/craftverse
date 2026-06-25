import { useMemo, useState } from "react";
import { X } from "lucide-react";
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
  /** Currently selected locations (a relation, referenced by id). */
  selected: Location[];
  onChange: (next: Location[]) => void;
  /** Create a new atlas location by name; returns the persisted entity. */
  onCreate: (name: string) => Promise<Location | null>;
  placeholder?: string;
}

/**
 * Multi-select for an atlas's locations: picks existing locations (by id) and
 * can create new ones. Selected locations are a relation, not free text.
 */
export function LocationSelect({
  locations,
  selected,
  onChange,
  onCreate,
  placeholder = "Add location…",
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const selectedIds = useMemo(
    () => new Set(selected.map((l) => l.id)),
    [selected],
  );

  const q = query.trim().toLowerCase();
  const filtered = locations.filter(
    (l) => !selectedIds.has(l.id) && l.name.toLowerCase().includes(q),
  );
  const canCreate =
    query.trim().length > 0 &&
    !locations.some((l) => l.name.toLowerCase() === query.trim().toLowerCase());

  function pick(loc: Location) {
    onChange([...selected, loc]);
    setQuery("");
  }

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const loc = await onCreate(query.trim());
      if (loc) onChange([...selected, loc]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
            >
              {l.name}
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x.id !== l.id))}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Command
        shouldFilter={false}
        className="rounded-md border border-border bg-popover"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
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
    </div>
  );
}
