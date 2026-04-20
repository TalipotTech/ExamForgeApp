"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, Check, Link2, PlusCircle, Search as SearchIcon, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  ExaminationTitle,
  ExaminationDate,
  ExaminationMeta,
} from "@/components/exam/examination-info";
import {
  compareByExamDate,
  daysUntil,
  matchesTimeFilter,
  type ExaminationTimeFilter,
} from "@/lib/exam-display";

type InventoryRow =
  // Shape comes from the server; keep it loose here to avoid a second type.
  {
    rowKey: string;
    examName: string;
    postName: string | null;
    categoryNumber: string | null;
    examDate: string | null;
    examTime: string | null;
    venue: string | null;
    department: string | null;
    stage: string | null;
    status: string | null;
    documentId: string;
    portalName: string | null;
    examCategory: string | null;
    hasSyllabus: boolean;
    canonicalExamId: string | null;
    canonicalName: string | null;
    matchedBy: "exact" | "normalized" | "alias" | "token" | "none";
    matchConfidence: number;
    hasPattern: boolean;
    patternConfidence: number | null;
    patternPapers: number;
    patternVersion: number | null;
  };

export default function AdminPatternsPage(): React.ReactElement {
  const inventoryQuery = trpc.exam.getScrapedExaminationInventory.useQuery(undefined, {
    staleTime: 60_000,
  });

  const [search, setSearch] = useState("");
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [timeFilter, setTimeFilter] = useState<ExaminationTimeFilter>("all");

  const [linkingRow, setLinkingRow] = useState<InventoryRow | null>(null);
  const [creatingRow, setCreatingRow] = useState<InventoryRow | null>(null);

  const rows = (inventoryQuery.data ?? []) as InventoryRow[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (showUnmatchedOnly && r.canonicalExamId) return false;
      if (!matchesTimeFilter(timeFilter, daysUntil(r.examDate))) return false;
      if (!term) return true;
      return (
        r.examName.toLowerCase().includes(term) ||
        r.postName?.toLowerCase().includes(term) ||
        r.canonicalName?.toLowerCase().includes(term) ||
        r.categoryNumber?.toLowerCase().includes(term)
      );
    });
    // Sort: upcoming (nearest first) → TBA → completed (most recent first)
    return [...matched].sort((a, b) => compareByExamDate(a.examDate, b.examDate));
  }, [rows, search, showUnmatchedOnly, timeFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const matched = rows.filter((r) => r.canonicalExamId).length;
    const withPattern = rows.filter((r) => r.hasPattern).length;
    const unmatched = total - matched;
    const upcoming = rows.filter((r) => {
      const d = daysUntil(r.examDate);
      return d !== null && d > 0;
    }).length;
    const completed = rows.filter((r) => {
      const d = daysUntil(r.examDate);
      return d !== null && d <= 0;
    }).length;
    return { total, matched, unmatched, withPattern, upcoming, completed };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="size-6" />
          Pattern Analysis
        </h1>
        <p className="text-muted-foreground text-sm">
          Examinations are sourced from the scraped portal calendar (same as{" "}
          <Link href={"/exams" as "/"} className="underline">
            /exams
          </Link>
          ). Each is matched to a canonical exam record so pattern analysis can run on it — link
          manually or create a new canonical when auto-match fails.
        </p>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Examinations" value={stats.total} />
        <StatChip label="Matched to canonical" value={stats.matched} />
        <StatChip label="Unmatched" value={stats.unmatched} tone="warn" />
        <StatChip label="With pattern" value={stats.withPattern} tone="ok" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3">
          <div className="flex flex-row items-start justify-between gap-3">
            <CardTitle className="text-base">Examinations</CardTitle>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={showUnmatchedOnly}
                  onChange={(e) => setShowUnmatchedOnly(e.target.checked)}
                  className="size-3.5"
                />
                Unmatched only
              </label>
              <div className="flex w-64 items-center gap-2">
                <SearchIcon className="text-muted-foreground size-3.5" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
          <TimeFilterTabs
            value={timeFilter}
            onChange={setTimeFilter}
            counts={{
              all: stats.total,
              upcoming: stats.upcoming,
              completed: stats.completed,
            }}
          />
        </CardHeader>
        <CardContent>
          {inventoryQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {rows.length === 0
                ? "No examinations yet. Ingest an examination-schedule PDF via the scraper to populate this."
                : "No examinations match the current filter."}
            </p>
          ) : (
            <>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* Examination takes the remaining space; other
                        columns have explicit widths so table-fixed
                        gives it everything that's left. Actions is
                        sized to fit two buttons ("Link" + "Create"). */}
                    <TableHead>Examination</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead className="w-36">Canonical Match</TableHead>
                    <TableHead className="w-20">Pattern</TableHead>
                    <TableHead className="w-52 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 150).map((r, idx) => {
                    const days = daysUntil(r.examDate);
                    const isCompleted = days !== null && days <= 0;
                    return (
                      <TableRow
                        key={`${r.rowKey}-${idx}`}
                        className={isCompleted ? "opacity-60" : ""}
                      >
                        <TableCell className="whitespace-normal break-words py-2 align-top">
                          <ExaminationTitle exam={r} />
                          <div className="mt-1.5">
                            <ExaminationMeta exam={r} compact />
                          </div>
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <ExaminationDate dateStr={r.examDate} />
                        </TableCell>
                        <TableCell className="whitespace-normal py-2 align-top">
                          <CanonicalMatchCell row={r} />
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          {r.hasPattern ? (
                            <Badge variant="default" className="text-[10px]">
                              {Math.round((r.patternConfidence ?? 0) * 100)}% · v
                              {r.patternVersion ?? 1}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right align-top">
                          <div className="flex justify-end gap-1">
                            {r.canonicalExamId ? (
                              <Link href={`/dashboard/exam/${r.canonicalExamId}/patterns` as "/"}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-xs"
                                >
                                  <Settings className="size-3.5" />
                                  Manage
                                </Button>
                              </Link>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-xs"
                                  onClick={() => setLinkingRow(r)}
                                >
                                  <Link2 className="size-3.5" />
                                  Link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-xs"
                                  onClick={() => setCreatingRow(r)}
                                >
                                  <PlusCircle className="size-3.5" />
                                  Create
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 150 && (
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  Showing 150 of {filtered.length} — refine the search to narrow down.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {linkingRow && (
        <LinkDialog
          row={linkingRow}
          onClose={() => setLinkingRow(null)}
          onLinked={() => {
            setLinkingRow(null);
            void inventoryQuery.refetch();
          }}
        />
      )}
      {creatingRow && (
        <CreateCanonicalDialog
          row={creatingRow}
          onClose={() => setCreatingRow(null)}
          onCreated={() => {
            setCreatingRow(null);
            void inventoryQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

// ─── Summary chip ────────────────────────────────────────

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}): React.ReactElement {
  const ring =
    tone === "ok"
      ? "border-green-500/30"
      : tone === "warn"
        ? "border-amber-500/40"
        : "border-border";
  return (
    <Card className={`border ${ring}`}>
      <CardContent className="p-3">
        <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
        <p className="text-xl font-semibold leading-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Canonical match cell ────────────────────────────────

function CanonicalMatchCell({ row }: { row: InventoryRow }): React.ReactElement {
  if (!row.canonicalExamId) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-[10px]">
        Not linked
      </Badge>
    );
  }
  const badgeVariant =
    row.matchedBy === "exact" || row.matchedBy === "normalized"
      ? "default"
      : row.matchedBy === "alias"
        ? "secondary"
        : "outline";
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="break-words text-[11px] font-medium leading-snug"
        title={row.canonicalName ?? undefined}
      >
        {row.canonicalName}
      </span>
      <Badge variant={badgeVariant} className="w-fit text-[9px] font-normal">
        {row.matchedBy} · {Math.round(row.matchConfidence * 100)}%
      </Badge>
    </div>
  );
}

// ─── Link to existing canonical dialog ───────────────────

function LinkDialog({
  row,
  onClose,
  onLinked,
}: {
  row: InventoryRow;
  onClose: () => void;
  onLinked: () => void;
}): React.ReactElement {
  const candidatesQuery = trpc.exam.listCanonicalExamsForLinking.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const linkMutation = trpc.exam.linkScrapedToCanonical.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.alreadyLinked ? "Already linked" : `Linked "${row.examName}" to canonical`,
      );
      onLinked();
    },
    onError: (err) => toast.error(err.message),
  });

  const selected = (candidatesQuery.data ?? []).find((c) => c.id === selectedId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to canonical exam</DialogTitle>
          <DialogDescription>
            Pick the canonical exam that &ldquo;{row.examName}&rdquo; should map to. The scraped
            name will be added to its aliases so future occurrences resolve automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Canonical exam</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {selected ? selected.name : "Select a canonical exam..."}
                <SearchIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search canonical exams..." />
                <CommandList>
                  <CommandEmpty>No canonical exam found.</CommandEmpty>
                  <CommandGroup>
                    {(candidatesQuery.data ?? []).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.conductingBody ?? ""}`}
                        onSelect={() => {
                          setSelectedId(c.id);
                          setPickerOpen(false);
                        }}
                      >
                        <Check
                          className={`size-3.5 ${
                            selectedId === c.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm">{c.name}</span>
                          <span className="text-muted-foreground text-[11px]">
                            {c.category}
                            {c.conductingBody ? ` · ${c.conductingBody}` : ""}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || linkMutation.isPending}
            onClick={() =>
              selectedId &&
              linkMutation.mutate({
                scrapedExamName: row.examName,
                canonicalExamId: selectedId,
              })
            }
          >
            {linkMutation.isPending ? "Linking..." : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create new canonical dialog ─────────────────────────

function CreateCanonicalDialog({
  row,
  onClose,
  onCreated,
}: {
  row: InventoryRow;
  onClose: () => void;
  onCreated: (canonicalId: string) => void;
}): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState(row.examName);
  const [category, setCategory] = useState(row.examCategory ?? "state_psc");
  const [conductingBody, setConductingBody] = useState(row.portalName ?? "");

  const createMutation = trpc.exam.createCanonicalFromScraped.useMutation({
    onSuccess: (data) => {
      toast.success(`Created canonical exam`);
      onCreated(data.canonicalExamId);
      router.push(`/dashboard/exam/${data.canonicalExamId}/patterns` as "/");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create canonical exam</DialogTitle>
          <DialogDescription>
            No canonical record matches &ldquo;{row.examName}&rdquo;. Create one — the scraped name
            will be seeded into its aliases so future occurrences auto-resolve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Canonical name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. state_psc, pharmacy, medical"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conducting body</Label>
            <Input
              value={conductingBody}
              onChange={(e) => setConductingBody(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Scraped alias: <span className="font-mono">{row.examName}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !category.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                scrapedExamName: row.examName,
                canonicalName: name.trim(),
                category: category.trim(),
                conductingBody: conductingBody.trim() || undefined,
              })
            }
          >
            {createMutation.isPending ? "Creating..." : "Create & Analyze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Time filter segmented tabs ──────────────────────────

function TimeFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: ExaminationTimeFilter;
  onChange: (v: ExaminationTimeFilter) => void;
  counts: { all: number; upcoming: number; completed: number };
}): React.ReactElement {
  const options: Array<{ key: ExaminationTimeFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "completed", label: "Completed", count: counts.completed },
  ];
  return (
    <div className="border-border inline-flex rounded-md border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            value === opt.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
          <span className={`ml-1.5 text-[10px] ${value === opt.key ? "opacity-80" : "opacity-60"}`}>
            {opt.count}
          </span>
        </button>
      ))}
    </div>
  );
}
