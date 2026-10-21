import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter, useParams } from 'wouter';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  Layers3,
  LayoutGrid,
  ListOrdered,
  ListTodo,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useWorkflowUiStore } from '@/store/ui';
import { useWebSocketSync } from '@/hooks/useWebSocketSync';
import { DocumentInspector } from '@/components/inspector/DocumentInspector';
import { HierarchicalTaskList } from '@/components/list/HierarchicalTaskList';
import { TaskDagViewer } from '@/components/graph/TaskDagViewer';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import NotFound from '@/pages/not-found';
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useListDocuments,
  getListDocumentsQueryKey,
  useListFeatures,
  getListFeaturesQueryKey,
  useCreateFeature,
  useListTasks,
  getListTasksQueryKey,
  useCreateTask,
  useClaimTask,
  useSubmitTask,
  useReviewTask,
  useListComments,
  getListCommentsQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
} from '@workspace/api-client-react';
import type { Feature, Task, Activity as ActivityData, DocumentSummary } from '@workspace/api-client-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 12_000,
      retry: 1,
    },
  },
});

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const dashboard = useGetDashboard();
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 45_000 },
  });
  const { isConnected, status: wsStatus } = useWebSocketSync();

  const project = dashboard.data?.projectName ?? 'Workspace';

  return (
    <div className="min-h-[100dvh] md:flex bg-background text-foreground">
      <aside className="bg-sidebar text-sidebar-foreground md:fixed md:inset-y-0 md:flex md:w-[252px] md:flex-col border-r border-sidebar-border">
        <div className="flex items-center justify-between px-5 py-5 md:block md:px-6 md:pt-7">
          <Link href="/" className="group flex items-center gap-3 text-sidebar-foreground no-underline">
            <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[.07] text-primary">
              <TerminalSquare size={19} />
            </span>
            <span>
              <span className="block font-serif text-[17px] font-bold tracking-tight">spec-flow</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[.19em] text-white/45">
                human × agent
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 md:mt-7">
            <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] text-white/60 inline-flex items-center gap-1.5">
              {isConnected ? (
                <Wifi size={11} className="text-emerald-400" />
              ) : (
                <WifiOff size={11} className="text-rose-400" />
              )}
              {isConnected ? 'live ws' : wsStatus}
            </span>
          </div>
        </div>

        <div className="hidden px-6 pb-5 md:block">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-white/40">Current workspace</div>
          <div className="truncate text-[13px] font-semibold text-white/90">{project}</div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:py-2">
          <NavItem href="/" current={location === '/'} icon={<Layers3 size={16} />} label="Overview" />
          <NavItem
            href="/documents"
            current={location.startsWith('/documents')}
            icon={<BookOpen size={16} />}
            label="Documents"
          />
          <NavItem
            href="/features"
            current={location.startsWith('/features') || location.startsWith('/tasks')}
            icon={<ListTodo size={16} />}
            label="Tasks"
          />
        </nav>

        <div className="hidden flex-1 md:block" />

        <div className="hidden border-t border-white/10 p-5 md:block">
          <div className="flex items-center gap-2 text-[11px] text-white/55">
            <ShieldCheck size={14} className="text-primary" />
            Your specs stay local-first
          </div>
          <p className="mb-0 mt-2 text-[10px] leading-relaxed text-white/35">
            Approved context is the source of truth for every agent run.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 md:ml-[252px] md:px-10 md:pt-9 xl:px-14">
        <div className="mx-auto max-w-[1360px]">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ href, current, icon, label }: { href: string; current: boolean; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      data-testid={`link-${label.toLowerCase()}`}
      className={cx(
        'flex min-w-fit items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium no-underline transition-colors md:w-full',
        current ? 'bg-white/[.11] text-white' : 'text-white/60 hover:bg-white/[.06] hover:text-white/90'
      )}
    >
      <span className={current ? 'text-primary' : ''}>{icon}</span>
      {label}
      {current && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary md:block" />}
    </Link>
  );
}

function Heading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-6">
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-muted-foreground">{eyebrow}</div>
        <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-.04em] sm:text-[36px]">{title}</h1>
        {detail && <p className="mb-0 mt-2 max-w-2xl text-sm text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </header>
  );
}

