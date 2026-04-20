/**
 * Shared display helpers for examination rows — used by the public
 * `/exams` catalog and by admin pages (/admin/patterns, /admin/discovery)
 * so date formatting, countdown and status badges stay consistent across
 * student-facing and admin-facing views.
 *
 * Dates from the scraper come in many shapes (DD/MM/YYYY, ISO, "May 2026",
 * or null). All helpers accept `string | null | undefined` defensively.
 */

/** Parse a scraped date string; handles DD/MM/YYYY + ISO fallback. */
export function parseExamDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  let d: Date;
  if (parts.length === 3 && parts[0]!.length <= 2) {
    d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  } else {
    d = new Date(dateStr);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days until the exam date (negative when past). */
export function daysUntil(dateStr: string | null | undefined): number | null {
  const d = parseExamDate(dateStr);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export interface FormattedDate {
  text: string;
  className: string;
}

/** Pretty "15 May 2026" or the original string as fallback, or "TBA". */
export function formatExamDate(dateStr: string | null | undefined): FormattedDate {
  if (!dateStr) return { text: "TBA", className: "text-muted-foreground" };
  const d = parseExamDate(dateStr);
  if (!d) return { text: dateStr, className: "" };
  return {
    text: d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    className: "",
  };
}

export interface StatusBadge {
  label: "Upcoming" | "Completed" | "Postponed" | "Cancelled" | "Scheduled";
  className: string;
}

/** Color-coded status from optional raw status + date countdown. */
export function getStatusBadge(
  status: string | null | undefined,
  days: number | null,
): StatusBadge {
  if (status === "postponed")
    return {
      label: "Postponed",
      className: "border-yellow-500/50 bg-yellow-500/10 text-yellow-600",
    };
  if (status === "cancelled")
    return {
      label: "Cancelled",
      className: "border-red-500/50 bg-red-500/10 text-red-600",
    };
  if (days !== null && days > 0)
    return {
      label: "Upcoming",
      className: "border-green-500/50 bg-green-500/10 text-green-600",
    };
  if (days !== null && days <= 0)
    return {
      label: "Completed",
      className: "border-slate-500/50 bg-slate-500/10 text-slate-600",
    };
  return {
    label: "Scheduled",
    className: "border-blue-500/50 bg-blue-500/10 text-blue-600",
  };
}

/** Countdown text: "15 days left" / "Completed" / "TBA". */
export function countdownLabel(days: number | null): string {
  if (days === null) return "TBA";
  if (days > 0) return `${days} days left`;
  return "Completed";
}

/** Color class for the countdown: yellow when imminent (≤30d). */
export function countdownClassName(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days > 0 && days <= 30) return "text-yellow-600";
  if (days > 0) return "text-green-600";
  return "text-muted-foreground";
}
