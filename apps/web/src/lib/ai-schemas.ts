import { z } from "zod";
import { questionContentSchema } from "@examforge/shared/validators";

export const questionOutputSchema = z.object({
  questions: z.array(
    z.object({
      content: questionContentSchema,
      subject: z.string(),
      topic: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
    }),
  ),
});
