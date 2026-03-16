"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Loader2, Mail } from "lucide-react";

const MAX_UNVERIFIED_LOGINS = 5;

export function VerificationBanner(): React.ReactElement | null {
  const { data: session } = useSession();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const requestOtpMutation = trpc.auth.requestVerificationOtp.useMutation({
    onSuccess: (data) => {
      setSending(false);
      const email = (data as { email?: string }).email ?? session?.user?.email ?? "";
      router.push(`/verify?email=${encodeURIComponent(email)}&purpose=verify_email` as "/");
    },
    onError: () => {
      setSending(false);
    },
  });

  // Don't show if dismissed, no session, or loading
  if (dismissed || !session?.user) return null;

  // Use session-level emailVerified for quick check
  const sessionVerified = (session.user as { emailVerified?: boolean }).emailVerified;
  if (sessionVerified !== false) return null;

  // Get detailed info from me query
  const user = meQuery.data;
  if (!user) return null;
  if (user.emailVerified) return null;

  const attemptsUsed = user.unverifiedLoginCount ?? 0;
  const attemptsRemaining = Math.max(0, MAX_UNVERIFIED_LOGINS - attemptsUsed);

  const handleVerifyNow = (): void => {
    setSending(true);
    requestOtpMutation.mutate();
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">
          Your email is not verified.{" "}
          {attemptsRemaining > 0 ? (
            <span className="font-medium">
              {attemptsRemaining} login{attemptsRemaining === 1 ? "" : "s"} remaining before your
              account is locked.
            </span>
          ) : (
            <span className="font-medium text-red-600 dark:text-red-400">
              Your account will be locked on next login.
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
          onClick={handleVerifyNow}
          disabled={sending}
        >
          {sending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <Mail className="mr-1 size-3.5" />
          )}
          Verify Now
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-amber-600 hover:bg-amber-200 dark:text-amber-400 dark:hover:bg-amber-800"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
