import { z } from "zod";

export const marketplaceListingTypeSchema = z.enum([
  "question_set",
  "tutorial",
  "video",
  "audio",
  "course",
  "document",
  "bundle",
]);
export type MarketplaceListingType = z.infer<typeof marketplaceListingTypeSchema>;

export const marketplaceListingStatusSchema = z.enum([
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
  "retired",
]);
export type MarketplaceListingStatus = z.infer<typeof marketplaceListingStatusSchema>;

export const createMarketplaceListingSchema = z.object({
  title: z.string().min(3).max(500),
  description: z.string().min(20).max(10000).optional(),
  contentId: z.string().uuid().optional(),
  listingType: marketplaceListingTypeSchema,
  priceInr: z.number().int().min(100).max(10000000),
  compareAtPriceInr: z.number().int().min(100).max(10000000).optional(),
  examId: z.string().uuid().optional(),
  subject: z.string().max(255).optional(),
  tags: z.array(z.string().min(1).max(60)).max(30).optional(),
  coverImageUrl: z.string().url().max(1000).optional(),
  previewContent: z.string().max(20000).optional(),
  previewUrl: z.string().url().max(1000).optional(),
});
export type CreateMarketplaceListing = z.infer<typeof createMarketplaceListingSchema>;

export const updateMarketplaceListingSchema = createMarketplaceListingSchema.partial().extend({
  listingId: z.string().uuid(),
});
export type UpdateMarketplaceListing = z.infer<typeof updateMarketplaceListingSchema>;

export const marketplaceBrowseFilterSchema = z.object({
  examId: z.string().uuid().optional(),
  listingType: marketplaceListingTypeSchema.optional(),
  search: z.string().max(255).optional(),
  minPriceInr: z.number().int().min(0).optional(),
  maxPriceInr: z.number().int().min(0).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular", "rating"]).default("newest"),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});
export type MarketplaceBrowseFilter = z.infer<typeof marketplaceBrowseFilterSchema>;

export const createPurchaseOrderSchema = z.object({
  listingId: z.string().uuid(),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const verifyPurchaseSchema = z.object({
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().min(1).max(255),
});
export type VerifyPurchaseInput = z.infer<typeof verifyPurchaseSchema>;

export const rateListingSchema = z.object({
  listingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  reviewTitle: z.string().max(255).optional(),
  reviewText: z.string().max(5000).optional(),
});
export type RateListingInput = z.infer<typeof rateListingSchema>;

export const requestPayoutSchema = z.object({
  amountInr: z.number().int().min(1).optional(),
});
export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;
