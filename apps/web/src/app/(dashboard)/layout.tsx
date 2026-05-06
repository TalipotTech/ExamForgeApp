"use client";

/**
 * Dashboard layout — left sidebar (collapsible) + thin top bar.
 *
 * Structure:
 *   ┌──────────┬──────────────────────────┐
 *   │          │  Top bar: toggle + user  │
 *   │ Sidebar  ├──────────────────────────┤
 *   │ (nav)    │                          │
 *   │          │  Main content            │
 *   │          │                          │
 *   └──────────┴──────────────────────────┘
 *
 * - Desktop: sidebar toggles between expanded (240px with labels) and
 *   collapsed (64px icons-only). State persisted to localStorage.
 * - Mobile: sidebar hidden by default; hamburger button opens it as a
 *   left-side drawer (Sheet).
 * - Question-Generation sub-pages render a nested sidebar inside the
 *   main content area — both sidebars coexist, like VS Code's activity
 *   bar + explorer panel.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/user-menu";
import { VerificationBanner } from "@/components/verification-banner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
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
  FlaskConical,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Sparkles,
  Package,
  MessageCircle,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const ADMIN_ROLES = ["admin", "superadmin"];
const SIDEBAR_COLLAPSED_KEY = "examforge.sidebar.collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  group?: string;
  // Only show when the creators ecosystem master flag is on.
  requiresCreators?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home, adminOnly: true, group: "core" },
  // Grouped question-generation workflow — each workflow step lives
  // inside its own nested sidebar at /admin/question-generation/*.
  {
    href: "/admin/question-generation",
    label: "Question Gen",
    icon: FlaskConical,
    adminOnly: true,
    group: "core",
  },
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
  { href: "/learn", label: "Learn", icon: Library, group: "content" },
  { href: "/dashboard/find", label: "Find", icon: Search, adminOnly: true, group: "content" },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark, adminOnly: true, group: "content" },
  // Creators ecosystem (only when master flag is on).
  // Marketplace is public, Creator Hub has its own /creator/* layout.
  {
    href: "/marketplace",
    label: "Marketplace",
    icon: Store,
    requiresCreators: true,
    group: "creators",
  },
  {
    href: "/creator",
    label: "Creator Hub",
    icon: Sparkles,
    requiresCreators: true,
    group: "creators",
  },
  // Admin-only — users + global settings. Pulled off the UserMenu so
  // they show up in the main nav alongside the other admin tools.
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true, group: "admin" },
  {
    href: "/admin/subscription-pool",
    label: "Subscription Pool",
    icon: Coins,
    adminOnly: true,
    group: "admin",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    adminOnly: true,
    group: "admin",
  },
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
  // Creators ecosystem — marketplace is public, creator hub lives at /creator/*
  {
    href: "/marketplace",
    label: "Marketplace",
    icon: Store,
    requiresCreators: true,
    group: "creators",
  },
  {
    href: "/dashboard/my-purchases",
    label: "My Purchases",
    icon: Package,
    requiresCreators: true,
    group: "creators",
  },
  {
    href: "/dashboard/classrooms",
    label: "Classrooms",
    icon: GraduationCap,
    requiresCreators: true,
    group: "creators",
  },
  {
    href: "/dashboard/doubts",
    label: "My Doubts",
    icon: MessageCircle,
    requiresCreators: true,
    group: "creators",
  },
  {
    href: "/creator",
    label: "Creator Hub",
    icon: Sparkles,
    requiresCreators: true,
    group: "creators",
  },
  { href: "/dashboard/profile", label: "Profile", icon: User, group: "settings" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, group: "settings" },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/exams/start") return pathname === "/exams/start";
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

/**
 * Renders the vertical nav list used by both the desktop sidebar and
 * the mobile drawer. Shared so the two stay in sync.
 */
function NavList({
  navItems,
  isAdmin,
  pathname,
  collapsed,
  onNavigate,
}: {
  navItems: NavItem[];
  isAdmin: boolean;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}): React.ReactElement {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {navItems.map((item, idx) => {
        const Icon = item.icon;
        const active = isLinkActive(pathname, item.href);
        const prevGroup = idx > 0 ? navItems[idx - 1]?.group : null;
        const currentGroup = item.group;
        const showSeparator = isAdmin && prevGroup && currentGroup && prevGroup !== currentGroup;

        return (
          <div key={item.href}>
            {showSeparator && <div className="border-border my-1.5 border-t" />}
            <Link
              href={item.href as "/"}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount + hydrate collapsed state from localStorage. Guarded so SSR
  // render and initial client render agree (both start expanded).
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable (privacy mode, tests) — fall back to default.
    }
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Ignore persistence errors.
      }
      return next;
    });
  }

  const isAdmin = mounted && ADMIN_ROLES.includes(session?.user?.role ?? "");
  const isSubscriber =
    mounted && ((session?.user as { isSubscriber?: boolean } | undefined)?.isSubscriber ?? false);
  const creatorsStatus = trpc.creator.status.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const creatorsEnabled = creatorsStatus.data?.enabled ?? false;
  const allNavItems = isAdmin ? ADMIN_NAV : STUDENT_NAV;
  const navItems = allNavItems.filter((item) => {
    if (item.href === "/dashboard/profile" && !isSubscriber && !isAdmin) return false;
    if (item.requiresCreators && !creatorsEnabled) return false;
    return true;
  });

  return (
    <div className="bg-background min-h-screen">
      {/* ── Desktop sidebar — fixed left rail ───────────────────────
          Width animates between w-60 (expanded) and w-16 (collapsed).
          Hidden below md; use the mobile drawer for small screens. */}
      <aside
        className={`bg-background fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Sidebar header.
            Expanded: brand link + collapse button (PanelLeftClose).
            Collapsed: a single centered expand button (PanelLeftOpen).
              The brand badge used to hide the only expand affordance
              in the collapsed state — replacing it with the icon
              button makes the toggle reachable from the top.
              The Dashboard nav item below still covers "go home"
              from the collapsed state. */}
        <div
          className={`flex h-14 items-center border-b px-3 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {collapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="size-8"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          ) : (
            <>
              <Link
                href={isAdmin ? "/admin" : "/dashboard"}
                className="text-lg font-bold tracking-tight"
                title="ExamForge"
              >
                ExamForge
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="size-7"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </>
          )}
        </div>

        {/* Nav (scrollable if it overflows) */}
        <div className="flex-1 overflow-y-auto py-3">
          <NavList
            navItems={navItems}
            isAdmin={isAdmin}
            pathname={pathname}
            collapsed={collapsed}
          />
        </div>
      </aside>

      {/* ── Main column — offset by the sidebar width on desktop ── */}
      <div
        className={`flex min-h-screen flex-col transition-[padding] ${collapsed ? "md:pl-16" : "md:pl-60"}`}
      >
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-14 items-center px-4">
            {/* Mobile hamburger — opens drawer */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                <SheetHeader className="border-b px-4 py-3">
                  <SheetTitle className="text-left text-lg font-bold">ExamForge</SheetTitle>
                </SheetHeader>
                <div className="py-3">
                  <NavList
                    navItems={navItems}
                    isAdmin={isAdmin}
                    pathname={pathname}
                    collapsed={false}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>

            {/* Mobile brand — desktop has it in the sidebar */}
            <Link
              href={isAdmin ? "/admin" : "/dashboard"}
              className="ml-2 text-base font-bold tracking-tight md:hidden"
            >
              ExamForge
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <UserMenu />
            </div>
          </div>
        </header>
        {!isAdmin && <VerificationBanner />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
