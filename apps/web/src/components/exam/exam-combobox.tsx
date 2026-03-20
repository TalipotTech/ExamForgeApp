"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, ExternalLink, BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ExamOption {
  id: string;
  name: string;
  category: string | null;
  conductingBody: string | null;
  examDate: Date | string | null;
  questionCount: number | null;
  subjects: string[] | null;
  status: string | null;
  officialUrl: string | null;
  hasSyllabus: boolean;
}

interface ExamComboboxProps {
  exams: ExamOption[];
  value: string;
  onValueChange: (examId: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ExamCombobox({
  exams,
  value,
  onValueChange,
  isLoading = false,
  placeholder = "Select an exam...",
}: ExamComboboxProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const selectedExam = exams.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading exams...
            </span>
          ) : selectedExam ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{selectedExam.name}</span>
              {selectedExam.hasSyllabus && (
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  Syllabus
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search exams..." />
          <CommandList>
            <CommandEmpty>No exams found.</CommandEmpty>
            <CommandGroup>
              {exams.map((exam) => (
                <CommandItem
                  key={exam.id}
                  value={`${exam.name} ${exam.category ?? ""} ${exam.conductingBody ?? ""}`}
                  onSelect={() => {
                    onValueChange(exam.id);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start gap-1 py-2.5"
                >
                  <div className="flex w-full items-center gap-2">
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === exam.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate text-sm font-medium">{exam.name}</span>
                    <Link
                      href={`/exams/${exam.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      title="View exam details"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-1.5 pl-6">
                    {exam.category && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {exam.category}
                      </Badge>
                    )}
                    {exam.hasSyllabus && (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 px-1.5 py-0 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      >
                        <BookOpen className="mr-0.5 size-2.5" />
                        Syllabus
                      </Badge>
                    )}
                    {exam.questionCount != null && exam.questionCount > 0 && (
                      <span className="text-muted-foreground text-[10px]">
                        {exam.questionCount} Qs
                      </span>
                    )}
                    {exam.conductingBody && (
                      <span className="text-muted-foreground max-w-[150px] truncate text-[10px]">
                        {exam.conductingBody}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
