import type { Metadata } from "next";
import { SourceList } from "@/components/scrape/source-list";

export const metadata: Metadata = {
  title: "Web Scraper | ExamForge",
  description: "Scrape exam questions from websites automatically",
};

export default function ScrapePage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Web Scraper</h1>
        <p className="text-muted-foreground">
          Add website sources to automatically extract exam questions using AI.
        </p>
      </div>
      <SourceList />
    </div>
  );
}
