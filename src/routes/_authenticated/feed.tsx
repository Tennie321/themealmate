import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listPosts, createPost, toggleLike, deletePost, listComments, addComment } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Heart, MessageCircle, Loader2, Trash2, ImagePlus, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FeedSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/feed")({
  component: Feed,
});

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function Feed() {
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["feed"], queryFn: () => listPosts() });
  const [composerOpen, setComposerOpen] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);

  const like = useMutation({
    mutationFn: (vars: { post_id: string; like: boolean }) => toggleLike({ data: vars } as any),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["feed"] });
      const prev = qc.getQueryData<any>(["feed"]);
      if (prev?.posts) {
        qc.setQueryData(["feed"], {
          ...prev,
          posts: prev.posts.map((p: any) =>
            p.id === vars.post_id
              ? { ...p, liked: vars.like, like_count: p.like_count + (vars.like ? 1 : -1) }
              : p,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["feed"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deletePost({ data: { id } } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  return (
    <div className="max-w-md mx-auto px-5 pt-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Community</p>
          <h1 className="text-2xl font-bold">The feed</h1>
        </div>
        <Link to="/share" className="text-xs font-semibold text-primary flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> Share my day
        </Link>
      </header>

      <div className="mt-5">
        <button
          onClick={() => setComposerOpen(true)}
          className="w-full text-left bg-card border border-border rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:border-primary"
        >
          Share an update, progress photo, or meal win…
        </button>
      </div>

      {feed.isLoading && <div className="mt-4"><FeedSkeleton /></div>}

      <div className="mt-4 space-y-4">
        {feed.data?.posts.map((p: any) => (
          <article key={p.id} className="bg-card border border-border rounded-3xl overflow-hidden">
            <header className="px-4 pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={p.author?.display_name} url={p.author?.avatar_url} />
                <div>
                  <div className="font-semibold text-sm leading-tight">{p.author?.display_name ?? "MealMate user"}</div>
                  <div className="text-[11px] text-muted-foreground">{timeAgo(p.created_at)} ago · {p.kind}</div>
                </div>
              </div>
              {p.user_id === feed.data?.meId && (
                <button onClick={() => del.mutate(p.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </header>
            {p.body && <p className="px-4 mt-3 text-sm whitespace-pre-wrap">{p.body}</p>}
            {p.image_signed_url && (
              <img src={p.image_signed_url} alt="" className="w-full mt-3 max-h-[520px] object-cover bg-black/5" />
            )}
            <footer className="px-4 py-3 flex items-center gap-5 text-sm">
              <button
                onClick={() => like.mutate({ post_id: p.id, like: !p.liked })}
                className={`flex items-center gap-1.5 ${p.liked ? "text-destructive" : "text-muted-foreground"}`}
              >
                <Heart className={`w-4 h-4 ${p.liked ? "fill-current" : ""}`} /> {p.like_count}
              </button>
              <button
                onClick={() => setActivePostId(p.id)}
                className="flex items-center gap-1.5 text-muted-foreground"
              >
                <MessageCircle className="w-4 h-4" /> {p.comment_count}
              </button>
            </footer>
          </article>
        ))}
        {feed.data && feed.data.posts.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No posts yet — be the first to share.
          </div>
        )}
      </div>

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} />
      <CommentsSheet postId={activePostId} onClose={() => setActivePostId(null)} />
    </div>
  );
}

function Avatar({ name, url }: { name?: string; url?: string }) {
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover" />;
  const initial = (name ?? "?").charAt(0).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-secondary text-primary grid place-items-center font-semibold">
      {initial}
    </div>
  );
}

function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"update" | "progress" | "meal">("update");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!body.trim() && !file) { toast.error("Add a note or photo"); return; }
    setBusy(true);
    try {
      let image_path: string | undefined;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error("Not signed in");
        const ext = file.name.split(".").pop() || "jpg";
        image_path = `${uid}/post-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("post-images").upload(image_path, file, {
          contentType: file.type, upsert: false,
        });
        if (upErr) throw upErr;
      }
      await createPost({ data: { kind, body: body.trim(), image_path } } as any);
      toast.success("Posted");
      setBody(""); pickFile(null); setKind("update");
      qc.invalidateQueries({ queryKey: ["feed"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't post");
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New post</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex gap-2">
          {(["update", "progress", "meal"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's the win today?"
          rows={4}
          className="mt-3 rounded-2xl"
        />
        {preview && (
          <div className="relative mt-3">
            <img src={preview} className="w-full rounded-2xl max-h-72 object-cover" />
            <button
              onClick={() => pickFile(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
              aria-label="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-primary cursor-pointer">
          <ImagePlus className="w-4 h-4" />
          <span>Add a photo</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button onClick={submit} disabled={busy} className="mt-4 w-full h-12 rounded-2xl font-semibold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Post</>}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function CommentsSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const q = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => listComments({ data: { post_id: postId! } } as any),
    enabled: !!postId,
  });

  const add = useMutation({
    mutationFn: () => addComment({ data: { post_id: postId!, body } } as any),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't comment"),
  });

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Comments</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          {q.isLoading && <div className="grid place-items-center py-8"><Loader2 className="animate-spin" /></div>}
          {q.data?.comments.map((c: any) => (
            <div key={c.id} className="flex gap-3">
              <Avatar name={c.author?.display_name} url={c.author?.avatar_url} />
              <div className="flex-1">
                <div className="text-xs font-semibold">{c.author?.display_name ?? "user"} <span className="text-muted-foreground font-normal ml-1">{timeAgo(c.created_at)}</span></div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </div>
            </div>
          ))}
          {q.data && q.data.comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Be the first to comment.</p>
          )}
        </div>
        <div className="mt-4 flex gap-2 sticky bottom-0 bg-background pt-3 pb-[env(safe-area-inset-bottom)]">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            className="rounded-2xl flex-1"
          />
          <Button
            onClick={() => body.trim() && add.mutate()}
            disabled={add.isPending || !body.trim()}
            className="rounded-2xl"
          >
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}