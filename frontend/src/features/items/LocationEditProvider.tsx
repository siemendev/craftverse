import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Pencil } from "lucide-react";
import { useAppAuth } from "@/auth/auth";
import type { Location } from "@/api/types";
import { LocationEditDialog } from "./LocationEditDialog";

interface LocationEditorValue {
  /** Open the edit modal for a location. */
  edit: (location: Location) => void;
}

const Ctx = createContext<LocationEditorValue | null>(null);

/**
 * Hosts a single shared {@link LocationEditDialog} and exposes `edit(location)`
 * so any descendant (selects, recipe lists, tree) can open it without
 * prop-drilling. Returns null when used outside the provider, letting edit
 * affordances degrade gracefully instead of crashing.
 */
export function LocationEditProvider({
  onChanged,
  children,
}: {
  /** Invoked after a save/delete so the host can refetch affected data. */
  onChanged: () => void;
  children: ReactNode;
}) {
  const [location, setLocation] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);

  const edit = useCallback((l: Location) => {
    setLocation(l);
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ edit }}>
      {children}
      <LocationEditDialog
        location={location}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </Ctx.Provider>
  );
}

export function useLocationEditor(): LocationEditorValue | null {
  return useContext(Ctx);
}

/**
 * Small pencil button rendered next to a location wherever it appears. Shows
 * only for authenticated editors and when a {@link LocationEditProvider} is in
 * scope. Stops propagation so it never triggers the surrounding row/node click.
 */
export function LocationEditButton({
  location,
  className = "",
  title = "Edit location",
}: {
  location: Location;
  className?: string;
  title?: string;
}) {
  const { isAuthenticated: canEdit } = useAppAuth();
  const editor = useLocationEditor();
  if (!canEdit || !editor) return null;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        editor.edit(location);
      }}
      className={
        "inline-flex shrink-0 items-center text-muted-foreground opacity-60 transition hover:opacity-100 " +
        className
      }
    >
      <Pencil className="h-3 w-3" />
    </button>
  );
}