function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-border/80 bg-card/90 shadow-[0_2px_14px_hsl(32_22%_34%/.035)]', className)}>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{children}</label>;
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Surface className="flex items-center gap-4 p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700">
        <AlertCircle size={18} />
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold">Couldn’t load this view</div>
        <p className="mb-0 mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={retry}>
        <RefreshCw size={14} />
        Try again
      </Button>
    </Surface>
  );
}

function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const data = typeof error === 'object' && error !== null && 'data' in error ? (error as { data?: unknown }).data : null;
  const detail =
    typeof data === 'object' && data !== null && 'error' in data ? (data as { error?: unknown }).error : null;
  const message = typeof detail === 'string' ? detail : error instanceof Error ? error.message : 'The request could not be completed.';
  return (
    <div role="alert" className="rounded-lg border border-rose-300/70 bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-900">
      {message}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="Loading">
      <div className="h-24 animate-pulse rounded-xl bg-secondary/70" />
      <div className="h-24 animate-pulse rounded-xl bg-secondary/55" />
      <div className="h-24 animate-pulse rounded-xl bg-secondary/40" />
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const colors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-800',
    done: 'bg-emerald-100 text-emerald-800',
    'in-progress': 'bg-sky-100 text-sky-800',
    'to-review': 'bg-orange-100 text-orange-800',
    'in-review': 'bg-orange-100 text-orange-800',
    blocked: 'bg-rose-100 text-rose-800',
    'changes-requested': 'bg-rose-100 text-rose-800',
    draft: 'bg-secondary text-muted-foreground',
    todo: 'bg-secondary text-muted-foreground',
    available: 'bg-teal-100 text-teal-800',
    claimed: 'bg-sky-100 text-sky-800',
  };
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.06em]',
        colors[value] ?? 'bg-secondary text-muted-foreground'
      )}
    >
      {value.replaceAll('-', ' ')}
    </span>
  );
}

