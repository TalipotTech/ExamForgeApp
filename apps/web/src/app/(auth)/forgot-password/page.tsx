"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

type Step = "identifier" | "otp" | "done";
type IdentifierType = "email" | "phone";

export default function ForgotPasswordPage(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identifier");
  const [identifierType, setIdentifierType] = useState<IdentifierType>("email");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const forgotMutation = trpc.auth.forgotPassword.useMutation();
  const resetMutation = trpc.auth.resetPassword.useMutation();

  async function handleSendOtp(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotMutation.mutateAsync({ identifier, identifierType });
      setStep("otp");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetMutation.mutateAsync({
        identifier,
        identifierType,
        otp,
        newPassword,
      });
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Password Reset</CardTitle>
          <CardDescription>Your password has been reset successfully.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push("/login" as "/")} className="w-full">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
        <CardDescription>
          {step === "identifier"
            ? "Choose how to receive your reset code"
            : "Enter the code and your new password"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {step === "identifier" && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            {/* Method toggle */}
            <div className="flex flex-col gap-1.5">
              <Label>Reset via</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={identifierType === "email" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIdentifierType("email");
                    setIdentifier("");
                  }}
                >
                  Email
                </Button>
                <Button
                  type="button"
                  variant={identifierType === "phone" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIdentifierType("phone");
                    setIdentifier("");
                  }}
                >
                  Phone
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">
                {identifierType === "email" ? "Email" : "Phone (with country code)"}
              </Label>
              <Input
                id="identifier"
                type={identifierType === "email" ? "email" : "tel"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
                placeholder={identifierType === "email" ? "john@example.com" : "+919876543210"}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Code sent to <strong>{identifier}</strong>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp">6-digit Code</Label>
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                required
                autoFocus
                inputMode="numeric"
                placeholder="Enter 6-digit code"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-muted-foreground text-xs">
                Min 8 chars, 1 uppercase, 1 lowercase, 1 number
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        )}

        <p className="text-muted-foreground mt-4 text-center text-sm">
          <Link href={"/login" as "/"} className="text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
