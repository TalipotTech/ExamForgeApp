import { pgTable, uuid, varchar, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { creatorProfiles } from "./creator-profiles";

/**
 * One Zoom OAuth connection per creator. Tokens are stored AES-256-GCM
 * encrypted at rest — never log or surface them. `accessTokenEncrypted`
 * payload format: `iv:tag:ciphertext` (all base64).
 */
export const creatorZoomIntegrations = pgTable(
  "creator_zoom_integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),

    zoomUserId: varchar("zoom_user_id", { length: 50 }).notNull(),
    zoomAccountEmail: varchar("zoom_account_email", { length: 255 }),
    zoomAccountType: varchar("zoom_account_type", { length: 20 }),

    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    scopes: text("scopes").notNull(),

    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (t) => [
    unique("creator_zoom_unique").on(t.creatorId),
    index("creator_zoom_user_idx").on(t.zoomUserId),
  ],
);
