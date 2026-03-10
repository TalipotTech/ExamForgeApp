import Link from "next/link";
import { UserMenu } from "@/components/user-menu";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="ml-8 flex items-center gap-6 text-sm">
            <Link
              href={"/questions" as "/"}
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              Question Bank
            </Link>
            <Link
              href={"/generate" as "/"}
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              Generate
            </Link>
            <Link
              href={"/exams/start" as "/"}
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              Start Exam
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
