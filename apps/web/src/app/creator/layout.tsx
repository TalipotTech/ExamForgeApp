"use client";

/**
 * Creator-area layout — replaces the student sidebar with a creator-focused
 * nav while the operator is inside /creator/*. Reuses the top bar + mobile
 * drawer pattern from the dashboard layout.
 *
 * Items that don't have pages yet (content, classrooms, live, doubts,
 * analytics, promotions) are intentionally omitted here and will be added
 * as their respective phases land.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  LayoutGrid,
  Wallet,
  Store,
  ArrowLeft,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  Inbox,
  FileStack,
  Plug,
  Radio,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";

const CREATOR_SIDEBAR_COLLAPSED_KEY = "examforge.creator.sidebar.collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CREATOR_NAV: NavItem[] = [
  { href: "/creator", label: "Dashboard", icon: LayoutDashboard },
  { href: "/creator/content", label: "Content", icon: FileStack },
  { href: "/creator/listings", label: "Listings", icon: LayoutGrid },
  { href: "/creator/classrooms", label: "Classrooms", icon: GraduationCap },
  { href: "/creator/live-sessions", label: "Live Sessions", icon: Radio },
  { href: "/creator/doubts", label: "Doubt Inbox", icon: Inbox },
  { href: "/creator/integrations", label: "Integrations", icon: Plug },
  { href: "/creator/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/creator/wallet", label: "Wallet", icon: Wallet },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/creator") return pathname === "/creator";
  return pathname.startsWith(href);
}

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}): React.ReactElement {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {CREATOR_NAV.map((item) => {
        const Icon = item.icon;
        const active = isLinkActive(pathname, item.href);
        return (
          <Link
            key={item.href}
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
        );
      })}
      <div className="my-2 border-t" />
      <Link
        href={"/marketplace" as "/"}
        onClick={onNavigate}
        title={collapsed ? "Public marketplace" : undefined}
        className={`text-muted-foreground hover:bg-accent/50 hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          collapsed ? "justify-center px-2" : ""
        }`}
      >
        <Store className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">Public marketplace</span>}
      </Link>
      <Link
        href={"/dashboard" as "/"}
        onClick={onNavigate}
        title={collapsed ? "Switch to student view" : undefined}
        className={`text-muted-foreground hover:bg-accent/50 hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          collapsed ? "justify-center px-2" : ""
        }`}
      >
        <ArrowLeft className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">Switch to student view</span>}
      </Link>
    </nav>
  );
}

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(CREATOR_SIDEBAR_COLLAPSED_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CREATOR_SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const displayName = mounted ? (session?.user?.name ?? "Creator") : "Creator";

  return (
    <div className="bg-background min-h-screen">
      <aside
        className={`bg-background fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
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
              <Link href={"/creator" as "/"} className="text-lg font-bold tracking-tight">
                Creator
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

        <div className="flex-1 overflow-y-auto py-3">
          <NavList pathname={pathname} collapsed={collapsed} />
        </div>

        {!collapsed && (
          <div className="text-muted-foreground border-t px-3 py-2 text-xs">
            Signed in as <span className="text-foreground font-medium">{displayName}</span>
          </div>
        )}
      </aside>

      <div
        className={`flex min-h-screen flex-col transition-[padding] ${collapsed ? "md:pl-16" : "md:pl-60"}`}
      >
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-14 items-center px-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                <SheetHeader className="border-b px-4 py-3">
                  <SheetTitle className="text-left text-lg font-bold">Creator</SheetTitle>
                </SheetHeader>
                <div className="py-3">
                  <NavList
                    pathname={pathname}
                    collapsed={false}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Link
              href={"/creator" as "/"}
              className="ml-2 text-base font-bold tracking-tight md:hidden"
            >
              Creator
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
