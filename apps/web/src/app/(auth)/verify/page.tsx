"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

type VerifyStep = "email" | "phone" | "done";

function OtpInput({
  onComplete,
  disabled,
}: {
  onComplete: (code: string) => void;
  disabled: boolean;
}): React.ReactElement {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, value: string): void {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === 5 && newOtp.every((d) => d)) {
      onComplete(newOtp.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent): void {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < text.length; i++) {
      newOtp[i] = text[i]!;
    }
    setOtp(newOtp);
    if (text.length === 6) {
      onComplete(text);
    }
  }

  // Reset OTP fields when step changes
  useEffect(() => {
    setOtp(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
  }, [disabled]);

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {otp.map((digit, i) => (
        <Input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          maxLength={1}
          className="h-12 w-12 text-center text-xl font-bold"
          autoFocus={i === 0}
          inputMode="numeric"
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function VerifyForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Dual-step params (signup)
  const emailParam = searchParams.get("email");
  const phoneParam = searchParams.get("phone");
  // Single-step params (legacy / forgot password)
  const identifierParam = searchParams.get("identifier");
  const typeParam = searchParams.get("type") ?? "email";
  const purpose = searchParams.get("purpose") ?? "signup";

  // Determine if this is a dual-step signup flow (verify_email is always single-step)
  const isDualStep = purpose === "signup" && !!emailParam && !!phoneParam;
  const totalSteps = isDualStep ? 2 : 1;

  const [currentStep, setCurrentStep] = useState<VerifyStep>(() => {
    if (isDualStep) return "email";
    if (identifierParam) return typeParam === "phone" ? "phone" : "email";
    if (emailParam) return "email";
    if (phoneParam) return "phone";
    return "email";
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const verifyMutation = trpc.auth.verifyOtp.useMutation();
  const resendMutation = trpc.auth.resendOtp.useMutation();

  // Check if user exists before showing OTP form
  const primaryIdentifier = emailParam ?? identifierParam ?? phoneParam ?? "";
  const userExistsQuery = trpc.auth.checkUserExists.useQuery(
    { identifier: primaryIdentifier },
    { enabled: !!primaryIdentifier },
  );

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return (): void => {
        clearTimeout(timer);
      };
    }
  }, [countdown]);

  // Get current identifier based on step
  const currentIdentifier =
    currentStep === "email"
      ? (emailParam ?? identifierParam ?? "")
      : (phoneParam ?? identifierParam ?? "");
  const currentType = currentStep;
  const stepNumber = currentStep === "email" ? 1 : isDualStep ? 2 : 1;

  const handleVerify = useCallback(
    async (code: string): Promise<void> => {
      setError("");
      setLoading(true);
      try {
        const result = await verifyMutation.mutateAsync({
          identifier: currentIdentifier,
          otp: code,
          purpose,
        });

        if (result.fullyVerified && result.authToken) {
          // Both verified (or single-step done) — auto sign in
          await signIn("credentials", {
            loginMethod: "otp",
            authToken: result.authToken,
            redirect: false,
          });

          if (purpose === "signup") {
            router.push("/onboarding");
          } else {
            router.push("/dashboard");
          }
          router.refresh();
          return;
        }

        if (!result.fullyVerified && result.nextIdentifier && result.nextType) {
          // First step done — move to next
          setCurrentStep(result.nextType as VerifyStep);
          setCountdown(60);
          setError("");
          return;
        }

        // Fully verified but no auth token (e.g. post-login verify or non-signup flow)
        if (result.fullyVerified) {
          if (purpose === "verify_email") {
            router.push("/dashboard");
          } else if (purpose === "signup") {
            router.push("/onboarding");
          } else {
            router.push(`/login?verified=true` as "/");
          }
          router.refresh();
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [currentIdentifier, purpose, verifyMutation, router],
  );

  async function handleResend(): Promise<void> {
    try {
      await resendMutation.mutateAsync({
        identifier: currentIdentifier,
        identifierType: currentType as "email" | "phone",
        purpose,
      });
      setCountdown(60);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Guard: if user doesn't exist, show error
  if (userExistsQuery.isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <span className="text-muted-foreground text-sm">Checking account...</span>
        </CardContent>
      </Card>
    );
  }

  if (userExistsQuery.data && !userExistsQuery.data.exists) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Account Not Found</CardTitle>
          <CardDescription>
            No account found for <strong>{primaryIdentifier}</strong>. It may have been deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Link href={"/signup" as "/"}>
            <Button className="w-full">Create an Account</Button>
          </Link>
          <Link href={"/login" as "/"} className="text-muted-foreground text-sm hover:underline">
            Back to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Verify Your {currentStep === "email" ? "Email" : "Phone"}
        </CardTitle>
        <CardDescription>
          {isDualStep && (
            <span className="text-primary mb-1 block text-sm font-medium">
              Step {stepNumber} of {totalSteps}
            </span>
          )}
          Enter the 6-digit code sent to <strong>{currentIdentifier}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error && (
          <div className="bg-destructive/10 text-destructive w-full rounded-md px-3 py-2 text-center text-sm">
            {error}
          </div>
        )}

        <OtpInput onComplete={handleVerify} disabled={loading} />

        <Button onClick={() => handleVerify("")} disabled={loading} className="w-full">
          {loading ? "Verifying..." : "Verify"}
        </Button>

        <div className="text-muted-foreground text-sm">
          {countdown > 0 ? (
            <span>Resend code in {countdown}s</span>
          ) : (
            <button
              onClick={handleResend}
              className="text-primary hover:underline"
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? "Sending..." : "Resend Code"}
            </button>
          )}
        </div>

        {isDualStep && currentStep === "email" && (
          <p className="text-muted-foreground text-center text-xs">
            After email verification, you&apos;ll verify your phone number.
          </p>
        )}

        {(purpose === "signup" || purpose === "verify_email") && (
          <button
            onClick={async () => {
              // Try to sign in with password if we came from signup (user just created account)
              // Otherwise just redirect — the user should already be signed in
              if (purpose === "verify_email") {
                router.push("/dashboard" as "/");
                router.refresh();
              } else {
                // For signup, redirect to login so user can sign in
                router.push("/login" as "/");
              }
            }}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Skip for now
          </button>
        )}

        {purpose === "verify_email" ? (
          <Link
            href={"/dashboard" as "/"}
            className="text-muted-foreground text-xs hover:underline"
          >
            Back to dashboard
          </Link>
        ) : (
          <Link href={"/signup" as "/"} className="text-muted-foreground text-xs hover:underline">
            Change email/phone
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <VerifyForm />
    </Suspense>
  );
}
