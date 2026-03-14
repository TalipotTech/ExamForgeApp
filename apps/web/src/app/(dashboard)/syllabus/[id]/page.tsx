"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Lightbulb,
  FunctionSquare,
  Target,
  BookOpen,
  HelpCircle,
  Loader2,
  Search,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AIProviderSelector, type ProviderId } from "@/components/ai-provider-selector";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type TreeNode = {
  id: number;
  parentId: number | null;
  nodeType: string;
  title: string;
  description: string | null;
  depth: number;
  sortOrder: number;
  keyTerms: string[] | null;
  tutorialStatus: string | null;
  mcqStatus: string | null;
  mcqCount: number | null;
};

const NODE_ICONS: Record<string, React.ReactNode> = {
  unit: <Folder className="h-4 w-4 text-blue-500" />,
  chapter: <Folder className="h-4 w-4 text-indigo-500" />,
  topic: <FileText className="h-4 w-4 text-gray-500" />,
  subtopic: <FileText className="h-4 w-4 text-gray-400" />,
  definition: <Lightbulb className="h-4 w-4 text-yellow-500" />,
  formula: <FunctionSquare className="h-4 w-4 text-purple-500" />,
  objective: <Target className="h-4 w-4 text-green-500" />,
};

export default function SyllabusTreePage(): React.ReactElement {
  const params = useParams();
  const syllabusId = Number(params.id);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [providers, setProviders] = useState<ProviderId[]>(["claude"]);
  const [selectedForExam, setSelectedForExam] = useState<Set<number>>(new Set());

  const treeQuery = trpc.syllabus.getTree.useQuery({ syllabusId });
  const utils = trpc.useUtils();

  const generateTutorial = trpc.syllabus.generateTutorial.useMutation({
    onSuccess: () => {
      toast.success("Tutorial generated!");
      utils.syllabus.getTree.invalidate({ syllabusId });
    },
    onError: (err) => toast.error(err.message),
  });

  const generateMCQs = trpc.syllabus.generateMCQs.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.questionsGenerated} MCQs generated!`);
      utils.syllabus.getTree.invalidate({ syllabusId });
    },
    onError: (err) => toast.error(err.message),
  });

  // Build tree structure from flat nodes
  const tree = useMemo(() => {
    if (!treeQuery.data) return [];
    const nodes = treeQuery.data.nodes;
    const childrenMap = new Map<number | null, TreeNode[]>();

    for (const node of nodes) {
      const parentKey = node.parentId;
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey)!.push(node);
    }

    function buildTree(parentId: number | null): TreeNode[] {
      const children = childrenMap.get(parentId) ?? [];
      return children.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return buildTree(null);
  }, [treeQuery.data]);

  // Filter nodes by search
  const matchingNodeIds = useMemo(() => {
    if (!searchQuery || !treeQuery.data) return null;
    const q = searchQuery.toLowerCase();
    const ids = new Set<number>();
    for (const node of treeQuery.data.nodes) {
      if (
        node.title.toLowerCase().includes(q) ||
        node.keyTerms?.some((t) => t.toLowerCase().includes(q))
      ) {
        ids.add(node.id);
        // Expand ancestors
        let current = node;
        while (current.parentId) {
          ids.add(current.parentId);
          current = treeQuery.data.nodes.find((n) => n.id === current.parentId)!;
          if (!current) break;
        }
      }
    }
    return ids;
  }, [searchQuery, treeQuery.data]);

  function toggleExpand(nodeId: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function toggleExamSelect(nodeId: number): void {
    setSelectedForExam((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function getChildren(parentId: number): TreeNode[] {
    if (!treeQuery.data) return [];
    return treeQuery.data.nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (treeQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (treeQuery.error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          Failed to load syllabus: {treeQuery.error.message}
        </CardContent>
      </Card>
    );
  }

  const syllabus = treeQuery.data!.syllabus;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{syllabus.name}</h1>
          <p className="text-muted-foreground text-sm">
            {syllabus.pageCount ?? 0} pages &middot; {treeQuery.data!.nodes.length} nodes
          </p>
        </div>
        {selectedForExam.size > 0 && (
          <Link
            href={`/syllabus/${syllabusId}/exam?nodes=${[...selectedForExam].join(",")}` as "/"}
          >
            <Button>
              <CheckSquare className="mr-2 h-4 w-4" />
              Create Exam ({selectedForExam.size} nodes)
            </Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tree + Detail Panel */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tree */}
        <div className="space-y-0.5 lg:col-span-2">
          {tree.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              getChildren={getChildren}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              matchingNodeIds={matchingNodeIds}
              selectedForExam={selectedForExam}
              toggleExamSelect={toggleExamSelect}
            />
          ))}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedNode ? (
            <NodeDetailPanel
              nodeId={selectedNode}
              syllabusId={syllabusId}
              providers={providers}
              setProviders={setProviders}
              generateTutorial={generateTutorial}
              generateMCQs={generateMCQs}
            />
          ) : (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center text-sm">
                Click a node to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tree Node Row ───

function NodeRow({
  node,
  getChildren,
  expanded,
  toggleExpand,
  selectedNode,
  setSelectedNode,
  matchingNodeIds,
  selectedForExam,
  toggleExamSelect,
}: {
  node: TreeNode;
  getChildren: (parentId: number) => TreeNode[];
  expanded: Set<number>;
  toggleExpand: (id: number) => void;
  selectedNode: number | null;
  setSelectedNode: (id: number) => void;
  matchingNodeIds: Set<number> | null;
  selectedForExam: Set<number>;
  toggleExamSelect: (id: number) => void;
}): React.ReactElement | null {
  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedNode === node.id;

  // If searching and this node doesn't match, hide it
  if (matchingNodeIds && !matchingNodeIds.has(node.id)) return null;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 transition-colors ${
          isSelected ? "bg-primary/10 border-primary/30 border" : "hover:bg-muted"
        }`}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
        onClick={() => setSelectedNode(node.id)}
      >
        {/* Expand toggle */}
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpand(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Exam checkbox */}
        <input
          type="checkbox"
          checked={selectedForExam.has(node.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleExamSelect(node.id);
          }}
          className="accent-primary h-3.5 w-3.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Icon */}
        <span className="shrink-0">
          {NODE_ICONS[node.nodeType] ?? <HelpCircle className="h-4 w-4 text-gray-400" />}
        </span>

        {/* Title */}
        <span className={`flex-1 truncate text-sm ${node.depth <= 1 ? "font-medium" : ""}`}>
          {node.title}
        </span>

        {/* Status badges */}
        {node.tutorialStatus === "generated" && (
          <Link
            href={`/dashboard/tutorial/${node.id}` as "/"}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <Badge
              variant="secondary"
              className="cursor-pointer text-[10px] hover:bg-green-100 dark:hover:bg-green-900"
            >
              <BookOpen className="mr-0.5 h-2.5 w-2.5" />
              View Tutorial
            </Badge>
          </Link>
        )}
        {node.tutorialStatus === "generating" && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            <Loader2 className="mr-0.5 h-2.5 w-2.5 animate-spin" />
            Generating
          </Badge>
        )}
        {node.mcqCount && node.mcqCount > 0 ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {node.mcqCount} MCQs
          </Badge>
        ) : null}
      </div>

      {/* Children */}
      {isExpanded &&
        children.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            getChildren={getChildren}
            expanded={expanded}
            toggleExpand={toggleExpand}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            matchingNodeIds={matchingNodeIds}
            selectedForExam={selectedForExam}
            toggleExamSelect={toggleExamSelect}
          />
        ))}
    </div>
  );
}

