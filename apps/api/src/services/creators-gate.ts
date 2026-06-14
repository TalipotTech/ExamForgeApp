import { TRPCError } from "@trpc/server";
import type { Database } from "@examforge/shared/db";
import { getFlag } from "./feature-flags.js";

/**
 * Phase A foundation: every creators-ecosystem tRPC procedure passes through
 * this gate. It throws `FORBIDDEN` unless `creators.enabled` is true AND the
 * specific sub-feature flag is true. Keeps all procedures wired into the
 * router but inert at runtime until the master + sub switch are flipped.
 */
export async function assertCreatorsFeature(db: Database, subFlagKey: string): Promise<void> {
  const master = await getFlag(db, "creators.enabled");
  if (master !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "FEATURE_DISABLED: creators ecosystem is not enabled",
    });
  }
  const sub = await getFlag(db, subFlagKey);
  if (sub !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `FEATURE_DISABLED: ${subFlagKey} is not enabled`,
    });
  }
}
