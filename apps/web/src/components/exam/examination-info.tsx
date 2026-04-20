/**
 * Compact examination display primitives — reused across admin tables
 * (/admin/patterns, /admin/discovery) and can be dropped into any
 * row to surface the same rich examination metadata the public
 * /exams catalog shows.
 */

"use client";

import { Building2, Calendar, Clock, Hash, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  countdownClassName,
  countdownLabel,
  daysUntil,
  formatExamDate,
  getStatusBadge,
} from "@/lib/exam-display";

export type ExaminationLike = {
  examName: string;
  postName?: string | null;
  examCategory?: string | null;
  examDate?: string | null;
  examTime?: string | null;
  venue?: string | null;
  department?: string | null;
  stage?: string | null;
  categoryNumber?: string | null;
  portalName?: string | null;
  status?: string | null;
};

/**
 * Title block: examName with optional postName subtitle + badge row
 * (category, status, stage).
 */
export function ExaminationTitle({
  exam,
  showStatus = true,
}: {
  exam: ExaminationLike;
  showStatus?: boolean;
}): React.ReactElement {
  const days = daysUntil(exam.examDate);
  const statusBadge = getStatusBadge(exam.status ?? null, days);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-medium capitalize leading-tight">
        {exam.examName.toLowerCase()}
      </div>
      {exam.postName && (
        <div className="text-muted-foreground text-xs capitalize">
          {exam.postName.toLowerCase()}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {exam.examCategory && (
          <Badge variant="secondary" className="text-[9px] font-normal capitalize">
            {exam.examCategory}
          </Badge>
        )}
        {showStatus && (
          <Badge variant="outline" className={`text-[9px] font-normal ${statusBadge.className}`}>
            {statusBadge.label}
          </Badge>
        )}
        {exam.stage && (
          <Badge variant="outline" className="text-[9px] font-normal capitalize">
            {exam.stage}
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * Date block: formatted exam date + countdown or completion note.
 * Designed for a narrow column (~110px).
 */
export function ExaminationDate({
  dateStr,
}: {
  dateStr: string | null | undefined;
}): React.ReactElement {
  const info = formatExamDate(dateStr);
  const days = daysUntil(dateStr);
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`font-mono text-xs font-semibold ${info.className}`}>{info.text}</span>
      <span className={`text-[10px] ${countdownClassName(days)}`}>{countdownLabel(days)}</span>
    </div>
  );
}

/**
 * Meta row: category number, venue, department, portal, exam time —
 * each prefixed by an icon. Only fields that are present render.
 * Wraps nicely in tight layouts.
 */
export function ExaminationMeta({
  exam,
  compact = false,
}: {
  exam: ExaminationLike;
  compact?: boolean;
}): React.ReactElement | null {
  const hasAny =
    exam.categoryNumber || exam.venue || exam.department || exam.portalName || exam.examTime;
  if (!hasAny) return null;

  const size = compact ? "size-2.5" : "size-3";
  return (
    <div
      className={`text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {exam.categoryNumber && (
        <span className="flex items-center gap-0.5">
          <Hash className={size} />
          Cat. {exam.categoryNumber}
        </span>
      )}
      {exam.examTime && (
        <span className="flex items-center gap-0.5">
          <Clock className={size} />
          {exam.examTime}
        </span>
      )}
      {exam.venue && (
        <span className="flex items-center gap-0.5">
          <MapPin className={size} />
          <span className="max-w-[16ch] truncate">{exam.venue}</span>
        </span>
      )}
      {exam.department && (
        <span className="flex items-center gap-0.5">
          <Building2 className={size} />
          <span className="max-w-[16ch] truncate">{exam.department}</span>
        </span>
      )}
      {exam.portalName && (
        <span className="flex items-center gap-0.5">
          <Calendar className={size} />
          <span className="max-w-[16ch] truncate">{exam.portalName}</span>
        </span>
      )}
    </div>
  );
}
