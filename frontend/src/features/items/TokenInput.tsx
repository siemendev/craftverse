import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}

/** Simple token editor: type a name + Enter (or comma) to add. */
export function TokenInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
}: Props) {
  const [draft, setDraft] = useState("");

  function add(name: string) {
    const n = name.trim();
    if (!n) return;
    if (values.some((v) => v.toLowerCase() === n.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, n]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  const remaining = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input p-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={placeholder}
          className="h-6 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {remaining.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
