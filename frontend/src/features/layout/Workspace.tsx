import { useCallback, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { api } from "@/api/client";
import { useAppAuth } from "@/auth/auth";
import { useAsync } from "@/hooks/useAsync";
import { useAtlas } from "@/features/atlas/AtlasContext";
import { Canvas } from "@/features/canvas/Canvas";
import { ItemPanel } from "@/features/items/ItemPanel";
import { Button } from "@/components/ui/button";

export function Workspace() {
  const { selectedAtlasId, atlases, loading: atlasLoading } = useAtlas();
  const { isAuthenticated: canEdit } = useAppAuth();

  if (atlasLoading) {
    return <FullCenter><Loader2 className="h-6 w-6 animate-spin" /></FullCenter>;
  }

  if (atlases.length === 0) {
    return <NoAtlasState canEdit={canEdit} />;
  }

  if (!selectedAtlasId) {
    return (
      <FullCenter>
        <p className="text-muted-foreground">Select an atlas to begin.</p>
      </FullCenter>
    );
  }

  return <AtlasWorkspace key={selectedAtlasId} atlasId={selectedAtlasId} />;
}

function AtlasWorkspace({ atlasId }: { atlasId: string }) {
  const { isAuthenticated: canEdit } = useAppAuth();
  const { dataVersion } = useAtlas();
  const [panelItemId, setPanelItemId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // dataVersion lets cross-cutting edits (e.g. location detail changes from the
  // atlas switcher) ask this view to refetch.
  const graphState = useAsync(() => api.getGraph(atlasId), [atlasId, dataVersion]);
  const itemsState = useAsync(() => api.listItems(atlasId), [atlasId, dataVersion]);
  const locationsState = useAsync(
    () => api.listLocations(atlasId),
    [atlasId, dataVersion],
  );

  const refetchAll = useCallback(() => {
    graphState.refetch();
    itemsState.refetch();
    locationsState.refetch();
  }, [graphState, itemsState, locationsState]);

  const openItem = useCallback((id: string) => {
    setPanelItemId(id);
    setPanelOpen(true);
  }, []);

  // Open the drawer for a brand-new item (no native prompt).
  const openNewItem = useCallback(() => {
    setPanelItemId(null);
    setPanelOpen(true);
  }, []);

  // After the drawer creates the item, switch it to the saved item so recipes
  // can be added immediately.
  const handleCreated = useCallback(
    (id: string) => {
      refetchAll();
      setPanelItemId(id);
    },
    [refetchAll],
  );

  if (graphState.loading && !graphState.data) {
    return <FullCenter><Loader2 className="h-6 w-6 animate-spin" /></FullCenter>;
  }

  if (graphState.error) {
    return (
      <FullCenter>
        <p className="text-destructive-foreground">Failed to load atlas graph.</p>
        <Button variant="outline" onClick={() => graphState.refetch()}>
          Retry
        </Button>
      </FullCenter>
    );
  }

  const graph = graphState.data!;
  const empty = graph.items.length === 0;

  return (
    <div className="relative h-full w-full">
      {empty ? (
        <EmptyCanvasHint canEdit={canEdit} onCreate={openNewItem} />
      ) : (
        <>
          <Canvas
            graph={graph}
            allItems={itemsState.data ?? []}
            locations={locationsState.data ?? []}
            onOpenItem={openItem}
            onChanged={refetchAll}
          />
          {canEdit && (
            <Button
              onClick={openNewItem}
              className="absolute right-4 top-4 z-10 shadow-lg"
            >
              <Plus className="h-4 w-4" /> New item
            </Button>
          )}
        </>
      )}

      <ItemPanel
        itemId={panelItemId}
        atlasId={atlasId}
        items={itemsState.data ?? []}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={refetchAll}
        onCreated={handleCreated}
      />
    </div>
  );
}

function NoAtlasState({ canEdit }: { canEdit: boolean }) {
  return (
    <FullCenter className="cv-universe-bg">
      <Sparkles className="h-10 w-10 text-primary" />
      <h2 className="text-xl font-semibold">Welcome to Craftverse</h2>
      <p className="max-w-sm text-center text-muted-foreground">
        {canEdit
          ? "There are no atlases yet. Create your first atlas using the switcher in the top-left to start mapping a game's crafting universe."
          : "There are no atlases yet. Log in to create the first one."}
      </p>
    </FullCenter>
  );
}

function EmptyCanvasHint({
  canEdit,
  onCreate,
}: {
  canEdit: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="cv-universe-bg flex h-full w-full flex-col items-center justify-center gap-4">
      <Sparkles className="h-10 w-10 text-primary/70" />
      <h2 className="text-lg font-medium">This atlas is empty</h2>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {canEdit
          ? "Add your first item to start building the crafting graph. Then draw edges between items to define recipes."
          : "There are no items in this atlas yet. Log in to start building the crafting graph."}
      </p>
      {canEdit && (
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" /> Add first item
        </Button>
      )}
    </div>
  );
}

function FullCenter({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex h-full w-full flex-col items-center justify-center gap-3 " +
        className
      }
    >
      {children}
    </div>
  );
}
