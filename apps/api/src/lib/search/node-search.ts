/**
 * Shared node + tutorial search queries (pure — take `db` as a param, no
 * Fastify/Next imports). Used by the topic-search tRPC router.
 *
 * Content is scoped by `examId` (the student's selected exam). `syllabus_nodes`
 * carry no exam column, so we reach the exam through `syllabi.examId`.
 * `subject`/`path` are resolved by walking `parentId` in app code.
 */

import { and, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { syllabusNodes, syllabi, tutorialFiles } from "@examforge/shared/db/schema";

export interface NodeHit {
  nodeId: number;
  title: string;
  path: string;
  subject: string;
  examId: string;
  syllabusId: number;
}

export interface ContentHit {
  nodeId: number;
  tutorialFileId: number;
  title: string;
  snippet: string;
  examId: string;
  syllabusId: number;
}

export interface SearchScope {
  examId?: string;
  orgId?: string | null;
  limit?: number;
}

type AncestorRow = {
  id: number;
  parentId: number | null;
  title: string;
  depth: number;
};

/**
 * For a set of matched nodes, load every node in the involved syllabi so we
 * can resolve each node's ancestor chain (subject = nearest unit/module,
 * path = "A › B › C") without N recursive queries. A syllabus tree is
 * bounded (hundreds of nodes), so one fetch per involved syllabus is cheap.
 */
async function buildAncestry(
  db: Database,
  syllabusIds: number[],
): Promise<Map<number, AncestorRow>> {
  const map = new Map<number, AncestorRow>();
  if (syllabusIds.length === 0) return map;
  const rows = await db
    .select({
      id: syllabusNodes.id,
      parentId: syllabusNodes.parentId,
      title: syllabusNodes.title,
      depth: syllabusNodes.depth,
    })
    .from(syllabusNodes)
    .where(
      sql`${syllabusNodes.syllabusId} IN (${sql.join(
        syllabusIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  for (const r of rows) map.set(r.id, r);
  return map;
}

function resolvePathAndSubject(
  nodeId: number,
  ancestry: Map<number, AncestorRow>,
): { path: string; subject: string } {
  const chain: AncestorRow[] = [];
  let current = ancestry.get(nodeId);
  let hops = 0;
  while (current && hops < 12) {
    chain.unshift(current);
    current = current.parentId ? ancestry.get(current.parentId) : undefined;
    hops += 1;
  }
  // depth 0 is the syllabus root — drop it from the visible path.
  const visible = chain.filter((c) => c.depth > 0);
  const path = visible.map((c) => c.title).join(" › ");
  // subject = shallowest non-root ancestor (unit/module), else self.
  const subject = visible.length > 0 ? visible[0]!.title : (ancestry.get(nodeId)?.title ?? "");
  return { path, subject };
}

export async function searchNodes(db: Database, q: string, scope: SearchScope): Promise<NodeHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const limit = scope.limit ?? 8;
  const like = `%${term}%`;

  const conditions = [
    or(ilike(syllabusNodes.title, like), sql`${syllabusNodes.keyTerms}::text ILIKE ${like}`)!,
  ];
  if (scope.examId) conditions.push(eq(syllabi.examId, scope.examId));

  // exact (0) → prefix (1) → contains (2), then shallower depth first.
  const rankExpr = sql<number>`CASE
    WHEN lower(${syllabusNodes.title}) = lower(${term}) THEN 0
    WHEN lower(${syllabusNodes.title}) LIKE lower(${term + "%"}) THEN 1
    ELSE 2 END`;

  const rows = await db
    .select({
      nodeId: syllabusNodes.id,
      title: syllabusNodes.title,
      syllabusId: syllabusNodes.syllabusId,
      examId: syllabi.examId,
      rank: rankExpr,
    })
    .from(syllabusNodes)
    .innerJoin(syllabi, eq(syllabi.id, syllabusNodes.syllabusId))
    .where(and(...conditions))
    .orderBy(rankExpr, syllabusNodes.depth, syllabusNodes.sortOrder)
    .limit(limit);

  const ancestry = await buildAncestry(db, [...new Set(rows.map((r) => r.syllabusId))]);

  return rows.map((r) => {
    const { path, subject } = resolvePathAndSubject(r.nodeId, ancestry);
    return {
      nodeId: r.nodeId,
      title: r.title,
      path,
      subject,
      examId: r.examId,
      syllabusId: r.syllabusId,
    };
  });
}

export async function searchTutorialContent(
  db: Database,
  q: string,
  scope: SearchScope,
): Promise<ContentHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const limit = scope.limit ?? 8;
  const like = `%${term}%`;

  const conditions = [eq(tutorialFiles.isCurrent, true), ilike(tutorialFiles.plainText, like)];
  if (scope.examId) conditions.push(eq(tutorialFiles.examId, scope.examId));

  const rows = await db
    .select({
      tutorialFileId: tutorialFiles.id,
      nodeId: tutorialFiles.syllabusNodeId,
      syllabusId: tutorialFiles.syllabusId,
      examId: tutorialFiles.examId,
      title: tutorialFiles.title,
      plainText: tutorialFiles.plainText,
    })
    .from(tutorialFiles)
    .where(and(...conditions))
    .limit(limit);

  return rows.map((r) => ({
    nodeId: r.nodeId,
    tutorialFileId: r.tutorialFileId,
    title: r.title,
    examId: r.examId,
    syllabusId: r.syllabusId,
    snippet: makeSnippet(r.plainText ?? "", term),
  }));
}

function makeSnippet(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text.slice(0, 160).trim();
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + term.length + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}
