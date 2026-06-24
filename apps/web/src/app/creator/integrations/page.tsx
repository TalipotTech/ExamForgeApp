"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plug, ShieldAlert, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const ZOOM_ERROR_MESSAGES: Record<string, string> = {
  zoom_missing_code: "Zoom didn't return an authorization code. Try again.",
  zoom_exchange_failed: "Zoom rejected the authorization code. Try again.",
  zoom_identity_failed: "Couldn't fetch your Zoom account. Try again.",
  zoom_no_user_id: "Zoom didn't return a user identity.",
  zoom_bad_token_payload: "Zoom returned an unexpected token payload.",
  zoom_not_configured: "Zoom integration isn't configured on this server.",
  zoom_unexpected: "Something went wrong connecting Zoom.",
  not_a_creator: "Only registered creators can connect Zoom.",
};

// useSearchParams() requires a Suspense boundary during static rendering.
export default function IntegrationsPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const statusQuery = trpc.zoomIntegration.status.useQuery();

  const startConnect = trpc.zoomIntegration.startConnect.useMutation({
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl;
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnect = trpc.zoomIntegration.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Disconnected Zoom");
      void utils.zoomIntegration.status.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Surface ?connected=zoom or ?error=... once and clean the URL.
  const sp = searchParams.toString();
  useEffect(() => {
    const params = new URLSearchParams(sp);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected === "zoom") {
      toast.success("Zoom connected");
      void utils.zoomIntegration.status.invalidate();
      router.replace("/creator/integrations");
    } else if (error) {
      toast.error(ZOOM_ERROR_MESSAGES[error] ?? `Connect failed (${error})`);
      router.replace("/creator/integrations");
    }
  }, [sp, router, utils]);

  const status = statusQuery.data;
  const loading = statusQuery.isLoading;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Plug className="size-6" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect external providers to your creator account.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Meeting providers
        </h2>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
                  <Video className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Zoom</h3>
                    {loading ? null : status?.connected ? (
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="mr-1 size-3" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <XCircle className="text-muted-foreground mr-1 size-3" /> Not connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Auto-create meetings + auto-record. Recordings attach to your past sessions
                    automatically.
                  </p>
                  {status?.connected && (
                    <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
                      {status.zoomAccountEmail && (
                        <div>
                          <span className="font-medium">Account:</span> {status.zoomAccountEmail}
                          {status.zoomAccountType && status.zoomAccountType !== "unknown" && (
                            <span className="text-foreground/70 ml-1">
                              ({status.zoomAccountType})
                            </span>
                          )}
                        </div>
                      )}
                      {status.connectedAt && (
                        <div>
                          <span className="font-medium">Connected:</span>{" "}
                          {new Date(status.connectedAt).toLocaleString()}
                        </div>
                      )}
                    </dl>
                  )}
                  {status?.connected && status.zoomAccountType === "basic" && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                      Cloud recording requires Zoom Pro or higher. Sessions on the Basic plan will
                      be created without auto-recording.
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {!loading && status?.configured === false && (
                  <Badge variant="secondary">Not available on this server</Badge>
                )}
                {!loading && status?.configured && !status.connected && (
                  <Button onClick={() => startConnect.mutate()} disabled={startConnect.isPending}>
                    {startConnect.isPending ? "Redirecting…" : "Connect Zoom"}
                  </Button>
                )}
                {!loading && status?.connected && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => startConnect.mutate()}
                      disabled={startConnect.isPending}
                    >
                      {startConnect.isPending ? "Redirecting…" : "Reconnect"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => disconnect.mutate()}
                      disabled={disconnect.isPending}
                    >
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-xs">
          Connecting Zoom lets ExamForge create meetings + receive recording webhooks on your
          behalf. Tokens are encrypted at rest and never shared.
        </p>
      </section>
    </div>
  );
}
