import { router, publicProcedure } from "../trpc.js";

export const healthRouter = router({
  check: publicProcedure.query((): { status: string; timestamp: string } => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }),
});
