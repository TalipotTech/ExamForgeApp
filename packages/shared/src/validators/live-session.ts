import { z } from "zod";

export const liveSessionStatusSchema = z.enum(["scheduled", "live", "ended", "cancelled"]);
export type LiveSessionStatus = z.infer<typeof liveSessionStatusSchema>;

export const meetingTypeSchema = z.enum(["embedded", "external"]);
export type MeetingType = z.infer<typeof meetingTypeSchema>;

// Google Meet, Zoom, Teams, Daily, etc — keep loose, just require https.
const meetingUrlSchema = z
  .string()
  .url()
  .startsWith("https://", "Meeting URL must use HTTPS")
  .max(2000);

export const scheduleLiveSessionSchema = z
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
    meetingUrl: meetingUrlSchema,
    isFree: z.boolean().default(true),
    priceInr: z.number().int().min(0).optional(),
    subject: z.string().max(255).optional(),
    topic: z.string().max(255).optional(),
  })
  .refine((v) => v.isFree || (typeof v.priceInr === "number" && v.priceInr > 0), {
    message: "Paid sessions need a priceInr > 0",
    path: ["priceInr"],
  });
export type ScheduleLiveSessionInput = z.infer<typeof scheduleLiveSessionSchema>;

export const liveSessionIdInputSchema = z.object({ sessionId: z.string().uuid() });
export type LiveSessionIdInput = z.infer<typeof liveSessionIdInputSchema>;

export const listLiveSessionsInputSchema = z.object({
  classroomId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ListLiveSessionsInput = z.infer<typeof listLiveSessionsInputSchema>;

export const markLeftSchema = z.object({
  sessionId: z.string().uuid(),
  watchSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60),
});
export type MarkLeftInput = z.infer<typeof markLeftSchema>;

export const setRecordingUrlSchema = z.object({
  sessionId: z.string().uuid(),
  recordingUrl: z.string().url().startsWith("https://").max(2000),
});
export type SetRecordingUrlInput = z.infer<typeof setRecordingUrlSchema>;

/** Option C — embedded video via 100ms. Same shape as the manual schedule
 *  minus meetingUrl (we generate a room) plus a few embed-specific knobs. */
export const scheduleEmbeddedLiveSessionSchema = z
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
    enableRecording: z.boolean().default(true),
    enableChat: z.boolean().default(true),
    maxAttendees: z.number().int().min(2).max(1000).default(100),
    isFree: z.boolean().default(true),
    priceInr: z.number().int().min(0).optional(),
    subject: z.string().max(255).optional(),
    topic: z.string().max(255).optional(),
  })
  .refine((v) => v.isFree || (typeof v.priceInr === "number" && v.priceInr > 0), {
    message: "Paid sessions need a priceInr > 0",
    path: ["priceInr"],
  });
export type ScheduleEmbeddedLiveSessionInput = z.infer<typeof scheduleEmbeddedLiveSessionSchema>;
