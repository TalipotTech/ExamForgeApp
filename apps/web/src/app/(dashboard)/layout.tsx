"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/user-menu";
import { VerificationBanner } from "@/components/verification-banner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
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
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_ROLES = ["admin", "superadmin"];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  group?: string;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home, adminOnly: true, group: "core" },
  { href: "/questions", label: "Questions", icon: BookOpen, adminOnly: true, group: "core" },
  { href: "/generate", label: "Generate", icon: Sparkles, adminOnly: true, group: "core" },
  { href: "/exams/start", label: "Exam", icon: Play, adminOnly: true, group: "core" },
  { href: "/scraper", label: "Scraper", icon: Bot, adminOnly: true, group: "content" },
  {
    href: "/scraper/discovery",
    label: "Discovery",
    icon: Compass,
    adminOnly: true,
    group: "content",
  },
  { href: "/scraper/ingest", label: "Ingest", icon: FileInput, adminOnly: true, group: "content" },
  { href: "/syllabus", label: "Syllabus", icon: GraduationCap, adminOnly: true, group: "content" },
  {
    href: "/admin/tutorials",
    label: "Tutorials",
    icon: BookMarked,
    adminOnly: true,
    group: "content",
  },
  {
    href: "/admin/patterns",
    label: "Patterns",
    icon: BarChart3,
    adminOnly: true,
    group: "content",
  },
  { href: "/learn", label: "Learn", icon: Library, group: "content" },
  { href: "/dashboard/find", label: "Find", icon: Search, adminOnly: true, group: "content" },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark, adminOnly: true, group: "content" },
];

const STUDENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/learn", label: "Learn", icon: Library },
  { href: "/exams/start", label: "Start Exam", icon: Play },
  { href: "/dashboard/my-exams", label: "My Exams", icon: FileQuestion },
  { href: "/dashboard/notes", label: "My Notes", icon: StickyNote },
  { href: "/dashboard/topics", label: "My Topics", icon: BookMarked },
  { href: "/dashboard/ai-chat", label: "AI Chat", icon: MessageSquare },
  // { href: "/dashboard/voice-exam", label: "Voice Tutor", icon: Mic }, // TODO: re-enable after polish
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/exams/start") return pathname === "/exams/start";
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/admin") return pathname === "/admin";
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
    if (item.href === "/dashboard/profile" && !isSubscriber && !isAdmin) return false;
    return true;
  });

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link
            href={isAdmin ? "/admin" : "/dashboard"}
            className="shrink-0 text-lg font-bold tracking-tight"
          >
            ExamForge
          </Link>

          {/* Desktop nav — scrollable for admin's many items */}
          <nav
            className={`ml-4 hidden items-center text-sm md:flex ${
              isAdmin ? "scrollbar-none gap-1 overflow-x-auto" : "gap-5"
            }`}
          >
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const active = isLinkActive(pathname, item.href);
              // Add separator between admin nav groups
              const prevGroup =
                idx > 0 ? (navItems[idx - 1] as NavItem & { group?: string }).group : null;
              const currentGroup = (item as NavItem & { group?: string }).group;
              const showSeparator =
                isAdmin && prevGroup && currentGroup && prevGroup !== currentGroup;

              return (
                <div key={item.href} className="flex items-center">
                  {showSeparator && <div className="bg-border mx-1 h-4 w-px shrink-0" />}
                  <Link
                    href={item.href as "/"}
                    className={`flex shrink-0 items-center gap-1 whitespace-nowrap transition-colors ${
                      isAdmin ? "rounded-md px-2 py-1.5" : "gap-1.5"
                    } ${
                      active
                        ? isAdmin
                          ? "bg-accent text-foreground font-medium"
                          : "text-foreground font-medium"
                        : "text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
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
                  {navItems.map((item, idx) => {
                    const Icon = item.icon;
                    const active = isLinkActive(pathname, item.href);
                    const prevGroup =
                      idx > 0 ? (navItems[idx - 1] as NavItem & { group?: string }).group : null;
                    const currentGroup = (item as NavItem & { group?: string }).group;
                    const showSeparator =
                      isAdmin && prevGroup && currentGroup && prevGroup !== currentGroup;

                    return (
                      <div key={item.href}>
                        {showSeparator && <div className="my-1.5 border-t" />}
                        <Link
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
                      </div>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {!isAdmin && <VerificationBanner />}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
