import { redirect } from "next/navigation";

/**
 * Legacy URL — the AI question-generator UI now lives under the
 * grouped Question Generation workflow, alongside Pattern Analysis
 * in the sidebar's support section.
 */
export default function Page(): never {
  redirect("/admin/question-generation/generate");
}
