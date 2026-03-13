"use client";

import { useState, useMemo } from "react";
import { Plus, Loader2, Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ExamMapperProps = {
  documentId: string;
  currentExamId?: string | null;
  onMapped: (examId: string) => void;
};

const CONDUCTING_BODIES = [
  "Kerala PSC",
  "UPSC",
  "NTA",
  "PCI",
  "GPSC",
  "MPSC",
  "TNPSC",
  "APPSC",
  "KPSC",
  "Other",
] as const;

type FlatExam = {
  id: string;
  name: string;
  category: string | null;
  conductingBody: string;
};

export function ExamMapper({
  documentId,
  currentExamId,
  onMapped,
}: ExamMapperProps): React.ReactElement {
  const [comboOpen, setComboOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newExam, setNewExam] = useState({
    name: "",
    conductingBody: "",
    category: "",
  });

  const examsQuery = trpc.portalIngestion.getExamsByCategory.useQuery();
  const mapMutation = trpc.portalIngestion.mapDocumentExam.useMutation({
    onSuccess: (_data, variables) => {
      const examId = variables.examId ?? "";
      onMapped(examId);
    },
  });

  // Flatten grouped exams for search
  const flatExams = useMemo((): FlatExam[] => {
    const grouped = examsQuery.data ?? {};
    const list: FlatExam[] = [];
    for (const [body, exams] of Object.entries(grouped)) {
      for (const exam of exams) {
        list.push({ ...exam, conductingBody: body });
      }
    }
    return list;
  }, [examsQuery.data]);

  // Find the currently selected exam name
  const selectedExam = flatExams.find((e) => e.id === currentExamId);

  // Find duplicates/similar names when creating a new exam
  const similarExams = useMemo((): FlatExam[] => {
    if (!newExam.name || newExam.name.length < 3) return [];
    const q = newExam.name.toLowerCase();
    return flatExams
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          q.includes(e.name.toLowerCase()) ||
          // Fuzzy: check if all words in query appear in exam name
          q.split(/\s+/).every((w) => e.name.toLowerCase().includes(w)),
      )
      .slice(0, 5);
  }, [newExam.name, flatExams]);

  const handleSelectExam = (examId: string): void => {
    setComboOpen(false);
    mapMutation.mutate({ documentId, examId });
  };

  const handleCreateAndMap = (): void => {
    if (!newExam.name || !newExam.conductingBody || !newExam.category) return;
    mapMutation.mutate(
      {
        documentId,
        createExam: {
          name: newExam.name,
          conductingBody: newExam.conductingBody,
          category: newExam.category,
        },
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setNewExam({ name: "", conductingBody: "", category: "" });
          examsQuery.refetch();
        },
      },
    );
  };

  const isPending = mapMutation.isPending;

  return (
    <>
      <div className="flex items-center gap-2">
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboOpen}
              className="h-8 w-[280px] justify-between text-xs font-normal"
              disabled={isPending}
            >
              {selectedExam
                ? `${selectedExam.name}${selectedExam.category ? ` (${selectedExam.category})` : ""}`
                : "Search exams..."}
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Type to search exams..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty className="text-muted-foreground py-3 text-center text-xs">
                  No exam found.
                </CommandEmpty>
                {Object.entries(examsQuery.data ?? {}).map(([body, exams]) => (
                  <CommandGroup key={body} heading={body}>
                    {exams.map((exam) => (
                      <CommandItem
                        key={exam.id}
                        value={`${body} ${exam.name} ${exam.category ?? ""}`}
                        onSelect={() => handleSelectExam(exam.id)}
                        className="text-xs"
                      >
                        <Check
                          className={cn(
                            "mr-1.5 h-3 w-3",
                            currentExamId === exam.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {exam.name}
                        {exam.category && (
                          <span className="text-muted-foreground ml-1">({exam.category})</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setComboOpen(false);
                      setDialogOpen(true);
                    }}
                    className="text-xs"
                  >
                    <Plus className="mr-1.5 h-3 w-3" />
                    Create new exam
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {isPending && <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />}
      </div>

      {/* Create New Exam Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Create new exam</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            {/* Exam Name with live duplicate check */}
            <div className="grid gap-1.5">
              <Label htmlFor="exam-name" className="text-xs">
                Exam name
              </Label>
              <Input
                id="exam-name"
                placeholder="e.g. GPAT 2026"
                value={newExam.name}
                onChange={(e) => setNewExam((prev) => ({ ...prev, name: e.target.value }))}
                className="h-8 text-xs"
              />
              {/* Duplicate suggestions */}
              {similarExams.length > 0 && (
                <div className="space-y-1 rounded-md border border-yellow-200 bg-yellow-50 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-yellow-700">
                    <AlertTriangle className="h-3 w-3" />
                    Similar exams already exist:
                  </div>
                  {similarExams.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="block w-full cursor-pointer rounded px-1.5 py-0.5 text-left text-[11px] text-yellow-800 hover:bg-yellow-100"
                      onClick={() => {
                        // Use this existing exam instead
                        setDialogOpen(false);
                        setNewExam({ name: "", conductingBody: "", category: "" });
                        mapMutation.mutate({ documentId, examId: e.id });
                      }}
                    >
                      {e.name}
                      <span className="ml-1 text-yellow-600">
                        ({e.conductingBody}
                        {e.category ? `, ${e.category}` : ""})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Conducting Body */}
            <div className="grid gap-1.5">
              <Label htmlFor="conducting-body" className="text-xs">
                Conducting body
              </Label>
              <Select
                value={newExam.conductingBody}
                onValueChange={(val) => setNewExam((prev) => ({ ...prev, conductingBody: val }))}
              >
                <SelectTrigger id="conducting-body" className="h-8 text-xs">
                  <SelectValue placeholder="Select body..." />
                </SelectTrigger>
                <SelectContent>
                  {CONDUCTING_BODIES.map((body) => (
                    <SelectItem key={body} value={body} className="text-xs">
                      {body}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category with suggestions */}
            <div className="grid gap-1.5">
              <Label htmlFor="exam-category" className="text-xs">
                Category
              </Label>
              <Input
                id="exam-category"
                placeholder="e.g. Pharmacy, Engineering"
                value={newExam.category}
                onChange={(e) => setNewExam((prev) => ({ ...prev, category: e.target.value }))}
                className="h-8 text-xs"
                list="category-suggestions"
              />
              {/* Datalist for category suggestions from existing exams */}
              <datalist id="category-suggestions">
                {[...new Set(flatExams.map((e) => e.category).filter(Boolean))].map((cat) => (
                  <option key={cat} value={cat!} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateAndMap}
              disabled={isPending || !newExam.name || !newExam.conductingBody || !newExam.category}
              className="h-7 text-xs"
            >
              {isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Create & map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
