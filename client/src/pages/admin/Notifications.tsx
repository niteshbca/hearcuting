import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Mail,
  RotateCw,
} from "lucide-react";
import { apiGetList, apiPatch, apiPost } from "@/services/api";
import type { EmailDeliveryLog, EmailStatus, Notification, PaginationMeta } from "@/types";
import { parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { usePermission } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateTime } from "@/components/shared/DateTime";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/sonner";

const PAGE_SIZE = 20;

type NotificationMeta = PaginationMeta & { unreadCount?: number };

const emailStatuses: EmailStatus[] = ["queued", "sending", "sent", "failed", "retrying"];

function InboxTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const query = useQuery({
    queryKey: ["notifications", { page, unreadOnly }],
    queryFn: () =>
      apiGetList<Notification>("/notifications", {
        page,
        limit: PAGE_SIZE,
        unreadOnly: unreadOnly ? "true" : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch<Notification>(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) =>
      toast.error("Couldn't mark as read", { description: parseApiError(error).message }),
  });

  const readAll = useMutation({
    mutationFn: () => apiPost<{ modified: number }>("/notifications/read-all"),
    onSuccess: (result) => {
      toast.success(`${result.modified} notification${result.modified === 1 ? "" : "s"} marked read`);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) =>
      toast.error("Couldn't mark all as read", { description: parseApiError(error).message }),
  });

  const notifications = query.data?.data ?? [];
  const meta = query.data?.meta as NotificationMeta | undefined;
  const unreadCount = meta?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={(checked) => {
              setUnreadOnly(checked);
              setPage(1);
            }}
          />
          <Label htmlFor="unread-only">Unread only</Label>
          {unreadCount > 0 && <Badge variant="gold">{unreadCount} unread</Badge>}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={readAll.isPending || unreadCount === 0}
          onClick={() => readAll.mutate()}
        >
          <CheckCheck /> Mark all read
        </Button>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={3} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load notifications"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={unreadOnly ? "No unread notifications" : "You're all caught up"}
          description={
            unreadOnly
              ? "You have read every notification."
              : "Alerts about bookings, payments and reminders will appear here."
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-cream/50"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={
                      notification.isRead
                        ? "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400"
                        : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold-dark"
                    }
                  >
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {notification.title}
                      {!notification.isRead && <span className="h-2 w-2 rounded-full bg-gold" aria-hidden="true" />}
                    </p>
                    {notification.body && (
                      <p className="mt-0.5 text-sm text-ink-500">{notification.body}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-400">
                      <DateTime value={notification.createdAt} showTime />
                    </p>
                  </div>
                </div>
                {!notification.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(notification.id)}
                  >
                    <Check /> Mark read
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />}
    </div>
  );
}

function EmailLogsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["email-logs", { page, status, search }],
    queryFn: () =>
      apiGetList<EmailDeliveryLog>("/notifications/email-logs", {
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const retry = useMutation({
    mutationFn: (id: string) => apiPost<{ id: string; status: string }>(`/notifications/email-logs/${id}/retry`),
    onSuccess: () => {
      toast.success("Email re-queued");
      void queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    },
    onError: (error) =>
      toast.error("Couldn't retry email", { description: parseApiError(error).message }),
  });

  const logs = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search recipient, subject or template…"
          ariaLabel="Search email logs"
          className="sm:w-80"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {emailStatuses.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <DataTableSkeleton rows={6} columns={5} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load email logs"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No email logs"
          description="Transactional emails and their delivery attempts will show up here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Sent / created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="font-medium text-ink">{log.toName ?? log.to}</div>
                      {log.toName && <div className="text-xs text-ink-400">{log.to}</div>}
                    </TableCell>
                    <TableCell className="text-ink-500">{log.subject}</TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{log.template}</TableCell>
                    <TableCell>
                      <StatusBadge kind="email" status={log.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {log.attempts}/{log.maxAttempts}
                    </TableCell>
                    <TableCell>
                      <DateTime value={log.sentAt ?? log.createdAt} showTime />
                      {log.lastError && (
                        <p className="mt-1 max-w-xs truncate text-xs text-danger" title={log.lastError}>
                          {log.lastError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(log.id)}
                        >
                          <RotateCw /> Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />}
    </div>
  );
}

export default function AdminNotificationsPage() {
  usePageMeta("Notifications", "Alerts and email delivery logs.");
  const { can } = usePermission();
  const canViewEmailLogs = can("notifications.view");

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Your alerts and outbound email delivery logs." />

      <Tabs defaultValue="inbox" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inbox">
            <Bell className="mr-1 h-4 w-4" /> Inbox
          </TabsTrigger>
          {canViewEmailLogs && (
            <TabsTrigger value="email">
              <Mail className="mr-1 h-4 w-4" /> Email logs
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inbox">
          <InboxTab />
        </TabsContent>

        {canViewEmailLogs && (
          <TabsContent value="email">
            <EmailLogsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
