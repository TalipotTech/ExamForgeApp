"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function SignupPage(): React.ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Form state — all fields required
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const registerMutation = trpc.auth.register.useMutation();
  const { data: flags } = trpc.auth.getAuthFlags.useQuery();

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await registerMutation.mutateAsync({
        name,
        email,
        phone,
        username,
        password,
      });

      // Auto sign-in immediately (user just provided valid credentials)
      await signIn("credentials", {
        identifier: email,
        password,
        loginMethod: "password",
        redirect: false,
      });

      if (result.requiresVerification) {
        // Redirect to verify page (user is already signed in, can skip)
        const params = new URLSearchParams({ purpose: "signup" });
        if (result.emailOtpRequired) params.set("email", result.email);
        if (result.smsOtpRequired) params.set("phone", result.phone);
        if (result.emailOtpRequired && !result.smsOtpRequired) {
          params.set("identifier", result.email);
          params.set("type", "email");
        } else if (result.smsOtpRequired && !result.emailOtpRequired) {
          params.set("identifier", result.phone);
          params.set("type", "phone");
        }
        router.push(`/verify?${params.toString()}` as "/");
      } else {
        // No verification required — go straight to onboarding
        router.push("/onboarding");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup(): Promise<void> {
    await signIn("google", { callbackUrl: "/onboarding" });
  }

  if (flags && !flags.signupEnabled) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">ExamForge</CardTitle>
          <CardDescription>Registration is currently closed.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">ExamForge</CardTitle>
        <CardDescription>Create your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="John Doe"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="john@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone (with country code)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+919876543210"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="john_doe"
            />
            <p className="text-muted-foreground text-xs">
              3-30 characters, letters, numbers, and underscores only
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
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
            {loading ? "Creating account..." : "Sign up"}
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
                onClick={handleGoogleSignup}
                className="w-full"
              >
                Continue with Google
              </Button>
            </>
          )}

          <p className="text-muted-foreground text-center text-sm">
            Already have an account?{" "}
            <Link href={"/login" as "/"} className="text-primary hover:underline">
              Login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