function Dashboard() {
  const q = useGetDashboard();
  const comments = useListComments({ query: { queryKey: getListCommentsQueryKey() } });
  const [, setLocation] = useLocation();

  if (q.isLoading)
    return (
      <>
        <Heading eyebrow="Workspace / overview" title="A clear view of the work" />
        <LoadingRows />
      </>
    );

  if (q.isError || !q.data)
    return (
      <>
        <Heading eyebrow="Workspace / overview" title="A clear view of the work" />
        <ErrorState message="Dashboard data is unavailable." retry={() => void q.refetch()} />
      </>
    );

  const d = q.data;
  const tasks = d.taskCounts;
  const gates = d.steeringTotal ? Math.round((d.steeringApprovedCount / d.steeringTotal) * 100) : 0;

  return (
    <div className="animate-in fade-in duration-500">
      <Heading
        eyebrow="Workspace / overview"
        title={d.projectName}
        detail="The approved context, moving work, and human decisions behind this workspace."
        action={
          <div className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-500" />
            SYNCED
          </div>
        }
      />
      <Surface className="mb-6 overflow-hidden">
        <div className="grid md:grid-cols-[1.15fr_.85fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Steering gate</div>
                <h2 className="mb-0 mt-2 font-serif text-[22px] font-semibold tracking-tight">
                  {d.steeringApproved ? 'Context is approved' : 'Approval needed before agents run'}
                </h2>
              </div>
              <div
                className={cx(
                  'grid size-11 place-items-center rounded-full',
                  d.steeringApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-primary'
                )}
              >
                {d.steeringApproved ? <CheckCheck size={21} /> : <ShieldCheck size={21} />}
              </div>
            </div>
            <p className="mb-0 mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
              {d.steeringApproved
                ? 'The foundational steering document has a human sign-off.'
                : 'Review the steering documents and approve the context agents should follow.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${gates}%` }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {d.steeringApprovedCount} / {d.steeringTotal} approved
              </span>
            </div>
            <button
              onClick={() => setLocation('/documents')}
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:gap-3"
              data-testid="button-review-steering"
            >
              Review documents <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 border-t border-border/80 bg-secondary/35 md:border-l md:border-t-0">
            <Metric label="Features" value={d.featureCount} icon={<Layers3 size={15} />} />
            <Metric label="Review queue" value={d.reviewQueueCount} icon={<Clock3 size={15} />} highlight={d.reviewQueueCount > 0} />
            <Metric label="Open comments" value={d.openCommentsCount} icon={<Clock3 size={15} />} />
            <Metric
              label="Tasks complete"
              value={tasks.done}
              icon={<Check size={15} />}
              sub={`${tasks.done} of ${tasks.done + tasks.todo + tasks.inProgress + tasks.toReview + tasks.blocked}`}
            />
          </div>
        </div>
      </Surface>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Surface>
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Execution pulse</div>
              <h2 className="mb-0 mt-1 text-[15px] font-semibold">Task flow</h2>
            </div>
            <button
              onClick={() => setLocation('/features')}
              className="text-xs font-semibold text-primary"
              data-testid="link-all-features"
            >
              View features <ArrowRight size={13} className="ml-1 inline" />
            </button>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border/70 sm:grid-cols-5 sm:divide-y-0">
            {[
              ['To do', tasks.todo, 'todo'],
              ['In progress', tasks.inProgress, 'in-progress'],
              ['For review', tasks.toReview, 'to-review'],
              ['Done', tasks.done, 'done'],
              ['Blocked', tasks.blocked, 'blocked'],
            ].map(([name, val, key]) => (
              <div key={key} className="px-4 py-5">
                <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span
                    className={cx(
                      'size-1.5 rounded-full',
                      key === 'done'
                        ? 'bg-emerald-500'
                        : key === 'blocked'
                        ? 'bg-rose-500'
                        : key === 'to-review'
                        ? 'bg-primary'
                        : 'bg-slate-400'
                    )}
                  />
                  {name}
                </div>
                <div className="font-serif text-3xl font-semibold tracking-tight">{val}</div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface>
          <div className="border-b border-border/70 px-5 py-4">
            <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Recent activity</div>
            <h2 className="mb-0 mt-1 text-[15px] font-semibold">Workspace trail</h2>
          </div>
          <div className="divide-y divide-border/70">
            {d.recentActivity.length ? (
              d.recentActivity.slice(0, 5).map((a: ActivityData) => (
                <div key={a.id} className="flex gap-3 px-5 py-3.5">
                  <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-primary">
                    <Activity size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[12px] leading-relaxed">{a.summary}</p>
                    <time className="font-mono text-[9px] text-muted-foreground">{dateLabel(a.createdAt)}</time>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-10 text-center text-xs text-muted-foreground">Activity will appear here as work moves.</div>
            )}
          </div>
        </Surface>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => setLocation('/features')}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card/75 p-4 text-left transition hover:border-primary/40"
          data-testid="button-open-features"
        >
          <span className="grid size-10 place-items-center rounded-lg bg-secondary text-foreground">
            <Layers3 size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Feature specs & Tasks</span>
            <span className="mt-1 block text-xs text-muted-foreground">Kanban, Hierarchical list, and dependency DAG views.</span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary" />
        </button>

        <button
          onClick={() => setLocation('/documents')}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card/75 p-4 text-left transition hover:border-primary/40"
          data-testid="button-open-documents"
        >
          <span className="grid size-10 place-items-center rounded-lg bg-secondary text-foreground">
            <FileText size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Document review & Inspector</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {comments.data?.length ?? d.openCommentsCount} comments anchored to specifications.
            </span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary" />
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  highlight,
  sub,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div className="min-h-[112px] border-b border-border/70 p-4 last:border-b-0 even:border-l md:border-b-0 md:border-l">
      <div className={cx('mb-3 flex items-center gap-2 text-[10px] font-medium', highlight ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
        {label}
      </div>
      <div className="font-serif text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 font-mono text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DocumentsPage() {
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const selected = useWorkflowUiStore((state) => state.selectedDocumentId);
  const setSelected = useWorkflowUiStore((state) => state.setSelectedDocumentId);
  const filter = useWorkflowUiStore((state) => state.documentFilter);
  const setFilter = useWorkflowUiStore((state) => state.setDocumentFilter);

  const filtered = (docs.data ?? []).filter((d: DocumentSummary) => filter === 'all' || d.kind === filter);
  const currentId = selected && filtered.some((d: DocumentSummary) => d.id === selected) ? selected : filtered[0]?.id;

  return (
    <div>
      <Heading
        eyebrow="Workspace / context"
        title="Document Inspector"
        detail="The living specification your agents receive. Human approval and anchored review keep the context trustworthy."
      />

      {docs.isLoading ? (
        <LoadingRows />
      ) : docs.isError ? (
        <ErrorState message="Document index is unavailable." retry={() => void docs.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Surface className="h-fit overflow-hidden">
            <div className="border-b border-border/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Specification set</span>
                <span className="font-mono text-[10px] text-muted-foreground">{docs.data?.length ?? 0}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'steering', 'requirements', 'design'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cx(
                      'rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors',
                      filter === f ? 'bg-sidebar text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    )}
                    data-testid={`filter-documents-${f}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border/60 max-h-[calc(100vh-280px)] overflow-y-auto">
              {filtered.length ? (
                filtered.map((doc: DocumentSummary) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelected(doc.id)}
                    className={cx(
                      'block w-full p-4 text-left transition hover:bg-secondary/40',
                      currentId === doc.id && 'bg-accent/40 border-l-2 border-primary'
                    )}
                    data-testid={`select-document-${doc.id}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold">{doc.title}</span>
                      <StatusPill value={doc.status} />
                    </div>
                    <div className="truncate font-mono text-[9px] text-muted-foreground">{doc.path}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">{doc.kind}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">r{doc.revision}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">No documents in this view.</div>
              )}
            </div>
          </Surface>

          {currentId ? (
            <DocumentInspector key={currentId} documentId={currentId} />
          ) : (
            <Surface className="grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary">
                  <BookOpen size={20} />
                </span>
                <h2 className="font-serif text-xl">No documents yet</h2>
                <p className="mb-0 text-sm text-muted-foreground">Documents from your workspace will appear here.</p>
              </div>
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}

function FeaturesPage() {
  const qc = useQueryClient();
  const q = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const create = useCreateFeature();
  const [open, setOpen] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name'));
    const id = String(f.get('id'));
    create.mutate(
      { data: { id, name, description: String(f.get('description') ?? '') } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setOpen(false);
        },
      }
    );
  };

  return (
    <div>
      <Heading
        eyebrow="Workspace / specifications"
        title="Features & Tasks"
        detail="A feature is a bounded unit of intent. Choose a feature below to view its Kanban board, hierarchical task breakdown, and dependency DAG."
        action={
          <Button onClick={() => setOpen((v) => !v)} data-testid="button-new-feature">
            <Plus size={15} />
            New feature
          </Button>
        }
      />

      {open && (
        <Surface className="mb-5 p-5 animate-in fade-in duration-200">
          <div className="mb-4">
            <div className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">New specification</div>
            <h2 className="mb-0 mt-1 font-serif text-xl">Define a feature</h2>
          </div>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Feature ID · lowercase-hyphenated</Label>
              <Input
                name="id"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                minLength={2}
                maxLength={64}
                placeholder="agent-session-history"
                data-testid="input-feature-id"
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="Agent session history"
                data-testid="input-feature-name"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                name="description"
                maxLength={2000}
                placeholder="The user problem, intended behavior, and constraints."
                data-testid="input-feature-description"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button type="submit" disabled={create.isPending} data-testid="button-create-feature">
                {create.isPending ? 'Creating…' : 'Create feature'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Surface>
      )}

      <MutationError error={create.error} />

      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState message="Feature specifications are unavailable." retry={() => void q.refetch()} />
      ) : q.data?.length ? (
        <div className="space-y-3">
          {q.data.map((f: Feature) => (
            <FeatureRow key={f.id} feature={f} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No feature specs yet"
          description="Start with a clear unit of user value, then split it into work an agent can claim."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={14} />
              Create your first feature
            </Button>
          }
        />
      )}
    </div>
  );
}

function FeatureRow({ feature: f }: { feature: Feature }) {
  return (
    <Link href={`/features/${f.id}`} className="group block no-underline">
      <Surface className="p-5 transition hover:-translate-y-0.5 hover:border-primary/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
              <Layers3 size={17} />
            </span>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="mb-0 truncate text-[15px] font-semibold">{f.name}</h2>
                <StatusPill value={f.status} />
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">{f.id}</div>
              <p className="mb-0 mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          </div>
          <ArrowRight
            size={17}
            className="text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary"
          />
        </div>
        <div className="ml-14 mt-4 flex flex-wrap items-center gap-4 border-t border-border/60 pt-3 font-mono text-[9px] text-muted-foreground">
          <span>{f.taskCount} tasks</span>
          <span>{f.completedTaskCount} complete</span>
          <span className="ml-auto">Created {new Date(f.createdAt).toLocaleDateString()}</span>
        </div>
      </Surface>
    </Link>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Surface className="grid min-h-[280px] place-items-center p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent text-primary">
          <Sparkles size={19} />
        </span>
        <h2 className="font-serif text-xl font-semibold">{title}</h2>
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action}
      </div>
    </Surface>
  );
}

function FeatureTasksPage() {
  const { featureId = '' } = useParams<{ featureId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const features = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const tasksQuery = useListTasks(featureId, { query: { queryKey: getListTasksQueryKey(featureId) } });

  const create = useCreateTask();
  const claim = useClaimTask();
  const submit = useSubmitTask();
  const review = useReviewTask();

  const open = useWorkflowUiStore((state) => state.taskComposerOpen);
  const setOpen = useWorkflowUiStore((state) => state.setTaskComposerOpen);

  const [activeTab, setActiveTab] = useState<'kanban' | 'list' | 'dag'>('kanban');

  useEffect(() => {
    setOpen(false);
  }, [featureId, setOpen]);

  const feature = features.data?.find((f: Feature) => f.id === featureId);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListTasksQueryKey(featureId) });
    void qc.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const createTask = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = String(fd.get('files') ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const refs = String(fd.get('refs') ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const dependsOn = String(fd.get('dependsOn') ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const parentId = String(fd.get('parentId') ?? '').trim() || null;

    create.mutate(
      {
        featureId,
        data: {
          id: String(fd.get('id')),
          groupId: String(fd.get('groupId')),
          parentId,
          title: String(fd.get('title')),
          description: String(fd.get('description') ?? ''),
          priority: String(fd.get('priority')) as 'low' | 'medium' | 'high',
          dependsOn,
          files,
          requirementsRef: refs,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setOpen(false);
        },
      }
    );
  };

  const handleClaim = (task: Task, worktree?: string, actor?: string) => {
    const wt = worktree || window.prompt('Worktree path for this agent:', task.worktree || `worktree/${task.id}`);
    if (!wt) return;
    const act = actor || window.prompt('Agent or reviewer name:', 'AI Agent');
    if (!act) return;
    claim.mutate({ featureId, taskId: task.id, data: { worktree: wt, actor: act } }, { onSuccess: refresh });
  };

  const handleSubmit = (task: Task, note?: string) => {
    const n = note || window.prompt('What changed? Include verification notes:');
    if (!n) return;
    submit.mutate({ featureId, taskId: task.id, data: { note: n } }, { onSuccess: refresh });
  };

  const handleApprove = (task: Task, note?: string) => {
    const n = note !== undefined ? note : window.prompt('Review verification note (optional):', 'Verified complete') ?? '';
    review.mutate({ featureId, taskId: task.id, data: { decision: 'approve', note: n } }, { onSuccess: refresh });
  };

  const handleReject = (task: Task, note?: string) => {
    const n = note || window.prompt('What needs to change?');
    if (!n) return;
    review.mutate({ featureId, taskId: task.id, data: { decision: 'reject', note: n } }, { onSuccess: refresh });
  };

  const taskList = tasksQuery.data ?? [];

  return (
    <div className="space-y-6">
      <button
        onClick={() => setLocation('/features')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        data-testid="link-back-features"
      >
        <ArrowLeft size={14} />
        All features
      </button>

      <Heading
        eyebrow={`Feature / ${featureId}`}
        title={feature?.name ?? featureId}
        detail={feature?.description}
        action={
          <Button onClick={() => setOpen(!open)} data-testid="button-new-task">
            <Plus size={15} />
            Add task
          </Button>
        }
      />

      {/* Task Creation Composer */}
      {open && (
        <Surface className="mb-5 p-5 animate-in fade-in duration-200">
          <h2 className="mb-4 font-serif text-xl font-semibold">Create task</h2>
          <form onSubmit={createTask} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Task ID</Label>
              <Input name="id" required maxLength={32} placeholder="build-session-index" data-testid="input-task-id" />
            </div>
            <div>
              <Label>Group ID / Phase</Label>
              <Input name="groupId" required maxLength={64} placeholder="session-history" data-testid="input-task-group" />
            </div>
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input
                name="title"
                required
                minLength={2}
                maxLength={180}
                placeholder="Persist session metadata locally"
                data-testid="input-task-title"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                name="description"
                maxLength={4000}
                placeholder="Scope, behavior, and acceptance notes"
                data-testid="input-task-description"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <select
                name="priority"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="medium"
                data-testid="select-task-priority"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <Label>Parent task ID · optional</Label>
              <Input name="parentId" placeholder="parent-task-id" data-testid="input-task-parent" />
            </div>
            <div className="sm:col-span-2">
              <Label>Depends on · one task ID per line</Label>
              <Textarea name="dependsOn" placeholder="task-id" data-testid="input-task-dependencies" />
            </div>
            <div>
              <Label>Files · one per line</Label>
              <Textarea name="files" placeholder="src/session/store.ts" data-testid="input-task-files" />
            </div>
            <div>
              <Label>Requirements references · one per line</Label>
              <Textarea name="refs" placeholder="REQ-01" data-testid="input-task-refs" />
            </div>
            <div className="sm:col-span-2 flex gap-2 pt-2">
              <Button type="submit" disabled={create.isPending} data-testid="button-create-task">
                Create task
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Surface>
      )}

      <MutationError error={create.error ?? claim.error ?? submit.error ?? review.error} />

      {tasksQuery.isLoading ? (
        <LoadingRows />
      ) : tasksQuery.isError ? (
        <ErrorState message="Task list is unavailable." retry={() => void tasksQuery.refetch()} />
      ) : taskList.length === 0 ? (
        <EmptyState
          title="No tasks in this feature"
          description="Make the first task small, specific, and verifiable. Agents can claim it when dependencies are clear."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={14} />
              Create first task
            </Button>
          }
        />
      ) : (
        /* Multi-view Switcher Tabs: Kanban, Hierarchical List, DAG Graph */
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'kanban' | 'list' | 'dag')}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
            <TabsList className="bg-muted/80 p-1">
              <TabsTrigger value="kanban" className="gap-1.5 text-xs">
                <LayoutGrid size={14} />
                Kanban Board
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5 text-xs">
                <ListOrdered size={14} />
                Hierarchical List
              </TabsTrigger>
              <TabsTrigger value="dag" className="gap-1.5 text-xs">
                <Network size={14} />
                DAG Visualizer
              </TabsTrigger>
            </TabsList>

            <div className="text-xs font-mono text-muted-foreground">
              Total Tasks: {taskList.length} • Completed:{' '}
              {taskList.filter((t: Task) => t.status === 'done').length}
            </div>
          </div>

          <TabsContent value="kanban" className="m-0 focus-visible:outline-none">
            <KanbanBoard
              tasks={taskList}
              onClaim={(t, wt, act) => handleClaim(t, wt, act)}
              onSubmitReview={(t, note) => handleSubmit(t, note)}
              onApproveDone={(t, note) => handleApprove(t, note)}
              onRequestChanges={(t, note) => handleReject(t, note)}
            />
          </TabsContent>

          <TabsContent value="list" className="m-0 focus-visible:outline-none">
            <HierarchicalTaskList
              tasks={taskList}
              onClaim={(t) => handleClaim(t)}
              onSubmitReview={(t) => handleSubmit(t)}
              onApprove={(t) => handleApprove(t)}
              onRequestChanges={(t) => handleReject(t)}
            />
          </TabsContent>

          <TabsContent value="dag" className="m-0 focus-visible:outline-none">
            <TaskDagViewer tasks={taskList} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Shell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/documents" component={DocumentsPage} />
          <Route path="/features" component={FeaturesPage} />
          <Route path="/features/:featureId" component={FeatureTasksPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
