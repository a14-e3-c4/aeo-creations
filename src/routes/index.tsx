import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard, ImageIcon, Library, PenLine, User } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { ScriptStudio } from "@/components/studio/ScriptStudio";
import { ImageStudio } from "@/components/studio/ImageStudio";
import { VideoStudio } from "@/components/studio/VideoStudio";
import { AvatarStudio } from "@/components/studio/AvatarStudio";
import { LibraryGrid } from "@/components/studio/LibraryGrid";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "aeo.creations — AI Image, Video & Script Studio" },
      {
        name: "description",
        content:
          "Generate 4K images, cinematic 8-second video clips and production-ready scripts in one studio. Streaming previews, reference images and a private library.",
      },
      { property: "og:title", content: "aeo.creations — AI Image, Video & Script Studio" },
      {
        property: "og:description",
        content:
          "Create ultra-high-resolution images, cinematic AI video and shot-by-shot scripts in one place.",
      },
    ],
  }),
  component: Studio,
});

function Studio() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-background">
      <StudioHeader />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6">
        <section className="relative mb-10 overflow-hidden rounded-3xl border border-border bg-gradient-hero p-8 sm:p-12">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Creative studio
          </p>
          <h1 className="font-display max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Write it, render it, <span className="text-gradient-ember">film it.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            One studio for scripts, ultra-high-resolution images and cinematic AI video — with live
            previews and a library that keeps everything you make.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ["4K", "image resolution"],
              ["8s", "cinematic clips"],
              ["Live", "streaming previews"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-2xl font-bold text-foreground">{value}</dt>
                <dd className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Tabs defaultValue="image" className="space-y-8">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-surface p-1.5">
            <Trigger value="script" icon={<PenLine className="size-4" />} label="Script" />
            <Trigger value="image" icon={<ImageIcon className="size-4" />} label="Image" />
            <Trigger value="avatar" icon={<User className="size-4" />} label="Avatar" />
            <Trigger value="video" icon={<Clapperboard className="size-4" />} label="Video" />
            <Trigger value="library" icon={<Library className="size-4" />} label="Library" />
          </TabsList>

          <TabsContent value="script">
            <ScriptStudio onSaved={bump} />
          </TabsContent>
          <TabsContent value="image">
            <ImageStudio onSaved={bump} />
          </TabsContent>
          <TabsContent value="avatar">
            <AvatarStudio onSaved={bump} />
          </TabsContent>
          <TabsContent value="video">
            <VideoStudio onSaved={bump} />
          </TabsContent>
          <TabsContent value="library">
            <LibraryGrid refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        aeo.creations — built for people who make things.
      </footer>
    </div>
  );
}

function Trigger({
  value,
  icon,
  label,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="gap-2 rounded-xl px-5 py-2.5 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
    >
      {icon}
      {label}
    </TabsTrigger>
  );
}
