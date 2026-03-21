"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  FileText,
  CheckCircle2,
  Circle,
  ListChecks,
  X,
  Sparkles,
  Mic,
} from "lucide-react";

type TreeNode = {
  id: number;
  parentId: number | null;
  nodeType: string;
  title: string;
  depth: number;
  sortOrder: number;
  hasTutorial: boolean;
  completionPercent: number;
};

interface LearnSidebarProps {
  nodes: TreeNode[];
  activeNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  onGenerateExam?: (nodeIds: number[]) => void;
  examId?: string;
}

export function LearnSidebar({
  nodes,
  activeNodeId,
  onSelectNode,
  onGenerateExam,
  examId,
}: LearnSidebarProps): React.ReactElement {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<number>>(new Set());

  const toggleSelection = useCallback((nodeId: number) => {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);
  const tree = useMemo(() => {
    const childrenMap = new Map<number | null, TreeNode[]>();
    for (const node of nodes) {
      if (!childrenMap.has(node.parentId)) {
        childrenMap.set(node.parentId, []);
      }
      childrenMap.get(node.parentId)!.push(node);
    }

    function buildTree(parentId: number | null): TreeNode[] {
      return (childrenMap.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return { roots: buildTree(null), childrenMap };
  }, [nodes]);

  return (
    <div className="flex flex-col gap-2">
      {/* Selection mode toggle */}
      <div className="flex items-center gap-2 px-1">
        <Button
          variant={selectionMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            setSelectionMode(!selectionMode);
            if (selectionMode) setSelectedNodes(new Set());
          }}
        >
          {selectionMode ? (
            <>
              <X className="h-3 w-3" />
              Cancel
            </>
          ) : (
            <>
              <ListChecks className="h-3 w-3" />
              Select Topics
            </>
          )}
        </Button>
      </div>

      {/* Selection action bar */}
      {selectionMode && selectedNodes.size > 0 && (
        <div className="bg-primary/10 rounded-md p-2">
          <p className="text-primary mb-2 text-xs">
            {selectedNodes.size} topic{selectedNodes.size > 1 ? "s" : ""} selected
          </p>
          <div className="flex flex-col gap-1.5">
            <Button
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={() => {
                onGenerateExam?.(Array.from(selectedNodes));
                setSelectionMode(false);
                setSelectedNodes(new Set());
              }}
            >
              <Sparkles className="h-3 w-3" />
              Generate Exam
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-full gap-1.5 text-xs" asChild>
              <a href={examId ? `/dashboard/voice-exam?examId=${examId}` : "/dashboard/voice-exam"}>
                <Mic className="h-3 w-3" />
                Voice Quiz
              </a>
            </Button>
          </div>
        </div>
      )}

      <nav className="space-y-1">
        {tree.roots.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            childrenMap={tree.childrenMap}
            activeNodeId={activeNodeId}
            onSelectNode={onSelectNode}
            depth={0}
            selectionMode={selectionMode}
            selectedNodes={selectedNodes}
            onToggleSelection={toggleSelection}
          />
        ))}
      </nav>
    </div>
  );
}

const NODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  unit: GraduationCap,
  chapter: BookOpen,
  topic: FileText,
  subtopic: FileText,
};

function TreeItem({
  node,
  childrenMap,
  activeNodeId,
  onSelectNode,
  depth,
  selectionMode = false,
  selectedNodes,
  onToggleSelection,
}: {
  node: TreeNode;
  childrenMap: Map<number | null, TreeNode[]>;
  activeNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  depth: number;
  selectionMode?: boolean;
  selectedNodes?: Set<number>;
  onToggleSelection?: (nodeId: number) => void;
}): React.ReactElement {
  const children = (childrenMap.get(node.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const hasChildren = children.length > 0;
  const isActive = node.id === activeNodeId;
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-expand if this branch contains the active node
    if (isActive) return true;
    if (!activeNodeId) return depth === 0;
    return containsNode(node.id, activeNodeId, childrenMap);
  });

  const Icon = NODE_ICONS[node.nodeType] ?? FileText;
  const isLeaf = !hasChildren;
  const isSelected = selectedNodes?.has(node.id) ?? false;

  const handleClick = (): void => {
    if (selectionMode && isLeaf && node.hasTutorial) {
      onToggleSelection?.(node.id);
      return;
    }
    if (isLeaf && node.hasTutorial) {
      onSelectNode(node.id);
    } else if (hasChildren) {
      setIsOpen((prev) => !prev);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          isActive && !selectionMode
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          isSelected && "bg-primary/10 ring-primary/30 ring-1",
          !node.hasTutorial && isLeaf && "opacity-50",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        disabled={isLeaf && !node.hasTutorial}
        title={!node.hasTutorial && isLeaf ? "Tutorial not generated yet" : undefined}
      >
        {hasChildren && (
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-90")}
          />
        )}
        {selectionMode && isLeaf && node.hasTutorial ? (
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            className="accent-primary h-3 w-3 shrink-0"
          />
        ) : isLeaf ? (
          node.completionPercent >= 100 ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
          ) : (
            <Circle className="h-3 w-3 shrink-0" />
          )
        ) : !hasChildren ? (
          <Icon className="h-3 w-3 shrink-0" />
        ) : null}
        <span className="min-w-0 truncate">{node.title}</span>
      </button>

      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              childrenMap={childrenMap}
              activeNodeId={activeNodeId}
              onSelectNode={onSelectNode}
              depth={depth + 1}
              selectionMode={selectionMode}
              selectedNodes={selectedNodes}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function containsNode(
  parentId: number,
  targetId: number,
  childrenMap: Map<number | null, TreeNode[]>,
): boolean {
  const children = childrenMap.get(parentId) ?? [];
  for (const child of children) {
    if (child.id === targetId) return true;
    if (containsNode(child.id, targetId, childrenMap)) return true;
  }
  return false;
}
