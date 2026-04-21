import { redirect } from "next/navigation";

/**
 * Legacy URL — the Content Hub now lives under the grouped Question
 * Generation workflow. Any bookmarks / external links / old docs
 * pointing here get a permanent bounce to the new canonical URL.
 */
export default function Page(): never {
  redirect("/admin/question-generation/content-hub");
}
