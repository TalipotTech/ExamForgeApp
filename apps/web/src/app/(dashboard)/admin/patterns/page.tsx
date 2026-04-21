import { redirect } from "next/navigation";

/**
 * Legacy URL — Pattern Analysis now lives under the grouped Question
 * Generation workflow (alongside Help in the sidebar's support
 * section) since its output is what feeds the Pattern Exam generator.
 */
export default function Page(): never {
  redirect("/admin/question-generation/patterns");
}
