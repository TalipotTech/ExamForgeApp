import type { Database } from "@examforge/shared/db";
import { adminAuditLog } from "@examforge/shared/db/schema";

export async function createAuditEntry(
  db: Database,
  params: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      reason?: string;
    };
    ipAddress?: string;
  },
): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminId: params.adminId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details ?? {},
    ipAddress: params.ipAddress,
  });
}
