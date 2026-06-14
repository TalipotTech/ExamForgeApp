import { z } from "zod";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { creatorContent, creatorProfiles, fileUploads } from "@examforge/shared/db/schema";
import type { Database } from "@examforge/shared/db";
import {
  creatorContentTypeSchema,
  contentIdInputSchema,
  updateContentSchema,
  removeMediaSchema,
  updateMediaTextSchema,
  myContentListSchema,
  type MediaItem,
} from "@examforge/shared/validators";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";
import { enqueueContentEmbedding } from "../../queues/content-embedding-queue.js";

async function requireCreatorProfile(db: Database, userId: string): Promise<{ id: string }> {
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a registered creator" });
  }
  return profile;
}

async function requireOwnedContent(
  db: Database,
  contentId: string,
  userId: string,
): Promise<{ creatorId: string; content: typeof creatorContent.$inferSelect }> {
  const profile = await requireCreatorProfile(db, userId);
  const [content] = await db
    .select()
    .from(creatorContent)
    .where(eq(creatorContent.id, contentId))
    .limit(1);
  if (!content) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Content not found" });
  }
  if (content.creatorId !== profile.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not owner of this content" });
  }
  return { creatorId: profile.id, content };
}

/** Extract the `mediaItems` array from `metadata.mediaItems`, sorted by order. */
function readMediaItems(meta: unknown): MediaItem[] {
  if (!meta || typeof meta !== "object") return [];
  const items = (meta as { mediaItems?: MediaItem[] }).mediaItems;
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => a.order - b.order);
}

/** Re-derive top-level contentType from the media items:
 *  video > audio > image > document > note (text-only fallback).
 */
function deriveContentType(items: MediaItem[], hasBody: boolean): string {
  if (items.length === 0) return hasBody ? "note" : "document";
  if (items.some((i) => i.type === "video")) return "video";
  if (items.some((i) => i.type === "audio")) return "audio";
  if (items.some((i) => i.type === "image")) return "image";
  return "document";
}

