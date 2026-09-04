"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  RefreshIcon,
  Shield01Icon,
  Shield02Icon,
  UserMultiple02Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { getAdminUsers, updateUserRole, type AdminUserDto } from "@/lib/actions/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const queryClient = useQueryClient();

  const { data: users, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => getAdminUsers(search),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "user" }) =>
      updateUserRole(userId, role),
    onSuccess: (_, variables) => {
      toast.success(`User role updated to ${variables.role}`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    },
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
              Users Management
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              {users?.length ?? 0}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage authenticated accounts, assign administrative roles, and inspect canvas ownership.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-border/70 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            />
            <Input
              type="search"
              placeholder="Search users by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch("")}
              className="text-xs h-9 shrink-0 text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Users Table Card */}
      <Card className="border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HugeiconsIcon icon={UserMultiple02Icon} className="h-4 w-4 text-primary" />
            <span>Registered Creators</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Role changes take effect immediately on next server action or token refresh.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <Skeleton key={n} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive font-medium">
                Failed to load users: {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 text-xs">
                Retry
              </Button>
            </div>
          ) : users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="text-xs text-muted-foreground">
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Canvases</TableHead>
                  <TableHead>AI Tokens</TableHead>
                  <TableHead>Joined Date</TableHead>
                  <TableHead className="text-right">Manage Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: AdminUserDto) => {
                  const isAdmin = u.role === "admin";
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium text-xs">
                        <div className="flex items-center gap-2.5">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.image}
                              alt={u.name}
                              className="h-7 w-7 rounded-full border border-border object-cover"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[11px] font-bold">
                              {u.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="truncate max-w-[160px]">{u.name}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                        {u.email}
                      </TableCell>

                      <TableCell className="text-xs">
                        {isAdmin ? (
                          <Badge className="gap-1 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0 h-5">
                            <HugeiconsIcon icon={Shield01Icon} className="h-3 w-3" />
                            <span>admin</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] font-mono px-2 py-0 h-5">
                            user
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {u.canvasCount}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {u.totalTokens.toLocaleString()}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="outline"
                                size="xs"
                                className="text-xs gap-1.5 cursor-pointer"
                                disabled={roleMutation.isPending}
                              />
                            }
                          >
                            <HugeiconsIcon icon={Shield02Icon} className="h-3 w-3" />
                            <span>{isAdmin ? "Admin" : "User"}</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={() => roleMutation.mutate({ userId: u.id, role: "admin" })}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <HugeiconsIcon icon={Shield01Icon} className="h-3.5 w-3.5 text-primary" />
                              <span>Set Admin</span>
                              {isAdmin && <HugeiconsIcon icon={Tick01Icon} className="h-3 w-3 ml-auto text-primary" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => roleMutation.mutate({ userId: u.id, role: "user" })}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <span className="h-3.5 w-3.5 flex items-center justify-center font-mono text-[10px] text-muted-foreground">
                                U
                              </span>
                              <span>Set User</span>
                              {!isAdmin && <HugeiconsIcon icon={Tick01Icon} className="h-3 w-3 ml-auto text-primary" />}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-xs text-muted-foreground">
              No users found matching &quot;{search}&quot;.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
