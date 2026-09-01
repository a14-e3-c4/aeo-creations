import { Link } from "@tanstack/react-router";
import { Sparkles, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function StudioHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground glow-ember">
            <Sparkles className="size-4.5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            aeo<span className="text-gradient-ember">.creations</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground sm:inline">
            {user ? "Private library" : "Guest mode"}
          </span>
          {user ? (
            <Button variant="secondary" size="sm" onClick={() => signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">
                <LogIn className="size-4" /> Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
