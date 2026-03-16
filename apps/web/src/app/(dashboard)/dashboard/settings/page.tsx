"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  CreditCard,
  GraduationCap,
  Plus,
  X,
  Loader2,
  Crown,
  ArrowRight,
  Shield,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage(): React.ReactElement {
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  // Queries
  const statusQuery = trpc.onboarding.getOnboardingStatus.useQuery();
  const examsQuery = trpc.onboarding.listAvailableExams.useQuery();
  const subscriptionQuery = trpc.payment.getCurrentSubscription.useQuery();

  // Mutations
  const addExamMutation = trpc.onboarding.addUserExam.useMutation({
    onSuccess: () => {
      toast.success("Exam added!");
      utils.onboarding.getOnboardingStatus.invalidate();
      utils.learn.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeExamMutation = trpc.onboarding.removeUserExam.useMutation({
    onSuccess: () => {
      toast.success("Exam removed");
      utils.onboarding.getOnboardingStatus.invalidate();
      utils.learn.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedExamIds = new Set((statusQuery.data?.selectedExams ?? []).map((e) => e.examId));

  const availableExams = (examsQuery.data ?? []).filter((e) => !selectedExamIds.has(e.id));

  const [showAddExam, setShowAddExam] = useState(false);

  // PIN management
  const hasPinQuery = trpc.auth.hasPin.useQuery();
  const setPinMutation = trpc.auth.setPin.useMutation({
    onSuccess: () => {
      toast.success("PIN set successfully!");
      hasPinQuery.refetch();
      setShowPinForm(false);
      setPinPassword("");
      setPinValue("");
      setPinConfirm("");
    },
    onError: (err) => toast.error(err.message),
  });
  const removePinMutation = trpc.auth.removePin.useMutation({
    onSuccess: () => {
      toast.success("PIN removed");
      hasPinQuery.refetch();
      setShowRemovePin(false);
      setRemovePinPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const [showPinForm, setShowPinForm] = useState(false);
  const [showRemovePin, setShowRemovePin] = useState(false);
  const [pinPassword, setPinPassword] = useState("");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [removePinPassword, setRemovePinPassword] = useState("");

  const isSubscriber =
    (session?.user as { isSubscriber?: boolean } | undefined)?.isSubscriber ?? false;
  const subscriptionData = subscriptionQuery.data;
  const subscription = subscriptionData?.subscription ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Name</span>
              <span className="text-sm font-medium">{session?.user?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Email</span>
              <span className="text-sm font-medium">{session?.user?.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Role</span>
              <Badge variant="secondary" className="text-xs capitalize">
                {(session?.user as { role?: string } | undefined)?.role ?? "student"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security — PIN Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasPinQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : hasPinQuery.data?.hasPin ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">PIN Login: Enabled</span>
              </div>
              <p className="text-muted-foreground text-xs">
                You can use your 4-digit PIN to sign in instead of a password.
              </p>
              {showRemovePin ? (
                <div className="bg-muted/50 space-y-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="remove-pin-password" className="text-xs">
                      Enter your password to remove PIN
                    </Label>
                    <Input
                      id="remove-pin-password"
                      type="password"
                      value={removePinPassword}
                      onChange={(e) => setRemovePinPassword(e.target.value)}
                      placeholder="Current password"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!removePinPassword || removePinMutation.isPending}
                      onClick={() =>
                        removePinMutation.mutate({ currentPassword: removePinPassword })
                      }
                    >
                      {removePinMutation.isPending ? "Removing..." : "Remove PIN"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowRemovePin(false);
                        setRemovePinPassword("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowRemovePin(true)}>
                  Remove PIN
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Set a 4-digit PIN for quick sign-in instead of your password.
              </p>
              {showPinForm ? (
                <div className="bg-muted/50 space-y-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pin-current-password" className="text-xs">
                      Current Password
                    </Label>
                    <Input
                      id="pin-current-password"
                      type="password"
                      value={pinPassword}
                      onChange={(e) => setPinPassword(e.target.value)}
                      placeholder="Enter your current password"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-pin" className="text-xs">
                      New PIN (4 digits)
                    </Label>
                    <Input
                      id="new-pin"
                      type="password"
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="Enter 4-digit PIN"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirm-pin" className="text-xs">
                      Confirm PIN
                    </Label>
                    <Input
                      id="confirm-pin"
                      type="password"
                      value={pinConfirm}
                      onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="Confirm 4-digit PIN"
                    />
                  </div>
                  {pinValue.length === 4 && pinConfirm.length === 4 && pinValue !== pinConfirm && (
                    <p className="text-destructive text-xs">PINs do not match</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        !pinPassword ||
                        pinValue.length !== 4 ||
                        pinValue !== pinConfirm ||
                        setPinMutation.isPending
                      }
                      onClick={() =>
                        setPinMutation.mutate({
                          pin: pinValue,
                          currentPassword: pinPassword,
                        })
                      }
                    >
                      {setPinMutation.isPending ? "Setting..." : "Set PIN"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowPinForm(false);
                        setPinPassword("");
                        setPinValue("");
                        setPinConfirm("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="default" size="sm" onClick={() => setShowPinForm(true)}>
                  Set Login PIN
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptionQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : isSubscriber && subscription ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                <span className="font-medium">{subscription.planDisplayName}</span>
                <Badge variant="default" className="text-xs">
                  Active
                </Badge>
              </div>
              {subscription.currentPeriodEnd && (
                <p className="text-muted-foreground text-sm">
                  Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">Free Tier</span>
                <Badge variant="secondary" className="text-xs">
                  Current
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                Upgrade to access AI tutoring, profile analytics, and unlimited exams.
              </p>
              <Link href={"/pricing" as "/"}>
                <Button variant="default" size="sm" className="gap-1">
                  Upgrade Plan
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Exams */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Your Exams
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowAddExam(!showAddExam)}
            >
              <Plus className="h-3 w-3" />
              Add Exam
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* Current exams */}
              {(statusQuery.data?.selectedExams ?? []).length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No exams selected. Add exams to personalize your dashboard.
                </p>
              ) : (
                <div className="space-y-2">
                  {statusQuery.data?.selectedExams.map((exam) => (
                    <div
                      key={exam.examId}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div>
                        <span className="text-sm font-medium">{exam.examName}</span>
                        {exam.targetScore && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            Target: {exam.targetScore}%
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeExamMutation.mutate({ examId: exam.examId })}
                        disabled={removeExamMutation.isPending}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add exam dropdown */}
              {showAddExam && availableExams.length > 0 && (
                <div className="bg-muted/50 mt-4 space-y-2 rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs font-medium">Available exams:</p>
                  {availableExams.map((exam) => (
                    <button
                      key={exam.id}
                      className="hover:bg-background flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors"
                      onClick={() => {
                        addExamMutation.mutate({ examId: exam.id });
                        setShowAddExam(false);
                      }}
                      disabled={addExamMutation.isPending}
                    >
                      <span>{exam.name}</span>
                      <Plus className="text-muted-foreground h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              {showAddExam && availableExams.length === 0 && (
                <p className="text-muted-foreground mt-3 text-center text-xs">
                  All available exams are already added.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
