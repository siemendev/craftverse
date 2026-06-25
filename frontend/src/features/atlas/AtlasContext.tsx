import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/api/client";
import type { Atlas } from "@/api/types";

const LS_KEY = "craftverse.selectedAtlasId";

interface AtlasContextValue {
  atlases: Atlas[];
  loading: boolean;
  error: unknown;
  selectedAtlasId: string | null;
  selectedAtlas: Atlas | null;
  selectAtlas: (id: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AtlasContextValue | null>(null);

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [atlases, setAtlases] = useState<Atlas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);
  const [selectedAtlasId, setSelectedAtlasId] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const list = await api.listAtlases();
      setAtlases(list);
      // Reconcile selection with what actually exists.
      setSelectedAtlasId((cur) => {
        if (cur && list.some((a) => a.id === cur)) return cur;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedAtlasId) localStorage.setItem(LS_KEY, selectedAtlasId);
    else localStorage.removeItem(LS_KEY);
  }, [selectedAtlasId]);

  const selectAtlas = useCallback((id: string) => setSelectedAtlasId(id), []);

  const selectedAtlas = useMemo(
    () => atlases.find((a) => a.id === selectedAtlasId) ?? null,
    [atlases, selectedAtlasId],
  );

  const value: AtlasContextValue = {
    atlases,
    loading,
    error,
    selectedAtlasId,
    selectedAtlas,
    selectAtlas,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAtlas() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAtlas must be used within AtlasProvider");
  return ctx;
}
