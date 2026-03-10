# AI Integration Patterns

## Model Router
All AI calls go through `apps/api/src/ai/ai-router.ts`. Never import provider SDKs directly in feature code.

## Provider Selection Logic
- **Question generation (quality)**: Claude claude-sonnet-4-20250514
- **Question generation (bulk/cheap)**: Mistral mistral-large
- **Video/long-doc processing**: Gemini gemini-2.0-flash
- **Web search for current affairs**: Perplexity sonar-pro
- **Structured output (MCQ JSON)**: OpenAI gpt-4o with structured outputs
- **Embeddings**: OpenAI text-embedding-3-small (1536 dims)

## Structured Output Pattern
```typescript
import Instructor from "@instructor-ai/instructor";
import { z } from "zod";

const QuestionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string()).length(4),
  answer: z.number().min(0).max(3),
  explanation: z.string().min(20),
  subject: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
```
Always validate with this pattern before saving to DB.

## Cost Tracking
Log every AI call to `ai_usage_logs` table:
- provider, model, input_tokens, output_tokens
- latency_ms, estimated_cost_usd
- exam_id, user_id, feature (scrape/generate/verify)
