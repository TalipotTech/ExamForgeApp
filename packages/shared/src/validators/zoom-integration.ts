import { z } from "zod";

export const zoomAccountTypeSchema = z.enum(["basic", "pro", "business", "enterprise", "unknown"]);
export type ZoomAccountType = z.infer<typeof zoomAccountTypeSchema>;

/** Reply from `GET /v2/users/me`. We only persist a few fields. */
export const zoomUserMeSchema = z.object({
  id: z.string().min(1).max(50),
  email: z.string().email().optional(),
  type: z.number().int().optional(), // 1 basic, 2 licensed, 3 on-prem
  account_id: z.string().optional(),
});
export type ZoomUserMe = z.infer<typeof zoomUserMeSchema>;

/** Reply from `POST /oauth/token` (auth-code or refresh). */
export const zoomTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
});
export type ZoomTokenResponse = z.infer<typeof zoomTokenResponseSchema>;

/** Subset of `POST /v2/users/me/meetings` we care about. */
export const zoomCreateMeetingResponseSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  join_url: z.string().url(),
  start_url: z.string().url().optional(),
  password: z.string().optional(),
  topic: z.string().optional(),
  duration: z.number().int().optional(),
  start_time: z.string().optional(),
});
export type ZoomCreateMeetingResponse = z.infer<typeof zoomCreateMeetingResponseSchema>;

/** Input to scheduleViaZoom — same shape as Option A's schedule, minus
 *  meetingUrl (we generate it). */
export const scheduleZoomLiveSessionSchema = z
  .object({
    classroomId: z.string().uuid().optional(),
    title: z.string().min(3).max(500),
    description: z.string().max(5000).optional(),
    scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, {
      message: "Scheduled time must be in the future",
    }),
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(8 * 60)
      .default(60),
    autoRecord: z.boolean().default(true),
    muteOnEntry: z.boolean().default(true),
    waitingRoom: z.boolean().default(true),
    isFree: z.boolean().default(true),
    priceInr: z.number().int().min(0).optional(),
    subject: z.string().max(255).optional(),
    topic: z.string().max(255).optional(),
  })
  .refine((v) => v.isFree || (typeof v.priceInr === "number" && v.priceInr > 0), {
    message: "Paid sessions need a priceInr > 0",
    path: ["priceInr"],
  });
export type ScheduleZoomLiveSessionInput = z.infer<typeof scheduleZoomLiveSessionSchema>;

/** Status payload returned to the integrations page. Tokens are NEVER
 *  surfaced — only metadata. */
export const zoomIntegrationStatusSchema = z.object({
  connected: z.boolean(),
  zoomAccountEmail: z.string().nullable(),
  zoomAccountType: zoomAccountTypeSchema.nullable(),
  connectedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type ZoomIntegrationStatus = z.infer<typeof zoomIntegrationStatusSchema>;
