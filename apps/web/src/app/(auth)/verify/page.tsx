"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function VerifyForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const identifier = searchParams.get("identifier") ?? "";
  const type = searchParams.get("type") ?? "email";
  const purpose = searchParams.get("purpose") ?? "signup";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const verifyMutation = trpc.auth.verifyOtp.useMutation();
  const resendMutation = trpc.auth.resendOtp.useMutation();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  function handleChange(index: number, value: string): void {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && newOtp.every((d) => d)) {
      handleVerify(newOtp.join(""));
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
      handleVerify(text);
    }
  }

  async function handleVerify(code?: string): Promise<void> {
    const otpCode = code ?? otp.join("");
    if (otpCode.length !== 6) return;

    setError("");
    setLoading(true);
    try {
      await verifyMutation.mutateAsync({
        identifier,
        otp: otpCode,
        purpose,
      });

      // Verification successful — redirect
      if (purpose === "signup") {
        router.push("/questions");
      } else {
        router.push("/login?verified=true" as "/");
      }
    } catch (err) {
      setError((err as Error).message);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(): Promise<void> {
    try {
      await resendMutation.mutateAsync({
        identifier,
        identifierType: type as "email" | "phone",
        purpose,
      });
      setCountdown(60);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          Verify Your {type === "email" ? "Email" : "Phone"}
        </CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to <strong>{identifier}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error && (
          <div className="bg-destructive/10 text-destructive w-full rounded-md px-3 py-2 text-center text-sm">
            {error}
          </div>
        )}

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
            />
          ))}
        </div>

        <Button
          onClick={() => handleVerify()}
          disabled={loading || otp.join("").length !== 6}
          className="w-full"
        >
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

        <Link href={"/signup" as "/"} className="text-muted-foreground text-xs hover:underline">
          Change email/phone
        </Link>
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
