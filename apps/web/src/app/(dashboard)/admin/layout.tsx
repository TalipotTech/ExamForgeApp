"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings, LayoutDashboard, BookMarked } from "lucide-react";

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/tutorials", label: "Tutorials", icon: BookMarked },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      {/* Sidebar — horizontal on mobile, vertical on desktop */}
      <aside className="w-full shrink-0 md:w-52">
        <nav className="flex gap-1 overflow-x-auto md:sticky md:top-20 md:flex-col md:overflow-x-visible">
          <h2 className="text-muted-foreground mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider md:block">
            Admin
          </h2>
          {adminNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href as "/"}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
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
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
