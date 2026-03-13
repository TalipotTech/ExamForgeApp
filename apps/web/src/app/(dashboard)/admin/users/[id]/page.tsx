"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

export default function AdminUserDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as "/";

  const { data, isLoading } = trpc.adminUsers.getById.useQuery({ id: userId });
  const utils = trpc.useUtils();

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | "superadmin">(
    "student",
  );
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro" | "premium">("free");
  const [creditsAmount, setCreditsAmount] = useState(0);
  const [newPassword, setNewPassword] = useState("");

  const changeRoleMutation = trpc.adminUsers.changeRole.useMutation({
    onSuccess: () => {
      setRoleDialogOpen(false);
      utils.adminUsers.getById.invalidate({ id: userId });
    },
  });
  const changePlanMutation = trpc.adminUsers.changePlan.useMutation({
    onSuccess: () => {
      setPlanDialogOpen(false);
      utils.adminUsers.getById.invalidate({ id: userId });
    },
  });
  const addCreditsMutation = trpc.adminUsers.addCredits.useMutation({
    onSuccess: () => {
      setCreditsDialogOpen(false);
      utils.adminUsers.getById.invalidate({ id: userId });
    },
  });
  const resetPasswordMutation = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: () => {
      setResetPwDialogOpen(false);
      setNewPassword("");
    },
  });
  const verifyMutation = trpc.adminUsers.verifyManually.useMutation({
    onSuccess: () => utils.adminUsers.getById.invalidate({ id: userId }),
  });
  const banMutation = trpc.adminUsers.ban.useMutation({
    onSuccess: () => utils.adminUsers.getById.invalidate({ id: userId }),
  });
  const unbanMutation = trpc.adminUsers.unban.useMutation({
    onSuccess: () => utils.adminUsers.getById.invalidate({ id: userId }),
  });
  const deleteMutation = trpc.adminUsers.deleteUser.useMutation({
    onSuccess: () => router.push("/admin/users" as "/"),
  });

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!data) return <div className="p-8 text-center">User not found</div>;

  const { user, subscription, credits, auditLog, sessions } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground text-sm">{user.email}</p>
          {user.phone && <p className="text-muted-foreground text-sm">{user.phone}</p>}
          {user.username && <p className="text-muted-foreground text-sm">@{user.username}</p>}
        </div>
        <Button variant="outline" onClick={() => router.push("/admin/users" as "/")}>
          Back to Users
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="flex items-center gap-2">
                <Badge>{user.role}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setSelectedRole(user.role);
                    setRoleDialogOpen(true);
                  }}
                >
                  Change
                </Button>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span>{user.isActive ? (user.isBanned ? "Banned" : "Active") : "Inactive"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email Verified</span>
              <span className="flex items-center gap-2">
                {user.emailVerified ? "Yes" : "No"}
                {!user.emailVerified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => verifyMutation.mutate({ userId, type: "email" })}
                  >
                    Verify
                  </Button>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone Verified</span>
              <span className="flex items-center gap-2">
                {user.phoneVerified ? "Yes" : "No"}
                {!user.phoneVerified && user.phone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => verifyMutation.mutate({ userId, type: "phone" })}
                  >
                    Verify
                  </Button>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auth Provider</span>
              <span>{user.authProvider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Joined</span>
              <span>{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Login</span>
              <span>
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Logins</span>
              <span>{user.loginCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Credits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{subscription?.planDisplayName ?? "None"}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setSelectedPlan((subscription?.planName ?? "free") as typeof selectedPlan);
                    setPlanDialogOpen(true);
                  }}
                >
                  Change
                </Button>
              </span>
            </div>
            {subscription && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period Ends</span>
                <span>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credits</span>
              <span className="flex items-center gap-2">
                {credits ? `${credits.remaining}/${credits.total}` : "N/A"}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setCreditsDialogOpen(true)}
                >
                  Add
                </Button>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setResetPwDialogOpen(true)}>
            Reset Password
          </Button>
          {user.isBanned ? (
            <Button variant="outline" size="sm" onClick={() => unbanMutation.mutate({ userId })}>
              Unban
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => banMutation.mutate({ userId, reason: "Admin action" })}
            >
              Ban
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (
                confirm("Are you sure you want to delete this user? This action cannot be undone.")
              ) {
                deleteMutation.mutate({ userId });
              }
            }}
          >
            Delete User
          </Button>
        </CardContent>
      </Card>

      {/* Login History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Login History</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No login sessions recorded</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex justify-between text-sm">
                  <span>{new Date(session.createdAt).toLocaleString()}</span>
                  <span className="text-muted-foreground text-xs">
                    {(session.deviceInfo as Record<string, string>)?.browser ?? "Unknown"} /{" "}
                    {(session.deviceInfo as Record<string, string>)?.ip ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-muted-foreground text-sm">No admin actions recorded</p>
          ) : (
            <div className="space-y-2">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex justify-between text-sm">
                  <span>{entry.action}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as typeof selectedRole)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <Button
              onClick={() => changeRoleMutation.mutate({ userId, role: selectedRole })}
              disabled={changeRoleMutation.isPending}
            >
              {changeRoleMutation.isPending ? "Changing..." : "Change Role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as typeof selectedPlan)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
            <Button
              onClick={() => changePlanMutation.mutate({ userId, planName: selectedPlan })}
              disabled={changePlanMutation.isPending}
            >
              {changePlanMutation.isPending ? "Changing..." : "Change Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Credits Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credits</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Credits to Add</Label>
              <Input
                type="number"
                min={1}
                value={creditsAmount}
                onChange={(e) => setCreditsAmount(parseInt(e.target.value) || 0)}
              />
            </div>
            <Button
              onClick={() => addCreditsMutation.mutate({ userId, amount: creditsAmount })}
              disabled={creditsAmount <= 0 || addCreditsMutation.isPending}
            >
              {addCreditsMutation.isPending ? "Adding..." : "Add Credits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPwDialogOpen} onOpenChange={setResetPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for this user</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
              />
            </div>
            <Button
              onClick={() => resetPasswordMutation.mutate({ userId, newPassword })}
              disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
