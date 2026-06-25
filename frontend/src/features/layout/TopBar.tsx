import { LogIn, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/auth/auth";
import { AtlasSwitcher } from "@/features/atlas/AtlasSwitcher";

export function TopBar() {
  const { isAuthenticated, displayName, login, logout } = useAppAuth();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-4 backdrop-blur">
      <span className="shrink-0 text-lg font-semibold tracking-tight">
        Craftverse
      </span>

      <div className="min-w-0 flex-1 sm:flex-none">
        <AtlasSwitcher />
      </div>

      {isAuthenticated ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="shrink-0 gap-2 border-border/60 bg-card/60 sm:ml-auto"
              aria-label="Account menu"
            >
              <User className="h-4 w-4 shrink-0" />
              <span className="hidden max-w-[160px] truncate sm:inline">
                {displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          className="shrink-0 gap-2 sm:ml-auto"
          onClick={() => login()}
          aria-label="Log in"
        >
          <LogIn className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Log in</span>
        </Button>
      )}
    </header>
  );
}
