import { redirect } from "next/navigation";

/**
 * Legacy URL — Verification now lives under the grouped Question
 * Generation workflow.
 */
export default function Page(): never {
  redirect("/admin/question-generation/verification");
}
