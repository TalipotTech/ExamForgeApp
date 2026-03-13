"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserMenu } from "@/components/user-menu";
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
} from "lucide-react";

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
  { href: "/dashboard/find", label: "Find Content", icon: Search, adminOnly: true },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark, adminOnly: true },
];

const STUDENT_NAV: NavItem[] = [{ href: "/exams/start", label: "Start Exam", icon: Play }];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = ADMIN_ROLES.includes(session?.user?.role ?? "");

  const navItems = isAdmin ? ADMIN_NAV : STUDENT_NAV;

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <nav className="ml-8 flex items-center gap-5 text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/exams/start"
                  ? pathname === "/exams/start"
                  : pathname.startsWith(item.href);
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
          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