// ─── Node Detail Panel ───

function NodeDetailPanel({
  nodeId,
  syllabusId,
  providers,
  setProviders,
  generateTutorial,
  generateMCQs,
}: {
  nodeId: number;
  syllabusId: number;
  providers: ProviderId[];
  setProviders: (p: ProviderId[]) => void;
  generateTutorial: {
    mutate: (input: { nodeId: number; providers: ProviderId[]; mode: "single" | "multi" }) => void;
    isPending: boolean;
  };
  generateMCQs: {
    mutate: (input: {
      nodeId: number;
      tutorialId: number;
      count: number;
      difficulty: "mixed";
      providers: ProviderId[];
    }) => void;
    isPending: boolean;
  };
}): React.ReactElement {
  const nodeQuery = trpc.syllabus.getNode.useQuery({ nodeId });
  const tutorialQuery = trpc.syllabus.getTutorial.useQuery({ nodeId });

  if (nodeQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const node = nodeQuery.data?.node;
  if (!node) return <></>;

  const hasTutorial = tutorialQuery.data !== null && tutorialQuery.data !== undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {NODE_ICONS[node.nodeType]}
          <CardTitle className="text-base">{node.title}</CardTitle>
        </div>
        <Badge variant="outline" className="w-fit text-xs capitalize">
          {node.nodeType}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {node.description && <p className="text-muted-foreground text-sm">{node.description}</p>}

        {node.keyTerms && (node.keyTerms as string[]).length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">Key Terms</p>
            <div className="flex flex-wrap gap-1">
              {(node.keyTerms as string[]).map((term) => (
                <Badge key={term} variant="secondary" className="text-xs">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Provider Selection */}
        <AIProviderSelector mode="multi" selected={providers} onSelect={setProviders} compact />

        {/* Actions */}
        <div className="space-y-2">
          {!hasTutorial && (
            <Button
              className="w-full"
              size="sm"
              disabled={providers.length === 0 || generateTutorial.isPending}
              onClick={() =>
                generateTutorial.mutate({
                  nodeId,
                  providers,
                  mode: providers.length > 1 ? "multi" : "single",
                })
              }
            >
              {generateTutorial.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="mr-2 h-3.5 w-3.5" />
              )}
              Generate Tutorial
            </Button>
          )}

          {hasTutorial && (
            <>
              <Link href={`/syllabus/${syllabusId}/tutorial/${nodeId}` as "/"}>
                <Button variant="outline" className="w-full" size="sm">
                  <BookOpen className="mr-2 h-3.5 w-3.5" />
                  View Tutorial
                </Button>
              </Link>

              <Button
                className="w-full"
                size="sm"
                variant="secondary"
                disabled={providers.length === 0 || generateMCQs.isPending}
                onClick={() =>
                  generateMCQs.mutate({
                    nodeId,
                    tutorialId: tutorialQuery.data!.id,
                    count: 10,
                    difficulty: "mixed",
                    providers,
                  })
                }
              >
                {generateMCQs.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <HelpCircle className="mr-2 h-3.5 w-3.5" />
                )}
                Generate MCQs
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
