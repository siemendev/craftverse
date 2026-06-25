import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { AppAuthProvider } from "@/auth/auth";
import { AtlasProvider } from "@/features/atlas/AtlasContext";
import { TopBar } from "@/features/layout/TopBar";
import { Workspace } from "@/features/layout/Workspace";

export default function App() {
  return (
    <AppAuthProvider>
      <ToastProvider>
        <TooltipProvider delayDuration={300}>
          <AtlasProvider>
            <div className="flex h-full w-full flex-col overflow-hidden">
              <TopBar />
              <main className="relative flex-1 overflow-hidden">
                <Workspace />
              </main>
            </div>
          </AtlasProvider>
        </TooltipProvider>
      </ToastProvider>
    </AppAuthProvider>
  );
}
