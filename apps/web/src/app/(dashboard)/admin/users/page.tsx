"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function AdminUsersPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [banReason, setBanReason] = useState("");

  // Create user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"student" | "teacher" | "admin" | "superadmin">("student");

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.adminUsers.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    role: (roleFilter as "student" | "teacher" | "admin" | "superadmin") || undefined,
    status: (statusFilter as "active" | "inactive" | "banned" | "unverified") || undefined,
  });

  const createMutation = trpc.adminUsers.create.useMutation({
    onSuccess: () => {
      setCreateDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      utils.adminUsers.list.invalidate();
    },
  });

  const banMutation = trpc.adminUsers.ban.useMutation({
    onSuccess: () => {
      setBanDialogOpen(false);
      setBanReason("");
      utils.adminUsers.list.invalidate();
    },
  });

  const unbanMutation = trpc.adminUsers.unban.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
  });

  const deactivateMutation = trpc.adminUsers.deactivate.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
  });

  const reactivateMutation = trpc.adminUsers.reactivate.useMutation({
    onSuccess: () => utils.adminUsers.list.invalidate(),
  });

  function getStatusBadge(user: {
    isActive: boolean;
    isBanned: boolean;
    emailVerified: string | Date | null;
    phoneVerified: string | Date | null;
  }): React.ReactElement {
    if (user.isBanned) return <Badge variant="destructive">Banned</Badge>;
    if (!user.isActive) return <Badge variant="secondary">Inactive</Badge>;
    if (!user.emailVerified && !user.phoneVerified)
      return <Badge variant="outline">Unverified</Badge>;
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  }

  function getRoleBadge(role: string): React.ReactElement {
    const colors: Record<string, string> = {
      superadmin: "bg-purple-100 text-purple-800",
      admin: "bg-blue-100 text-blue-800",
      teacher: "bg-yellow-100 text-yellow-800",
      student: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[role] ?? ""}>{role}</Badge>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={() => setCreateDialogOpen(true)}>+ Create User</Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name, email, phone, username..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All Roles</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="banned">Banned</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {/* User Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">Loading users...</div>
          ) : !data?.items.length ? (
            <div className="text-muted-foreground p-8 text-center">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-3 text-left font-medium">User</th>
                    <th className="p-3 text-left font-medium">Role</th>
                    <th className="p-3 text-left font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Provider</th>
                    <th className="p-3 text-left font-medium">Logins</th>
                    <th className="p-3 text-left font-medium">Joined</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/50 border-b">
                      <td className="p-3">
                        <Link href={`/admin/users/${user.id}` as "/"} className="hover:underline">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-muted-foreground text-xs">{user.email}</div>
                          {user.username && (
                            <div className="text-muted-foreground text-xs">@{user.username}</div>
                          )}
                        </Link>
                      </td>
                      <td className="p-3">{getRoleBadge(user.role)}</td>
                      <td className="p-3">{getStatusBadge(user)}</td>
                      <td className="p-3 text-xs">{user.authProvider}</td>
                      <td className="p-3 text-xs">{user.loginCount}</td>
                      <td className="p-3 text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              ...
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/users/${user.id}` as "/"}>View Profile</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.isBanned ? (
                              <DropdownMenuItem
                                onClick={() => unbanMutation.mutate({ userId: user.id })}
                              >
                                Unban
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  setBanDialogOpen(true);
                                }}
                                className="text-destructive"
                              >
                                Ban User
                              </DropdownMenuItem>
                            )}
                            {user.isActive ? (
                              <DropdownMenuItem
                                onClick={() => deactivateMutation.mutate({ userId: user.id })}
                              >
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => reactivateMutation.mutate({ userId: user.id })}
                              >
                                Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Create a new user account</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: newName,
                email: newEmail,
                password: newPassword,
                role: newRole,
              });
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>This user will be unable to log in.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Reason</Label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Reason for ban"
                required
              />
            </div>
            <Button
              variant="destructive"
              onClick={() => banMutation.mutate({ userId: selectedUserId, reason: banReason })}
              disabled={!banReason || banMutation.isPending}
            >
              {banMutation.isPending ? "Banning..." : "Confirm Ban"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
