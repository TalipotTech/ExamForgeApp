"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

type LoginMethod = "password" | "otp" | "pin";
type OtpStep = "request" | "verify";
type ErrorCode =
  | "USER_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "INVALID_PIN"
  | "PIN_NOT_SET"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_LOCKED_UNVERIFIED"
  | "ACCOUNT_LOCKED"
  | "LOGIN_FAILED"
  | null;

function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [method, setMethod] = useState<LoginMethod>("password");
  const [errorCode, setErrorCode] = useState<ErrorCode>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Password login state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP login state
  const [otpIdentifier, setOtpIdentifier] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("request");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // PIN login state
  const [pinIdentifier, setPinIdentifier] = useState("");
  const [pin, setPin] = useState("");

  const { data: flags } = trpc.auth.getAuthFlags.useQuery();
  const requestOtpMutation = trpc.auth.loginWithOtpRequest.useMutation();
  const verifyOtpMutation = trpc.auth.loginWithOtpVerify.useMutation();
  const preValidateMutation = trpc.auth.preValidateLogin.useMutation();

  function getIdentifierIcon(value: string): string {
    if (value.includes("@")) return "\u2709";
    if (value.startsWith("+") || /^\d{5,}$/.test(value)) return "\ud83d\udcf1";
    return "\ud83d\udc64";
  }

  // Clear errors when switching methods
  useEffect(() => {
    setErrorCode(null);
    setErrorEmail(null);
  }, [method]);

  // ─── Password Login ─────────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setErrorEmail(null);
    setLoading(true);

    try {
      // Step 1: Pre-validate to get specific error codes
      const validation = await preValidateMutation.mutateAsync({
        identifier,
        password,
        loginMethod: "password",
      });

      if (!validation.valid) {
        setErrorCode(validation.code as ErrorCode);
        setErrorEmail("email" in validation ? (validation.email ?? null) : null);
        setLoading(false);
        return;
      }

      // Step 2: Validation passed — sign in via NextAuth
      const result = await signIn("credentials", {
        identifier,
        password,
        loginMethod: "password",
        redirect: false,
      });

      if (result?.error) {
        setErrorCode("LOGIN_FAILED");
        setLoading(false);
        return;
      }

      router.push(callbackUrl as "/");
      router.refresh();
    } catch {
      setErrorCode("LOGIN_FAILED");
      setLoading(false);
    }
  }

  // ─── OTP Login ──────────────────────────────────────────────────
  async function handleOtpRequest(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setLoading(true);

    try {
      await requestOtpMutation.mutateAsync({ identifier: otpIdentifier });
      setOtpStep("verify");
    } catch {
      setErrorCode("LOGIN_FAILED");
      setErrorEmail(null);
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string): void {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otpCode];
    newOtp[index] = value.slice(-1);
    setOtpCode(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (value && index === 5 && newOtp.every((d) => d)) {
      handleOtpVerify(newOtp.join(""));
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent): void {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otpCode];
    for (let i = 0; i < text.length; i++) {
      newOtp[i] = text[i]!;
    }
    setOtpCode(newOtp);
    if (text.length === 6) {
      handleOtpVerify(text);
    }
  }

  async function handleOtpVerify(code?: string): Promise<void> {
    const otpValue = code ?? otpCode.join("");
    if (otpValue.length !== 6) return;

    setErrorCode(null);
    setLoading(true);

    try {
      const result = await verifyOtpMutation.mutateAsync({
        identifier: otpIdentifier,
        otp: otpValue,
      });

      // Use auth token to sign in via NextAuth
      const signInResult = await signIn("credentials", {
        loginMethod: "otp",
        authToken: result.authToken,
        redirect: false,
      });

      if (signInResult?.error) {
        setErrorCode("LOGIN_FAILED");
        return;
      }

      router.push(callbackUrl as "/");
      router.refresh();
    } catch {
      setErrorCode("LOGIN_FAILED");
      setOtpCode(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ─── PIN Login ──────────────────────────────────────────────────
  async function handlePinLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrorCode(null);
    setErrorEmail(null);
    setLoading(true);

    try {
      // Step 1: Pre-validate
      const validation = await preValidateMutation.mutateAsync({
        identifier: pinIdentifier,
        pin,
        loginMethod: "pin",
      });

      if (!validation.valid) {
        setErrorCode(validation.code as ErrorCode);
        setErrorEmail("email" in validation ? (validation.email ?? null) : null);
        setLoading(false);
        return;
      }

      // Step 2: Sign in via NextAuth
      const result = await signIn("credentials", {
        identifier: pinIdentifier,
        pin,
        loginMethod: "pin",
        redirect: false,
      });

      if (result?.error) {
        setErrorCode("LOGIN_FAILED");
        setLoading(false);
        return;
      }

      router.push(callbackUrl as "/");
      router.refresh();
    } catch {
      setErrorCode("LOGIN_FAILED");
      setLoading(false);
    }
  }

  async function handleGoogleLogin(): Promise<void> {
    await signIn("google", { callbackUrl });
  }

  // Dev-only: one-click sign-in for seeded demo users.
  async function handleDemoLogin(
    demoIdentifier: string,
    demoPassword: string,
    demoCallback: string,
  ): Promise<void> {
    setErrorCode(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        identifier: demoIdentifier,
        password: demoPassword,
        loginMethod: "password",
        redirect: false,
      });
      if (result?.error) {
        setErrorCode("LOGIN_FAILED");
        setLoading(false);
        return;
      }
      router.push(demoCallback as "/");
      router.refresh();
    } catch {
      setErrorCode("LOGIN_FAILED");
      setLoading(false);
    }
  }

  // Build available tabs
  const tabs: { value: LoginMethod; label: string }[] = [{ value: "password", label: "Password" }];
  if (flags?.otpLoginEnabled) tabs.push({ value: "otp", label: "OTP" });
  if (flags?.pinLoginEnabled) tabs.push({ value: "pin", label: "PIN" });

  // ─── Error display component ──────────────────────────────────
  function renderError(): React.ReactNode {
    if (!errorCode) return null;

    return (
      <div className="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
        {errorCode === "USER_NOT_FOUND" ? (
          <div className="flex flex-col gap-1">
            <span>No account found with these credentials.</span>
            <Link
              href={"/signup" as "/"}
              className="text-primary text-xs font-medium hover:underline"
            >
              Create an account
            </Link>
          </div>
        ) : errorCode === "INVALID_PASSWORD" ? (
          <div className="flex flex-col gap-1">
            <span>Incorrect password.</span>
            <Link
              href={"/forgot-password" as "/"}
              className="text-primary text-xs font-medium hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        ) : errorCode === "INVALID_PIN" ? (
          <span>Incorrect PIN. Please try again.</span>
        ) : errorCode === "PIN_NOT_SET" ? (
          <span>No PIN set for this account. Use password login instead.</span>
        ) : errorCode === "ACCOUNT_BANNED" ? (
          <span>Your account has been suspended. Contact support.</span>
        ) : errorCode === "ACCOUNT_LOCKED_UNVERIFIED" ? (
          <div className="flex flex-col gap-1">
            <span>Account locked — please verify your email to continue.</span>
            {errorEmail && (
              <Link
                href={`/verify?email=${encodeURIComponent(errorEmail)}&purpose=verify_email` as "/"}
                className="text-primary text-xs font-medium hover:underline"
              >
                Verify your email now
              </Link>
            )}
          </div>
        ) : errorCode === "ACCOUNT_LOCKED" ? (
          <span>Your account has been deactivated. Contact support.</span>
        ) : (
          <span>Login failed. Please check your credentials and try again.</span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">ExamForge</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        {renderError()}

        {tabs.length > 1 ? (
          <Tabs
            value={method}
            onValueChange={(v) => {
              setMethod(v as LoginMethod);
              setOtpStep("request");
              setOtpCode(["", "", "", "", "", ""]);
            }}
          >
            <TabsList className={`grid w-full grid-cols-${tabs.length}`}>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Password Tab */}
            <TabsContent value="password" className="mt-4">
              <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="identifier">Email, phone, or username</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                      {getIdentifierIcon(identifier)}
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
              </form>
            </TabsContent>

            {/* OTP Tab */}
            <TabsContent value="otp" className="mt-4">
              {otpStep === "request" ? (
                <form onSubmit={handleOtpRequest} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="otp-identifier">Email or phone number</Label>
                    <Input
                      id="otp-identifier"
                      value={otpIdentifier}
                      onChange={(e) => setOtpIdentifier(e.target.value)}
                      required
                      placeholder="Enter your email or phone"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Sending OTP..." : "Send OTP"}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-muted-foreground text-sm">
                    Enter the 6-digit code sent to <strong>{otpIdentifier}</strong>
                  </p>
                  <div className="flex gap-2" onPaste={handleOtpPaste}>
                    {otpCode.map((digit, i) => (
                      <Input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        maxLength={1}
                        className="h-12 w-12 text-center text-xl font-bold"
                        autoFocus={i === 0}
                        inputMode="numeric"
                        disabled={loading}
                      />
                    ))}
                  </div>
                  <Button
                    onClick={() => handleOtpVerify()}
                    disabled={loading || otpCode.join("").length !== 6}
                    className="w-full"
                  >
                    {loading ? "Verifying..." : "Verify & Sign in"}
                  </Button>
                  <button
                    onClick={() => {
                      setOtpStep("request");
                      setOtpCode(["", "", "", "", "", ""]);
                    }}
                    className="text-muted-foreground text-xs hover:underline"
                  >
                    Change email/phone
                  </button>
                </div>
              )}
            </TabsContent>

            {/* PIN Tab */}
            <TabsContent value="pin" className="mt-4">
              <form onSubmit={handlePinLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pin-identifier">Email, phone, or username</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                      {getIdentifierIcon(pinIdentifier)}
                    </span>
                    <Input
                      id="pin-identifier"
                      value={pinIdentifier}
                      onChange={(e) => setPinIdentifier(e.target.value)}
                      required
                      className="pl-9"
                      placeholder="Enter your email, phone, or username"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pin">4-digit PIN</Label>
                  <Input
                    id="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    required
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="Enter your 4-digit PIN"
                  />
                </div>
                <Button type="submit" disabled={loading || pin.length !== 4} className="w-full">
                  {loading ? "Signing in..." : "Sign in with PIN"}
                </Button>
                <p className="text-muted-foreground text-center text-xs">
                  Set up your PIN in{" "}
                  <Link
                    href={"/dashboard/settings" as "/"}
                    className="text-primary hover:underline"
                  >
                    Settings
                  </Link>
                </p>
              </form>
            </TabsContent>
          </Tabs>
        ) : (
          // Fallback: only password login (no tabs)
          <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">Email, phone, or username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                  {getIdentifierIcon(identifier)}
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
          </form>
        )}

        {flags?.googleOAuthEnabled && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">or</span>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={handleGoogleLogin} className="w-full">
              Continue with Google
            </Button>
          </>
        )}

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 space-y-2">
            <div className="text-muted-foreground text-center text-[10px] uppercase tracking-wider">
              Dev demo accounts
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => handleDemoLogin("admin@examforge.dev", "password123", "/admin")}
              >
                Admin
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => handleDemoLogin("student@examforge.dev", "student123", "/dashboard")}
              >
                Student
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() =>
                  handleDemoLogin("creator@examforge.dev", "creator123", "/dashboard/creator")
                }
              >
                Creator
              </Button>
            </div>
          </div>
        )}

        <p className="text-muted-foreground mt-4 text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href={"/signup" as "/"} className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
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
