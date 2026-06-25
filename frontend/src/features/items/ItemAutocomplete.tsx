import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Item, ItemSummary } from "@/api/types";

type AnyItem = Item | ItemSummary;

interface Props {
  items: AnyItem[];
  excludeIds?: string[];
  placeholder?: string;
  onSelect: (item: AnyItem) => void;
  /** When set, allows creating a new item by name. */
  onCreate?: (name: string) => void;
}

export function ItemAutocomplete({
  items,
  excludeIds = [],
  placeholder = "Search items…",
  onSelect,
  onCreate,
}: Props) {
  const [query, setQuery] = useState("");
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = items.filter(
    (i) =>
      !exclude.has(i.id) &&
      i.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const canCreate =
    onCreate &&
    query.trim().length > 0 &&
    !items.some((i) => i.name.toLowerCase() === query.trim().toLowerCase());

  return (
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
          <CommandEmpty>No items found.</CommandEmpty>
        )}
        {filtered.length > 0 && (
          <CommandGroup heading="Items">
            {filtered.slice(0, 50).map((i) => (
              <CommandItem
                key={i.id}
                value={i.id}
                onSelect={() => {
                  onSelect(i);
                  setQuery("");
                }}
              >
                {i.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {canCreate && (
          <CommandGroup heading="Create">
            <CommandItem
              value={`__create__${query}`}
              onSelect={() => {
                onCreate?.(query.trim());
                setQuery("");
              }}
            >
              + Create &ldquo;{query.trim()}&rdquo;
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
