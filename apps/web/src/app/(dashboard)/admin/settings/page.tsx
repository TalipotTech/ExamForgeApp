"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { trpc } from "@/lib/trpc";

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function AdminSettingsPage(): React.ReactElement {
  const { data: flagGroups, isLoading } = trpc.adminSettings.getFlags.useQuery();
  const updateMutation = trpc.adminSettings.updateFlags.useMutation();
  const testSmsMutation = trpc.adminSettings.testSms.useMutation();
  const testPaymentMutation = trpc.adminSettings.testPayment.useMutation();

  const [changes, setChanges] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  function getValue(key: string): unknown {
    if (key in changes) return changes[key];
    if (!flagGroups) return null;
    for (const group of Object.values(flagGroups)) {
      const flag = group.find((f) => f.key === key);
      if (flag) return flag.value;
    }
    return null;
  }

  function setValue(key: string, value: unknown): void {
    setChanges((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave(): Promise<void> {
    const flags = Object.entries(changes).map(([key, value]) => ({ key, value }));
    if (flags.length === 0) return;
    await updateMutation.mutateAsync({ flags });
    setChanges({});
    setSaved(true);
  }

  if (isLoading) {
    return <div className="p-8 text-center">Loading settings...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        <Button
          onClick={handleSave}
          disabled={Object.keys(changes).length === 0 || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving..." : saved ? "Saved!" : "Save All Settings"}
        </Button>
      </div>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <ToggleSwitch
            checked={getValue("auth.signup_enabled") as boolean}
            onChange={(v) => setValue("auth.signup_enabled", v)}
            label="Allow new registrations"
          />
          <ToggleSwitch
            checked={getValue("auth.google_oauth_enabled") as boolean}
            onChange={(v) => setValue("auth.google_oauth_enabled", v)}
            label="Google OAuth"
          />
          <ToggleSwitch
            checked={getValue("auth.email_password_enabled") as boolean}
            onChange={(v) => setValue("auth.email_password_enabled", v)}
            label="Email + Password"
          />
          <ToggleSwitch
            checked={getValue("auth.phone_password_enabled") as boolean}
            onChange={(v) => setValue("auth.phone_password_enabled", v)}
            label="Phone + Password"
          />
          <ToggleSwitch
            checked={getValue("auth.username_login_enabled") as boolean}
            onChange={(v) => setValue("auth.username_login_enabled", v)}
            label="Username login"
          />
          <ToggleSwitch
            checked={getValue("auth.email_otp_verification") as boolean}
            onChange={(v) => setValue("auth.email_otp_verification", v)}
            label="Require email verification"
          />
          <ToggleSwitch
            checked={getValue("auth.sms_otp_verification") as boolean}
            onChange={(v) => setValue("auth.sms_otp_verification", v)}
            label="Require SMS verification"
          />
          <ToggleSwitch
            checked={getValue("auth.require_verification") as boolean}
            onChange={(v) => setValue("auth.require_verification", v)}
            label="Require verification before full access"
          />
        </CardContent>
      </Card>

      {/* SMS Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SMS Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Provider</Label>
            <select
              value={(getValue("sms.provider") as string) ?? "none"}
              onChange={(e) => setValue("sms.provider", e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="none">None</option>
              <option value="msg91">MSG91</option>
              <option value="twilio">Twilio</option>
            </select>
          </div>

          {getValue("sms.provider") === "msg91" && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <Label>Auth Key</Label>
                <Input
                  type="password"
                  value={(getValue("sms.msg91_auth_key") as string) ?? ""}
                  onChange={(e) => setValue("sms.msg91_auth_key", e.target.value)}
                />
              </div>
              <div>
                <Label>Sender ID</Label>
                <Input
                  value={(getValue("sms.msg91_sender_id") as string) ?? ""}
                  onChange={(e) => setValue("sms.msg91_sender_id", e.target.value)}
                  maxLength={6}
                />
              </div>
              <div>
                <Label>Template ID</Label>
                <Input
                  type="password"
                  value={(getValue("sms.msg91_template_id") as string) ?? ""}
                  onChange={(e) => setValue("sms.msg91_template_id", e.target.value)}
                />
              </div>
            </div>
          )}

          {getValue("sms.provider") === "twilio" && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <Label>Account SID</Label>
                <Input
                  type="password"
                  value={(getValue("sms.twilio_account_sid") as string) ?? ""}
                  onChange={(e) => setValue("sms.twilio_account_sid", e.target.value)}
                />
              </div>
              <div>
                <Label>Auth Token</Label>
                <Input
                  type="password"
                  value={(getValue("sms.twilio_auth_token") as string) ?? ""}
                  onChange={(e) => setValue("sms.twilio_auth_token", e.target.value)}
                />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input
                  value={(getValue("sms.twilio_phone_number") as string) ?? ""}
                  onChange={(e) => setValue("sms.twilio_phone_number", e.target.value)}
                />
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => testSmsMutation.mutate({ phone: "+919999999999" })}
            disabled={testSmsMutation.isPending}
          >
            {testSmsMutation.isPending ? "Sending..." : "Test SMS"}
          </Button>
          {testSmsMutation.data && (
            <p className="text-muted-foreground text-xs">{testSmsMutation.data.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleSwitch
            checked={getValue("payment.enabled") as boolean}
            onChange={(v) => setValue("payment.enabled", v)}
            label="Enable payment processing"
          />
          <ToggleSwitch
            checked={getValue("payment.test_mode") as boolean}
            onChange={(v) => setValue("payment.test_mode", v)}
            label="Test/Sandbox mode"
          />
          <div className="space-y-2 rounded-md border p-3">
            <div>
              <Label>Razorpay Key ID</Label>
              <Input
                type="password"
                value={(getValue("payment.razorpay_key_id") as string) ?? ""}
                onChange={(e) => setValue("payment.razorpay_key_id", e.target.value)}
              />
            </div>
            <div>
              <Label>Razorpay Key Secret</Label>
              <Input
                type="password"
                value={(getValue("payment.razorpay_key_secret") as string) ?? ""}
                onChange={(e) => setValue("payment.razorpay_key_secret", e.target.value)}
              />
            </div>
            <div>
              <Label>Webhook Secret</Label>
              <Input
                type="password"
                value={(getValue("payment.razorpay_webhook_secret") as string) ?? ""}
                onChange={(e) => setValue("payment.razorpay_webhook_secret", e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => testPaymentMutation.mutate()}
            disabled={testPaymentMutation.isPending}
          >
            {testPaymentMutation.isPending ? "Testing..." : "Test Connection"}
          </Button>
          {testPaymentMutation.data && (
            <p
              className={`text-xs ${testPaymentMutation.data.success ? "text-green-600" : "text-destructive"}`}
            >
              {testPaymentMutation.data.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Free credits on signup</Label>
            <Input
              type="number"
              value={(getValue("feature.free_credits_on_signup") as number) ?? 50}
              onChange={(e) =>
                setValue("feature.free_credits_on_signup", parseInt(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label>Referral bonus credits</Label>
            <Input
              type="number"
              value={(getValue("feature.referral_bonus_credits") as number) ?? 10}
              onChange={(e) =>
                setValue("feature.referral_bonus_credits", parseInt(e.target.value) || 0)
              }
            />
          </div>
          <ToggleSwitch
            checked={getValue("feature.maintenance_mode") as boolean}
            onChange={(v) => setValue("feature.maintenance_mode", v)}
            label="Maintenance mode"
            description="Show maintenance page to non-admins"
          />
        </CardContent>
      </Card>

      {/* Voice / TTS */}
      <Card>
        <CardHeader>
          <CardTitle>Voice / TTS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSwitch
            checked={getValue("voice.premium_tts_enabled") as boolean}
            onChange={(v) => setValue("voice.premium_tts_enabled", v)}
            label="Premium TTS enabled"
            description="Enable Azure Speech cloud voices for Voice Tutor"
          />
          <div>
            <Label>Azure Speech API key</Label>
            <Input
              type="password"
              value={(getValue("voice.azure_speech_key") as string) ?? ""}
              onChange={(e) => setValue("voice.azure_speech_key", e.target.value)}
              placeholder="Enter Azure Speech subscription key"
            />
          </div>
          <div>
            <Label>Azure Speech region</Label>
            <Input
              value={(getValue("voice.azure_speech_region") as string) ?? "centralindia"}
              onChange={(e) => setValue("voice.azure_speech_region", e.target.value)}
              placeholder="centralindia"
            />
          </div>
          <div>
            <Label>Per-user monthly char limit</Label>
            <Input
              type="number"
              value={(getValue("voice.per_user_char_limit") as number) ?? 10000}
              onChange={(e) =>
                setValue("voice.per_user_char_limit", parseInt(e.target.value) || 10000)
              }
            />
          </div>
          <div>
            <Label>Platform monthly char limit</Label>
            <Input
              type="number"
              value={(getValue("voice.monthly_char_limit") as number) ?? 500000}
              onChange={(e) =>
                setValue("voice.monthly_char_limit", parseInt(e.target.value) || 500000)
              }
            />
          </div>
          <VoicePlatformUsage />
          <VoiceTestButton />
        </CardContent>
      </Card>

      {/* Creators — every flag in the `creators` category, auto-rendered. */}
      <CreatorsCard flagGroups={flagGroups} getValue={getValue} setValue={setValue} />
    </div>
  );
}

type FlagRow = {
  key: string;
  value?: unknown;
  description: string | null;
};

function CreatorsCard({
  flagGroups,
  getValue,
  setValue,
}: {
  flagGroups: Record<string, FlagRow[]> | undefined;
  getValue: (key: string) => unknown;
  setValue: (key: string, value: unknown) => void;
}): React.ReactElement | null {
  const creatorsFlags = flagGroups?.["creators"] ?? [];
  if (creatorsFlags.length === 0) return null;

  // Show boolean flags as toggles, numeric/string flags as text inputs.
  const booleanFlags = creatorsFlags.filter((f) => typeof f.value === "boolean");
  const otherFlags = creatorsFlags.filter((f) => typeof f.value !== "boolean");

  function humanLabel(key: string): string {
    return key
      .replace(/^creators\./, "")
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Creators</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {booleanFlags.map((flag) => (
          <ToggleSwitch
            key={flag.key}
            checked={Boolean(getValue(flag.key))}
            onChange={(v) => setValue(flag.key, v)}
            label={humanLabel(flag.key)}
            description={flag.description ?? undefined}
          />
        ))}
        {otherFlags.length > 0 && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {otherFlags.map((flag) => (
              <div key={flag.key}>
                <Label>{humanLabel(flag.key)}</Label>
                <Input
                  value={String((getValue(flag.key) as string | number | null) ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const numeric = Number(raw);
                    setValue(flag.key, raw !== "" && !Number.isNaN(numeric) ? numeric : raw);
                  }}
                  placeholder={flag.description ?? flag.key}
                />
                {flag.description && (
                  <p className="text-muted-foreground mt-1 text-xs">{flag.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VoiceTestButton(): React.ReactElement {
  const testMutation = trpc.adminSettings.testVoice.useMutation();
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleTest(): Promise<void> {
    setTestResult(null);
    const result = await testMutation.mutateAsync();
    setTestResult(result.message);

    // Play the audio if available
    if (result.success && result.audioBase64 && result.contentType) {
      try {
        const audioData = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([audioData], { type: result.contentType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = (): void => URL.revokeObjectURL(url);
      } catch {
        // Audio playback failed silently
      }
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleTest} disabled={testMutation.isPending}>
        {testMutation.isPending ? "Testing..." : "Test Azure Voice"}
      </Button>
      {testResult && (
        <p className={`text-xs ${testMutation.data?.success ? "text-green-600" : "text-red-500"}`}>
          {testResult}
        </p>
      )}
    </div>
  );
}

function VoicePlatformUsage(): React.ReactElement {
  const usageQuery = trpc.adminSettings.getTTSPlatformUsage.useQuery(undefined, {
    staleTime: 30_000,
  });

  if (!usageQuery.data) return <></>;

  const used = usageQuery.data.used;

  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">Platform TTS Usage (this month)</p>
      <p className="text-muted-foreground text-2xl font-bold">
        {used.toLocaleString()} <span className="text-sm font-normal">chars used</span>
      </p>
      <div className="bg-muted mt-2 h-2 w-full rounded-full">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all"
          style={{ width: `${Math.min(100, (used / 500000) * 100)}%` }}
        />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">Azure free tier: 500K chars/month</p>
    </div>
  );
}
