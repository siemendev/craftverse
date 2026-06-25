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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-purple-900 shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
          <span className="text-lg font-semibold tracking-tight">
            Craftverse
          </span>
        </div>
        <AtlasSwitcher />
      </div>

      {isAuthenticated ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <User className="h-4 w-4" />
              <span className="max-w-[160px] truncate">{displayName}</span>
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
        <Button className="gap-2" onClick={() => login()}>
          <LogIn className="h-4 w-4" /> Log in
        </Button>
      )}
    </header>
  );
}
