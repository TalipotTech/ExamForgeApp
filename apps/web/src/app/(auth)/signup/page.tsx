"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

export default function SignupPage(): React.ReactElement {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"email" | "phone" | "username_email">("email");

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
        method,
        name,
        email: method !== "phone" ? email : undefined,
        phone: method === "phone" ? phone : undefined,
        username: method === "username_email" ? username : undefined,
        password,
      });

      if (result.requiresVerification) {
        router.push(
          `/verify?identifier=${encodeURIComponent(result.identifier)}&type=${result.verificationType}&purpose=signup` as "/",
        );
      } else {
        // Auto sign in
        await signIn("credentials", {
          identifier: email || phone || username,
          password,
          redirect: false,
        });
        router.push("/admin");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup(): Promise<void> {
    await signIn("google", { callbackUrl: "/admin" });
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

          <Tabs value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="email">Email</TabsTrigger>
              {flags?.phonePasswordEnabled && <TabsTrigger value="phone">Phone</TabsTrigger>}
              <TabsTrigger value="username_email">Username</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name-email">Full Name</Label>
                <Input
                  id="name-email"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
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
                />
              </div>
            </TabsContent>

            <TabsContent value="phone" className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name-phone">Full Name</Label>
                <Input
                  id="name-phone"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone (with country code)</Label>
                <Input
                  id="phone"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </TabsContent>

            <TabsContent value="username_email" className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name-username">Full Name</Label>
                <Input
                  id="name-username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="john_doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-username">Email</Label>
                <Input
                  id="email-username"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
