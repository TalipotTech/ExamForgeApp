/**
 * /admin/* layout.
 *
 * Historically this layout rendered its own inner sidebar listing
 * Overview / Users / Tutorials / Settings. Since the global
 * dashboard sidebar (see ../layout.tsx) now exposes all of those
 * destinations directly, the inner sidebar was duplicative and has
 * been removed. This layout is kept as a thin pass-through so
 * nested routes under /admin still resolve predictably and any
 * future admin-only chrome has an obvious home.
 */

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <div className="min-w-0 flex-1">{children}</div>;
}
