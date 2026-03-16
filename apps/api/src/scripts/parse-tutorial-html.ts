/**
 * One-time migration script: reads all tutorial HTML files from storage,
 * parses them into sections, and updates the tutorial_files rows.
 *
 * Usage: npx tsx apps/api/src/scripts/parse-tutorial-html.ts
 */
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { tutorialFiles } from "@examforge/shared/db/schema";
import { getTutorialStorage } from "../services/tutorial-storage.js";
import { parseHtmlToSections } from "../services/tutorial-html-parser.js";
import { config } from "dotenv";
import { resolve } from "node:path";

// Try monorepo root first, then cwd
config({ path: resolve(process.cwd(), "../../.env.local") });
config({ path: resolve(process.cwd(), ".env.local") });

async function main(): Promise<void> {
  const db = createDatabase(process.env.DATABASE_URL!);
  const storage = getTutorialStorage();

  // Get all current tutorials that don't have sections yet
  const tutorials = await db
    .select({
      id: tutorialFiles.id,
      fileKey: tutorialFiles.fileKey,
      title: tutorialFiles.title,
      sections: tutorialFiles.sections,
    })
    .from(tutorialFiles)
    .where(eq(tutorialFiles.isCurrent, true));

  console.log(`Found ${tutorials.length} current tutorials to process`);

  let processed = 0;
  let failed = 0;

  for (const tutorial of tutorials) {
    // Skip if already has sections
    if (tutorial.sections && tutorial.sections.length > 0) {
      console.log(`  [skip] "${tutorial.title}" — already has sections`);
      continue;
    }

    try {
      // Read HTML from storage
      const fileExists = await storage.exists(tutorial.fileKey);
      if (!fileExists) {
        console.warn(`  [warn] "${tutorial.title}" — file not found: ${tutorial.fileKey}`);
        failed++;
        continue;
      }
      const html = await storage.download(tutorial.fileKey);

      // Parse into sections
      const { sections, plainText } = parseHtmlToSections(html);

      // Update DB
      await db
        .update(tutorialFiles)
        .set({
          sections,
          plainText,
          updatedAt: new Date(),
        })
        .where(eq(tutorialFiles.id, tutorial.id));

      processed++;
      console.log(
        `  [ok] "${tutorial.title}" — ${sections.length} sections, ${plainText.length} chars`,
      );
    } catch (err) {
      failed++;
      console.error(
        `  [err] "${tutorial.title}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(`\nDone! Processed: ${processed}, Failed: ${failed}, Total: ${tutorials.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
