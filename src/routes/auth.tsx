import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — aeo.creations" },
      {
        name: "description",
        content:
          "Sign in to aeo.creations to keep a private library of your generated images, videos and scripts.",
      },
      { property: "og:title", content: "Sign in — aeo.creations" },
      {
        property: "og:description",
        content: "Keep a private library of everything you create in aeo.creations.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created — check your inbox if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-16">
      <div className="panel w-full max-w-md p-8">
        <Link to="/" className="mb-8 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground glow-ember">
            <Sparkles className="size-4.5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            aeo<span className="text-gradient-ember">.creations</span>
          </span>
        </Link>

        <h1 className="font-display text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your library of images, videos and scripts, kept private to you.
        </p>

        <Button variant="secondary" className="mt-6 w-full" onClick={handleGoogle}>
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background/60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background/60"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>

        <Link
          to="/"
          className="mt-3 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Continue as guest
        </Link>
      </div>
    </div>
  );
}
