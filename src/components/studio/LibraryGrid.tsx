import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteCreation, listCreations, signedUrl, type Creation } from "@/lib/creations";

type Row = Creation & { url?: string | null };

export function LibraryGrid({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Creation["kind"]>("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    listCreations()
      .then(async (items) => {
        const withUrls = await Promise.all(
          items.map(async (item) => ({
            ...item,
            url: item.storage_path ? await signedUrl(item.storage_path) : null,
          })),
        );
        if (active) setRows(withUrls);
      })
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Could not load your library"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const visible = rows.filter((r) => filter === "all" || r.kind === filter);

  async function handleDelete(id: string) {
    try {
      await deleteCreation(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["all", "image", "video", "script"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition-colors",
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "all" ? "Everything" : `${k}s`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel grid place-items-center p-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="panel p-16 text-center text-sm text-muted-foreground">
          Nothing here yet — generate something and hit save.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article key={item.id} className="panel group overflow-hidden">
              <div className="relative aspect-video w-full overflow-hidden bg-background/60">
                {item.kind === "image" && item.url && (
                  <img
                    src={item.url}
                    alt={item.title ?? "Creation"}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                {item.kind === "video" && item.url && (
                  <video src={item.url} controls playsInline className="size-full object-cover" />
                )}
                {item.kind === "script" && (
                  <div className="flex size-full items-center justify-center">
                    <FileText className="size-8 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <p className="line-clamp-2 text-sm font-medium text-foreground">
                  {item.title ?? item.prompt}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-0.5 capitalize">
                    {item.kind}
                  </span>
                  {item.resolution && (
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {item.resolution}
                    </span>
                  )}
                  {item.aspect_ratio && (
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {item.aspect_ratio}
                    </span>
                  )}
                </div>
                {item.kind === "script" && item.content && (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 font-sans text-xs text-muted-foreground">
                    {item.content}
                  </pre>
                )}
                <div className="flex gap-2">
                  {item.url && (
                    <Button asChild size="sm" variant="secondary">
                      <a href={item.url} download>
                        <Download className="size-4" /> Download
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
