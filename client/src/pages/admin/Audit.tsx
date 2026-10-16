import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { apiGetList } from "@/services/api";
import type { AuditLog, PaginationMeta } from "@/types";
import { initials, parseApiError } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PageHeader } from "@/components/shared/PageHeader";
import { DateRangePicker, type DateRangeValue } from "@/components/shared/DateRangePicker";
import { DataTableSkeleton } from "@/components/shared/DataTableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { DateTime } from "@/components/shared/DateTime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 25;

function actorName(actor: AuditLog["actor"]): string {
  if (!actor) return "System";
  if (typeof actor === "string") return actor;
  return actor.name || actor.email || "Unknown";
}

function actorEmail(actor: AuditLog["actor"]): string | null {
  if (!actor || typeof actor === "string") return null;
  return actor.email ?? null;
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) {
    return <p className="text-sm text-ink-400">—</p>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-cream/60 p-3 text-xs text-ink-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AdminAuditPage() {
  usePageMeta("Audit Log", "Every action, tracked.");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
  const [range, setRange] = useState<DateRangeValue>({});
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const query = useQuery({
    queryKey: ["audit", { page, action, entity, actor, range }],
    queryFn: () =>
      apiGetList<AuditLog>("/audit", {
        page,
        limit: PAGE_SIZE,
        action: action || undefined,
        entity: entity || undefined,
        actor: /^[a-f0-9]{24}$/i.test(actor) ? actor : undefined,
        from: range.from,
        to: range.to,
      }),
    placeholderData: keepPreviousData,
  });

  const logs = query.data?.data ?? [];
  const meta: PaginationMeta | undefined = query.data?.meta;
  const filtered = Boolean(action || entity || actor || range.from || range.to);

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="A tamper-evident trail of every privileged action."
      />

      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-500" htmlFor="audit-action">
              Action
            </label>
            <Input
              id="audit-action"
              value={action}
              onChange={(e) => update(setAction)(e.target.value)}
              placeholder="e.g. settings.update"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-500" htmlFor="audit-entity">
              Entity
            </label>
            <Input
              id="audit-entity"
              value={entity}
              onChange={(e) => update(setEntity)(e.target.value)}
              placeholder="e.g. Invoice"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-ink-500" htmlFor="audit-actor">
              Actor id
            </label>
            <Input
              id="audit-actor"
              value={actor}
              onChange={(e) => update(setActor)(e.target.value)}
              placeholder="User id"
            />
          </div>
          <DateRangePicker
            value={range}
            onChange={(value) => {
              setRange(value);
              setPage(1);
            }}
            className="items-start"
          />
        </CardContent>
      </Card>

      {query.isLoading ? (
        <DataTableSkeleton rows={8} columns={5} />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load the audit log"
          message={parseApiError(query.error).message}
          onRetry={() => query.refetch()}
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : ScrollText}
          title={filtered ? "No matching entries" : "No audit entries yet"}
          description={
            filtered
              ? "Try widening your filters or clearing the date range."
              : "Privileged actions will be recorded here automatically."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <DateTime value={log.createdAt} showTime />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                          {initials(actorName(log.actor))}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-ink">{actorName(log.actor)}</div>
                          {actorEmail(log.actor) && (
                            <div className="text-xs text-ink-400">{actorEmail(log.actor)}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="gold">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-ink">{log.entity}</div>
                      {log.entityId && (
                        <div className="font-mono text-xs text-ink-400">{log.entityId}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-500">{log.ip ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(log)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected?.entity}
              {selected?.entityId ? ` · ${selected.entityId}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Actor</p>
                  <p className="text-ink">
                    {actorName(selected.actor)}
                    {actorEmail(selected.actor) ? ` (${actorEmail(selected.actor)})` : ""}
                  </p>
                </div>
                {selected.actorRole && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Role</p>
                    <p className="capitalize text-ink">{selected.actorRole}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">When</p>
                  <DateTime value={selected.createdAt} showTime />
                </div>
                {selected.ip && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-500">IP address</p>
                    <p className="font-mono text-ink">{selected.ip}</p>
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Before</p>
                  <JsonBlock value={selected.before} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">After</p>
                  <JsonBlock value={selected.after} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