export const creatorContentRouter = router({
  /** Public: list a creator's published content. */
  listByCreator: publicProcedure
    .input(
      z.object({
        creatorId: z.string().uuid(),
        contentType: creatorContentTypeSchema.optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.enabled");
      const conds: SQL[] = [
        eq(creatorContent.creatorId, input.creatorId),
        eq(creatorContent.isPublished, true),
      ];
      if (input.contentType) conds.push(eq(creatorContent.contentType, input.contentType));
      return ctx.db
        .select()
        .from(creatorContent)
        .where(and(...conds))
        .orderBy(desc(creatorContent.publishedAt))
        .limit(input.limit);
    }),

  /** Creator's own content list with pagination. */
  myContent: protectedProcedure
    .input(myContentListSchema.optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.enabled");
      const params = input ?? myContentListSchema.parse({});
      const profile = await requireCreatorProfile(ctx.db, ctx.userId);

      const conds: SQL[] = [eq(creatorContent.creatorId, profile.id)];
      if (params.contentType) conds.push(eq(creatorContent.contentType, params.contentType));
      const whereClause = and(...conds);

      const offset = (params.page - 1) * params.limit;
      const [rows, totalRow] = await Promise.all([
        ctx.db
          .select()
          .from(creatorContent)
          .where(whereClause)
          .orderBy(desc(creatorContent.createdAt))
          .limit(params.limit)
          .offset(offset),
        ctx.db.select({ total: count() }).from(creatorContent).where(whereClause),
      ]);
      const total = totalRow[0]?.total ?? 0;
      return {
        items: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / params.limit)),
        },
      };
    }),

  /** Single content item with parsed mediaItems. Owner-only. */
  byId: protectedProcedure.input(contentIdInputSchema).query(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    const { content } = await requireOwnedContent(ctx.db, input.contentId, ctx.userId);
    const mediaItems = readMediaItems(content.metadata);
    return { ...content, mediaItems };
  }),

  /** Update editable fields. Does not touch mediaItems — those go through
   *  add-media / remove-media endpoints. */
  update: protectedProcedure.input(updateContentSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    const { contentId, ...fields } = input;
    await requireOwnedContent(ctx.db, contentId, ctx.userId);
    const patch: Partial<typeof creatorContent.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.body !== undefined) patch.body = fields.body;
    if (fields.language !== undefined) patch.language = fields.language;
    if (fields.isPremium !== undefined) patch.isPremium = fields.isPremium;
    if (fields.examId !== undefined) patch.examId = fields.examId ?? null;
    if (fields.syllabusNodeId !== undefined) patch.syllabusNodeId = fields.syllabusNodeId ?? null;
    if (fields.subject !== undefined) patch.subject = fields.subject ?? null;
    if (fields.topic !== undefined) patch.topic = fields.topic ?? null;
    await ctx.db.update(creatorContent).set(patch).where(eq(creatorContent.id, contentId));
    return { success: true as const };
  }),

  /** Flip publish state. Derives `publishedAt` on first publish. */
  togglePublish: protectedProcedure.input(contentIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    const { content } = await requireOwnedContent(ctx.db, input.contentId, ctx.userId);
    const now = new Date();
    const nextPublished = !content.isPublished;
    await ctx.db
      .update(creatorContent)
      .set({
        isPublished: nextPublished,
        publishedAt: nextPublished ? (content.publishedAt ?? now) : content.publishedAt,
        updatedAt: now,
      })
      .where(eq(creatorContent.id, input.contentId));

    // Fire-and-forget: queue an embedding job on publish so the AI tutor
    // can retrieve from this content. Failure here must not fail the
    // publish action itself.
    if (nextPublished) {
      enqueueContentEmbedding(input.contentId, "publish").catch((err) => {
        console.error("[creator-content] enqueueContentEmbedding failed:", err);
      });
    }

    return { success: true as const, isPublished: nextPublished };
  }),

  /** Soft-delete via feature flag? For now, hard-delete. file_uploads rows
   *  linked via file_upload_id remain — they're referenced from metadata
   *  too, and on-disk cleanup is handled by the upload endpoint's owner. */
  delete: protectedProcedure.input(contentIdInputSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    await requireOwnedContent(ctx.db, input.contentId, ctx.userId);
    await ctx.db.delete(creatorContent).where(eq(creatorContent.id, input.contentId));
    return { success: true as const };
  }),

  /** Remove one media item by its `order` index and rewrite the media
   *  items array + contentType. The file stays on disk; garbage
   *  collection is out of scope for this pass. */
  removeMedia: protectedProcedure.input(removeMediaSchema).mutation(async ({ ctx, input }) => {
    await assertCreatorsFeature(ctx.db, "creators.enabled");
    const { content } = await requireOwnedContent(ctx.db, input.contentId, ctx.userId);
    const items = readMediaItems(content.metadata);
    const removed = items.find((i) => i.order === input.order);
    if (!removed) {
      return { success: true as const, removed: false };
    }
    const remaining = items
      .filter((i) => i.order !== input.order)
      .map((i, idx) => ({ ...i, order: idx }));
    const meta = (content.metadata as Record<string, unknown> | null) ?? {};
    const nextMeta = { ...meta, mediaItems: remaining };
    const nextContentType = deriveContentType(remaining, !!content.body);
    await ctx.db
      .update(creatorContent)
      .set({
        metadata: nextMeta,
        contentType: nextContentType,
        thumbnailUrl: remaining.find((i) => i.type === "image")?.url ?? null,
        updatedAt: new Date(),
      })
      .where(eq(creatorContent.id, input.contentId));
    // Best-effort: clear the file_uploads row if we have an id
    if (removed.fileUploadId) {
      await ctx.db
        .update(fileUploads)
        .set({ processingStatus: "deleted" })
        .where(eq(fileUploads.id, removed.fileUploadId));
    }
    return { success: true as const, removed: true };
  }),

  /** Update extractedText for an image media item (user-edited OCR). */
  updateMediaText: protectedProcedure
    .input(updateMediaTextSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.enabled");
      const { content } = await requireOwnedContent(ctx.db, input.contentId, ctx.userId);
      const items = readMediaItems(content.metadata);
      const target = items.find((i) => i.order === input.order);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" });
      }
      const updated = items.map((m) =>
        m.order === input.order ? { ...m, extractedText: input.extractedText } : m,
      );
      const meta = (content.metadata as Record<string, unknown> | null) ?? {};
      await ctx.db
        .update(creatorContent)
        .set({
          metadata: { ...meta, mediaItems: updated },
          updatedAt: new Date(),
        })
        .where(eq(creatorContent.id, input.contentId));
      return { success: true as const };
    }),
});
