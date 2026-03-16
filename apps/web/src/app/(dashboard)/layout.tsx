"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/user-menu";
import { VerificationBanner } from "@/components/verification-banner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Shield,
  BookOpen,
  Sparkles,
  Play,
  Bot,
  Compass,
  FileInput,
  GraduationCap,
  Search,
  Bookmark,
  BookMarked,
  Library,
  FileQuestion,
  User,
  Menu,
  Home,
  Settings,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_ROLES = ["admin", "superadmin"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/questions", label: "Question Bank", icon: BookOpen, adminOnly: true },
  { href: "/generate", label: "Generate", icon: Sparkles, adminOnly: true },
  { href: "/exams/start", label: "Start Exam", icon: Play, adminOnly: true },
  { href: "/scraper", label: "Scraper", icon: Bot, adminOnly: true },
  { href: "/scraper/discovery", label: "Discovery", icon: Compass, adminOnly: true },
  { href: "/scraper/ingest", label: "Ingest", icon: FileInput, adminOnly: true },
  { href: "/syllabus", label: "Syllabus", icon: GraduationCap, adminOnly: true },
  { href: "/admin/tutorials", label: "Tutorials", icon: BookMarked, adminOnly: true },
  { href: "/learn", label: "Learn", icon: Library },
  { href: "/dashboard/find", label: "Find Content", icon: Search, adminOnly: true },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark, adminOnly: true },
];

const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/learn", label: "Learn", icon: Library },
  { href: "/exams/start", label: "Start Exam", icon: Play },
  { href: "/dashboard/my-exams", label: "My Exams", icon: FileQuestion },
  { href: "/dashboard/notes", label: "My Notes", icon: StickyNote },
  { href: "/dashboard/topics", label: "My Topics", icon: BookMarked },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/exams/start") return pathname === "/exams/start";
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = ADMIN_ROLES.includes(session?.user?.role ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSubscriber =
    (session?.user as { isSubscriber?: boolean } | undefined)?.isSubscriber ?? false;
  const allNavItems = isAdmin ? ADMIN_NAV : STUDENT_NAV;
  const navItems = allNavItems.filter((item) => {
    // Hide Profile for non-subscribers
    if (item.href === "/dashboard/profile" && !isSubscriber && !isAdmin) return false;
    return true;
  });

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>

          {/* Desktop nav — hidden on mobile */}
          <nav className="ml-8 hidden items-center gap-5 text-sm md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isLinkActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as "/"}
                  className={`flex items-center gap-1.5 transition-colors ${
                    active
                      ? "text-foreground font-medium"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href={"/admin" as "/"}
                className={`flex items-center gap-1.5 transition-colors ${
                  pathname.startsWith("/admin")
                    ? "text-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                <Shield className="size-3.5" />
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <UserMenu />

            {/* Mobile hamburger — hidden on desktop */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="text-left text-lg font-bold">ExamForge</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-2 pt-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isLinkActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href as "/"}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <Icon className="size-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                  {isAdmin && (
                    <>
                      <div className="my-2 border-t" />
                      <Link
                        href={"/admin" as "/"}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                          pathname.startsWith("/admin")
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <Shield className="size-4" />
                        Admin Panel
                      </Link>
                    </>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <VerificationBanner />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
