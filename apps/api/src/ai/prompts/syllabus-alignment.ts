/**
 * Layer 3 — Syllabus Alignment Mapper
 *
 * Implements the prompt from
 * docs/features/QUESTION_ACQUISITION_STRATEGY.md §3.3.
 *
 * Given a question + the target exam's syllabus tree, the AI decides:
 *   - does this question fall within the syllabus? (in/out)
 *   - which specific syllabus node is it closest to?
 *   - has this topic historically been tested by the target exam?
 *   - is the difficulty appropriate for the target level?
 *   - 0-1 alignmentScore
 *
 * Output is validated against `syllabusAlignmentResponseSchema`.
 */

/** Shape of a syllabus node passed to the aligner. Keep it compact —
 *  large trees blow the token budget quickly. */
export interface SyllabusNodeSummary {
  /** bigint id as number — matches questions.mappedSyllabusNodeId FK. */
  id: number;
  /** Parent chain for context, deepest-first. Optional. */
  unit?: string;
  title: string;
  depth: number;
  description?: string | null;
  /** Key terms tagged on the node during syllabus extraction. */
  keyTerms?: string[];
}

export interface SyllabusAlignmentPromptParams {
  examName: string;
  /** Exam level string for difficulty appropriateness check. */
  examLevel: string;
  /** Flat list of syllabus_nodes for the target syllabus. The aligner
   *  picks the best matching id. Pre-filter to the relevant subject
   *  if the tree is huge. */
  syllabusNodes: SyllabusNodeSummary[];

  /** Question to map. */
  question: string;
  options?: string[];
  /** The classifier's best-guess subject and topic, if any. Hints the
   *  aligner toward the right region of the tree. */
  claimedSubject?: string | null;
  claimedTopic?: string | null;

  /** Topics the target exam has historically tested — drives the
   *  `historicallyTested` output field. Pass [] if unknown. */
  historicalTopics?: string[];
}

function formatNodeLine(n: SyllabusNodeSummary): string {
  const unitPrefix = n.unit ? `${n.unit} > ` : "";
  const indent = "  ".repeat(Math.max(0, n.depth - 1));
  const desc = n.description
    ? ` — ${n.description.slice(0, 120)}${n.description.length > 120 ? "…" : ""}`
    : "";
  const terms = n.keyTerms?.length ? ` [${n.keyTerms.slice(0, 6).join(", ")}]` : "";
  return `${indent}- [id:${n.id}] ${unitPrefix}${n.title}${desc}${terms}`;
}

export function buildSyllabusAlignmentPrompt(params: SyllabusAlignmentPromptParams): {
  systemPrompt: string;
  prompt: string;
} {
  const {
    examName,
    examLevel,
    syllabusNodes,
    question,
    options = [],
    claimedSubject,
    claimedTopic,
    historicalTopics = [],
  } = params;

  // Cap at ~2000 nodes worth of lines to stay within context budget.
  // Caller should pre-filter if the tree is larger than that.
  const MAX_NODES = 2000;
  const truncatedNodes = syllabusNodes.slice(0, MAX_NODES);
  const nodesBlock = truncatedNodes.map(formatNodeLine).join("\n");
  const truncNote =
    syllabusNodes.length > MAX_NODES
      ? `\n\n[... ${syllabusNodes.length - MAX_NODES} more nodes omitted — caller should pre-filter ...]`
      : "";

  const claimedBlock =
    claimedSubject || claimedTopic
      ? `\nClassifier hint: subject="${claimedSubject ?? ""}", topic="${claimedTopic ?? ""}"`
      : "";

  const historicalBlock = historicalTopics.length
    ? `\n\nTopics historically tested by ${examName}:\n${historicalTopics
        .slice(0, 50)
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "";

  const optionsBlock = options.length
    ? `\nOptions:\n${options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join("\n")}`
    : "";

  const systemPrompt = `You map exam questions to specific syllabus nodes. You are a
precise, conservative mapper: if a question clearly does NOT fit the
syllabus, you say so instead of forcing a weak match. If two nodes
both plausibly apply, pick the more specific / deeper one.

Your output MUST be valid JSON with these exact keys and no prose
outside the JSON. Scores are 0.0-1.0.`;

  const prompt = `Map this question to the ${examName} syllabus.

Syllabus nodes (id, unit > title, description, key terms):
${nodesBlock}${truncNote}

Question: ${question}${optionsBlock}${claimedBlock}${historicalBlock}

Produce:

1. Does this question fall within the syllabus? (inSyllabus: true|false)
2. Best matching syllabus_nodes.id (syllabusNodeId: the numeric id
   from the listing above, or null if inSyllabus is false).
3. Human-readable mapping: mappedUnit (e.g. "Unit 3: Pharmacology")
   and mappedTopic (e.g. "3.2 Drug Metabolism").
4. historicallyTested: true if the topic appears in the "historically
   tested" list, or you're confident it has been tested, else false.
5. difficultyAppropriateness for ${examLevel}:
   "appropriate" | "too_easy" | "too_hard"
6. alignmentScore: 0.0-1.0 — how confidently this question maps to
   the node you picked. Use < 0.5 for weak matches, >= 0.8 for
   strong/exact matches.
7. reasoning: one or two sentences explaining why you picked this
   node (or why you rejected the question as out-of-syllabus).

OUTPUT JSON (syllabusAlignmentResponseSchema):
{
  "inSyllabus": boolean,
  "syllabusNodeId": number_or_null,
  "mappedUnit": "string or null",
  "mappedTopic": "string or null",
  "historicallyTested": boolean,
  "difficultyAppropriateness": "appropriate|too_easy|too_hard",
  "alignmentScore": 0.0-1.0,
  "reasoning": "short string"
}`;

  return { systemPrompt, prompt };
}
