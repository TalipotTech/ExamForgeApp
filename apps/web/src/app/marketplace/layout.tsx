"use client";

/**
 * Public marketplace shell — minimal header with brand + cross-links to
 * the rest of the public surface. Unauthenticated users can browse from
 * here and upgrade into the creator flow via "Become a creator".
 *
 * Kept intentionally simple (no user menu, no sidebar) so it feels like
 * a public marketplace landing experience rather than the dashboard.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated" && !!session?.user;

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/exams"
              className="text-foreground/80 hover:text-foreground hidden text-sm transition-colors sm:inline"
            >
              Exams
            </Link>
            <Link href="/marketplace" className="text-foreground text-sm font-medium">
              Marketplace
            </Link>
            <Link href="/creator">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">Become a creator</span>
                <span className="sm:hidden">Creator</span>
              </Button>
            </Link>
            {isAuthed ? (
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t py-6">
        <div className="text-muted-foreground mx-auto max-w-6xl px-4 text-center text-xs">
          ExamForge marketplace — content from verified creators. All sales final after 7-day
          settlement.
        </div>
      </footer>
    </div>
  );
}
