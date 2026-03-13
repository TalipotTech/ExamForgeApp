import Link from "next/link";
import { UserMenu } from "@/components/user-menu";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="ml-8 flex items-center gap-6 text-sm">
            <Link
              href={"/questions" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Question Bank
            </Link>
            <Link
              href={"/generate" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Generate
            </Link>
            <Link
              href={"/exams/start" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Start Exam
            </Link>
            <Link
              href={"/scraper" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Scraper
            </Link>
            <Link
              href={"/scraper/discovery" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Discovery
            </Link>
            <Link
              href={"/scraper/ingest" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Ingest
            </Link>
            <Link
              href={"/syllabus" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Syllabus
            </Link>
            <Link
              href={"/dashboard/find" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Find Content
            </Link>
            <Link
              href={"/dashboard/saved" as "/"}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Saved
            </Link>
          </nav>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
