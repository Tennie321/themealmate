import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => {
    const { data: posts, error } = await context.supabase
      .from("posts")
      .select("id, user_id, kind, body, image_url, meta, like_count, comment_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const userIds = Array.from(new Set((posts ?? []).map((p: any) => p.user_id)));
    const postIds = (posts ?? []).map((p: any) => p.id);
    const [{ data: profiles }, { data: likes }] = await Promise.all([
      userIds.length
        ? context.supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds)
        : Promise.resolve({ data: [] }),
      postIds.length
        ? context.supabase.from("post_likes").select("post_id").eq("user_id", context.userId).in("post_id", postIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const likedSet = new Set((likes ?? []).map((l: any) => l.post_id));
    // Sign image urls (stored as storage paths) for private bucket
    const signed: Record<string, string> = {};
    const paths = (posts ?? []).map((p: any) => p.image_url).filter(Boolean);
    if (paths.length) {
      const { data: s } = await context.supabase.storage
        .from("post-images")
        .createSignedUrls(paths, 60 * 60 * 24);
      for (const item of s ?? []) {
        if (item.path && item.signedUrl) signed[item.path] = item.signedUrl;
      }
    }
    return {
      posts: (posts ?? []).map((p: any) => ({
        ...p,
        image_signed_url: p.image_url ? signed[p.image_url] ?? null : null,
        author: profileMap.get(p.user_id) ?? null,
        liked: likedSet.has(p.id),
      })),
      meId: context.userId,
    };
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "progress" | "update" | "meal" | "share"; body?: string; image_path?: string; meta?: any }) => input)
  .handler(async ({ data, context }: any) => {
    // Gate posting behind Pro/Premium.
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("plan_tier, plan_expires_at")
      .eq("id", context.userId)
      .maybeSingle();
    const tier =
      prof?.plan_tier && prof.plan_tier !== "free"
        ? !prof?.plan_expires_at || new Date(prof.plan_expires_at).getTime() > Date.now()
          ? prof.plan_tier
          : "free"
        : "free";
    if (tier === "free") {
      const err: any = new Error("Posting to the community is a Pro feature. Upgrade to share your progress.");
      err.code = "UPGRADE_REQUIRED";
      throw err;
    }
    const body = (data.body ?? "").slice(0, 2000);
    const { data: row, error } = await context.supabase
      .from("posts")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        body,
        image_url: data.image_path ?? null,
        meta: data.meta ?? {},
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }: any) => {
    await context.supabase.from("posts").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { post_id: string; like: boolean }) => input)
  .handler(async ({ data, context }: any) => {
    if (data.like) {
      await context.supabase
        .from("post_likes")
        .upsert({ post_id: data.post_id, user_id: context.userId }, { onConflict: "post_id,user_id" });
    } else {
      await context.supabase
        .from("post_likes")
        .delete()
        .eq("post_id", data.post_id)
        .eq("user_id", context.userId);
    }
    return { ok: true };
  });

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { post_id: string }) => input)
  .handler(async ({ data, context }: any) => {
    const { data: comments } = await context.supabase
      .from("post_comments")
      .select("id, user_id, body, created_at")
      .eq("post_id", data.post_id)
      .order("created_at", { ascending: true });
    const userIds = Array.from(new Set((comments ?? []).map((c: any) => c.user_id)));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds)
      : { data: [] };
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return {
      comments: (comments ?? []).map((c: any) => ({ ...c, author: map.get(c.user_id) ?? null })),
      meId: context.userId,
    };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { post_id: string; body: string }) => input)
  .handler(async ({ data, context }: any) => {
    const body = data.body.trim().slice(0, 1000);
    if (!body) throw new Error("Empty comment");
    const { error } = await context.supabase
      .from("post_comments")
      .insert({ post_id: data.post_id, user_id: context.userId, body });
    if (error) throw error;
    return { ok: true };
  });