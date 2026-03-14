"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: flags } = trpc.auth.getAuthFlags.useQuery();

  function getIdentifierIcon(): string {
    if (identifier.includes("@")) return "\u2709"; // envelope
    if (identifier.startsWith("+") || /^\d{5,}$/.test(identifier)) return "\ud83d\udcf1"; // phone
    return "\ud83d\udc64"; // person
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid credentials");
      return;
    }

    router.push(callbackUrl as "/");
    router.refresh();
  }

  async function handleGoogleLogin(): Promise<void> {
    await signIn("google", { callbackUrl });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">ExamForge</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identifier">Email, phone, or username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                {getIdentifierIcon()}
              </span>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
                className="pl-9"
                placeholder="Enter your email, phone, or username"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href={"/forgot-password" as "/"}
                className="text-primary text-xs hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>

          {flags?.googleOAuthEnabled && (
            <>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="border-border w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card text-muted-foreground px-2">or</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                className="w-full"
              >
                Continue with Google
              </Button>
            </>
          )}

          <p className="text-muted-foreground text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href={"/signup" as "/"} className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage(): React.ReactElement {
  return (
    <Suspense fallback={<div />}>
      <LoginForm />
    </Suspense>
  );
}
