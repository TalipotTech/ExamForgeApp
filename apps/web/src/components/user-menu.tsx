"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export function UserMenu(): React.ReactElement | null {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <User className="text-muted-foreground size-4" />
        <span className="text-foreground/80 hidden sm:inline">{session.user.name}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => signOut({ callbackUrl: "/" })}
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
