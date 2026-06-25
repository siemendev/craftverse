import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { AppAuthProvider } from "@/auth/auth";
import { AtlasProvider, useAtlas } from "@/features/atlas/AtlasContext";
import { LocationEditProvider } from "@/features/items/LocationEditProvider";
import { TopBar } from "@/features/layout/TopBar";
import { Workspace } from "@/features/layout/Workspace";

export default function App() {
  return (
    <AppAuthProvider>
      <ToastProvider>
        <TooltipProvider delayDuration={300}>
          <AtlasProvider>
            <AppShell />
          </AtlasProvider>
        </TooltipProvider>
      </ToastProvider>
    </AppAuthProvider>
  );
}

function AppShell() {
  const { bumpData } = useAtlas();
  return (
    // The location editor sits above the whole shell so the atlas switcher and
    // the canvas/item panel share one modal; saves bump atlas-scoped views.
    <LocationEditProvider onChanged={bumpData}>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <TopBar />
        <main className="relative flex-1 overflow-hidden">
          <Workspace />
        </main>
      </div>
    </LocationEditProvider>
  );
}
