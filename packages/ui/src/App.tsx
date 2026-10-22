import { useEffect, useState, useMemo, type FormEvent, type ReactNode } from 'react';
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
  Layers,
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
  FileCode,
  Image as ImageIcon,
  Paperclip,
  Eye,
  X,
  FileCheck2,
  PanelLeftClose,
  PanelLeftOpen,
  Compass,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useWorkflowUiStore } from '@/store/ui';
import { useWebSocketSync } from '@/hooks/useWebSocketSync';
import { DocumentInspector } from '@/components/inspector/DocumentInspector';
import { LiveLogsDrawer } from '@/components/logs/LiveLogsDrawer';
import { HierarchicalTaskList } from '@/components/list/HierarchicalTaskList';
import { TaskDagViewer } from '@/components/graph/TaskDagViewer';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import NotFound from '@/pages/not-found';
import { SteeringPage } from '@/pages/SteeringPage';
import { SpecificationsHub } from '@/pages/SpecificationsHub';
import { TasksPage } from '@/pages/TasksPage';
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
  const filter = useWorkflowUiStore((state) => state.documentFilter);
  const dashboard = useGetDashboard();
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 45_000 },
  });
  const { isConnected, status: wsStatus } = useWebSocketSync();
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [logsCount, setLogsCount] = useState(0);

  // Collapsible sidebar state with hover-to-expand
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('specflow_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isHovered, setIsHovered] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('specflow_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const project = dashboard.data?.projectName ?? 'Workspace';
  const isExpandedView = !isSidebarCollapsed || isHovered;

  return (
    <div className="min-h-[100dvh] md:flex bg-background text-foreground">
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cx(
          'bg-sidebar text-sidebar-foreground md:fixed md:inset-y-0 md:flex md:flex-col border-r border-sidebar-border transition-all duration-300 ease-in-out',
          isSidebarCollapsed
            ? isHovered
              ? 'md:w-64 z-40 shadow-2xl'
              : 'md:w-16 z-30'
            : 'md:w-[252px] z-30'
        )}
      >
        <div className="flex items-center justify-between px-3 py-4 md:px-4 md:pt-5">
          <Link href="/" className="group flex items-center gap-3 text-sidebar-foreground no-underline min-w-0">
            <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[.07] text-primary shrink-0">
              <TerminalSquare size={18} />
            </span>
            {isExpandedView && (
              <span className="truncate animate-in fade-in duration-200">
                <span className="block font-serif text-[16px] font-bold tracking-tight">spec-flow</span>
                <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[.19em] text-white/45">
                  human × agent
                </span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden md:grid size-7 place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-auto shrink-0"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        {/* Live Status and Logs Button in Header */}
        {isExpandedView ? (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] text-white/60 inline-flex items-center gap-1.5">
              {isConnected ? (
                <Wifi size={10} className="text-emerald-400" />
              ) : (
                <WifiOff size={10} className="text-rose-400" />
              )}
              {isConnected ? 'live ws' : wsStatus}
            </span>

            {/* Live Logs Trigger Button (Toggle) */}
            <button
              type="button"
              onClick={() => setIsLogsDrawerOpen((prev) => !prev)}
              className="rounded-full border border-white/15 bg-white/[.08] hover:bg-white/[.15] px-2 py-0.5 font-mono text-[9px] text-white/90 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Toggle Live Activity Logs"
            >
              <span className="relative flex size-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500"></span>
              </span>
              <span>Live Logs</span>
              {logsCount > 0 && (
                <span className="bg-primary/30 text-white px-1.5 rounded-full text-[8px] font-bold">
                  {logsCount}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="hidden md:flex flex-col items-center gap-2 py-2 border-b border-white/5">
            <button
              type="button"
              onClick={() => setIsLogsDrawerOpen((prev) => !prev)}
              className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/[.08] hover:bg-white/[.15] text-white transition-colors cursor-pointer relative"
              title="Toggle Live Activity Logs"
            >
              <TerminalSquare size={13} className="text-primary" />
              <span className="absolute -top-0.5 -right-0.5 flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
              </span>
            </button>
          </div>
        )}

        {isExpandedView && (
          <div className="hidden px-4 py-3 md:block">
            <div className="mb-1 font-mono text-[8px] uppercase tracking-[.18em] text-white/40">Current workspace</div>
            <div className="truncate text-[12px] font-semibold text-white/90">{project}</div>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-2 md:py-2">
          <NavItem
            href="/"
            current={location === '/' || location === '/dashboard'}
            icon={<Layers3 size={16} />}
            label="Dashboard"
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/steering"
            current={location === '/steering'}
            icon={<Compass size={16} />}
            label="Steering"
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/specs"
            current={location === '/specs' || (location.startsWith('/features') && !location.startsWith('/features/'))}
            icon={<Layers size={16} />}
            label="Specifications"
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/tasks"
            current={location.startsWith('/tasks') || location.startsWith('/features/')}
            icon={<LayoutGrid size={16} />}
            label="Tasks"
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/documents"
            current={location === '/documents'}
            icon={<BookOpen size={16} />}
            label="Documents"
            collapsed={!isExpandedView}
          />

          <button
            type="button"
            onClick={() => setIsLogsDrawerOpen((prev) => !prev)}
            title={!isExpandedView ? 'Live Activity' : undefined}
            className={cx(
              'flex min-w-fit items-center rounded-lg text-[13px] font-medium text-white/60 hover:bg-white/[.06] hover:text-white/90 transition-colors md:w-full cursor-pointer',
              !isExpandedView ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <Activity size={16} className="text-emerald-400 shrink-0" />
            {isExpandedView && <span>Live Activity</span>}
            {isExpandedView && (
              <span className="ml-auto inline-flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </nav>

        <div className="hidden flex-1 md:block" />

        {isExpandedView && (
          <div className="hidden border-t border-white/10 p-4 md:block animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-[11px] text-white/55">
              <ShieldCheck size={14} className="text-primary" />
              Your specs stay local-first
            </div>
            <p className="mb-0 mt-2 text-[10px] leading-relaxed text-white/35">
              Approved context is the source of truth for every agent run.
            </p>
          </div>
        )}
      </aside>

      <main
        className={cx(
          'min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 md:px-10 md:pt-9 xl:px-14 transition-all duration-300',
          isSidebarCollapsed ? 'md:ml-16' : 'md:ml-[252px]'
        )}
      >
        <div className="mx-auto max-w-[1360px]">{children}</div>
      </main>

      {/* Live Activity Logs Drawer */}
      <LiveLogsDrawer
        open={isLogsDrawerOpen}
        onClose={() => setIsLogsDrawerOpen(false)}
        onLogsCountChange={setLogsCount}
      />
    </div>
  );
}

function NavItem({
  href,
  current,
  icon,
  label,
  collapsed = false,
}: {
  href: string;
  current: boolean;
  icon: ReactNode;
  label: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid={`link-${label.toLowerCase()}`}
      title={collapsed ? label : undefined}
      className={cx(
        'flex min-w-fit items-center rounded-lg text-[13px] font-medium no-underline transition-colors md:w-full',
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
        current ? 'bg-white/[.11] text-white' : 'text-white/60 hover:bg-white/[.06] hover:text-white/90'
      )}
    >
      <span className={current ? 'text-primary' : ''}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {current && !collapsed && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary md:block shrink-0" />}
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

interface AuxFile {
  name: string;
  path: string;
  kind: 'reference' | 'image' | 'core' | 'other';
  size: number;
  ext: string;
}

function SpecAuxiliaryFiles({
  specId,
  onPreview,
}: {
  specId: string;
  onPreview: (file: AuxFile) => void;
}) {
  const [files, setFiles] = useState<AuxFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/specs/${encodeURIComponent(specId)}/files`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          // Exclude core docs from auxiliary list
          setFiles(data.filter((f: AuxFile) => f.kind !== 'core'));
        }
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specId]);

  const references = files.filter((f) => f.kind === 'reference');
  const images = files.filter((f) => f.kind === 'image');

  if (isLoading) {
    return (
      <div className="py-2 text-[11px] text-muted-foreground font-mono animate-pulse">
        Checking for auxiliary assets…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-3 text-center">
        <p className="text-[11px] text-muted-foreground mb-0">
          No auxiliary files found in <code>specs/{specId}/references/</code> or <code>images/</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {references.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Paperclip size={11} />
            References & Research ({references.length})
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {references.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => onPreview(f)}
                className="flex items-center justify-between p-2 rounded-md bg-secondary/50 hover:bg-secondary border border-border/50 text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="text-primary shrink-0" />
                  <span className="text-xs truncate font-medium group-hover:text-primary transition-colors">
                    {f.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                  {Math.round(f.size / 1024)} KB
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <ImageIcon size={11} />
            Visuals & Diagrams ({images.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {images.map((img) => (
              <button
                key={img.path}
                type="button"
                onClick={() => onPreview(img)}
                className="group relative flex flex-col items-center justify-center p-2 rounded-lg border border-border/70 bg-card/60 hover:border-primary/50 transition-all text-center cursor-pointer overflow-hidden"
              >
                <div className="size-16 rounded bg-muted/40 flex items-center justify-center mb-1.5 overflow-hidden">
                  <img
                    src={`/${img.path}`}
                    alt={img.name}
                    className="size-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                  <ImageIcon size={20} className="text-muted-foreground/60" />
                </div>
                <span className="text-[11px] truncate w-full font-mono text-muted-foreground group-hover:text-foreground">
                  {img.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSpecCard({
  feature: f,
  onOpenDoc,
  onPreviewAuxFile,
}: {
  feature: Feature;
  onOpenDoc: (docId: string) => void;
  onPreviewAuxFile: (file: AuxFile) => void;
}) {
  const [, setLocation] = useLocation();
  const total = f.taskCount || 0;
  const completed = f.completedTaskCount || 0;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Surface className="p-5 sm:p-6 space-y-5 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-serif text-lg font-semibold tracking-tight mb-0">{f.name}</h3>
            <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded border border-border/60 text-muted-foreground">
              {f.id}
            </span>
            <StatusPill value={f.status} />
          </div>
          {f.description && (
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed mb-0">
              {f.description}
            </p>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(f.id)}`)}
          className="gap-1.5"
          data-testid={`button-open-tasks-${f.id}`}
        >
          <ListTodo size={14} />
          Open Tasks Board
          <ArrowRight size={13} />
        </Button>
      </div>

      {/* Task Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
            Execution Progress
          </span>
          <span className="font-mono text-[11px] font-semibold">
            {completed} / {total} tasks ({progressPercent}%)
          </span>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Core Specification Documents Quick Links */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileCheck2 size={12} className="text-primary" />
          Core Specification Documents (Click to Inspect)
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenDoc(`${f.id}:requirements`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 text-xs font-mono transition-colors group cursor-pointer"
            title="Open requirements.md in Document Inspector"
          >
            <FileText size={13} className="text-sky-500" />
            <span>requirements.md</span>
            <Eye size={12} className="text-muted-foreground group-hover:text-foreground opacity-60 group-hover:opacity-100" />
          </button>

          <button
            type="button"
            onClick={() => onOpenDoc(`${f.id}:design`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 text-xs font-mono transition-colors group cursor-pointer"
            title="Open design.md in Document Inspector"
          >
            <BookOpen size={13} className="text-purple-500" />
            <span>design.md</span>
            <Eye size={12} className="text-muted-foreground group-hover:text-foreground opacity-60 group-hover:opacity-100" />
          </button>

          <button
            type="button"
            onClick={() => onOpenDoc(`${f.id}:tasks`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 text-xs font-mono transition-colors group cursor-pointer"
            title="Open tasks.yaml in Document Inspector"
          >
            <FileCode size={13} className="text-emerald-500" />
            <span>tasks.yaml</span>
            <Eye size={12} className="text-muted-foreground group-hover:text-foreground opacity-60 group-hover:opacity-100" />
          </button>
        </div>
      </div>

      {/* Auxiliary Files & References */}
      <div className="border-t border-border/60 pt-4">
        <SpecAuxiliaryFiles specId={f.id} onPreview={onPreviewAuxFile} />
      </div>
    </Surface>
  );
}

function Dashboard() {
  const q = useGetDashboard();
  const features = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const comments = useListComments({ query: { queryKey: getListCommentsQueryKey() } });
  const [, setLocation] = useLocation();

  // Overlay states for inspecting docs or previewing auxiliary files from Dashboard
  const [inspectingDocId, setInspectingDocId] = useState<string | null>(null);
  const [previewAuxFile, setPreviewAuxFile] = useState<AuxFile | null>(null);

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
              onClick={() => setLocation('/tasks')}
              className="text-xs font-semibold text-primary cursor-pointer"
              data-testid="link-all-features"
            >
              View tasks <ArrowRight size={13} className="ml-1 inline" />
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

      {/* Dedicated Specifications & Features Section */}
      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">
              Living Specifications
            </div>
            <h2 className="mb-0 mt-1 font-serif text-2xl font-semibold tracking-tight">
              Specifications & Features
            </h2>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation('/specs')}
            variant="outline"
            className="gap-1.5"
          >
            <Layers3 size={14} />
            Manage all specs
          </Button>
        </div>

        {features.isLoading ? (
          <LoadingRows />
        ) : (features.data ?? []).length === 0 ? (
          <Surface className="p-8 text-center">
            <Layers3 className="size-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <h3 className="text-sm font-semibold">No specifications created yet</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Add your first feature specification to generate requirements, design, and executable tasks.
            </p>
            <Button size="sm" onClick={() => setLocation('/specs')}>
              Create specification
            </Button>
          </Surface>
        ) : (
          <div className="grid gap-5">
            {features.data?.map((f: Feature) => (
              <DashboardSpecCard
                key={f.id}
                feature={f}
                onOpenDoc={(docId) => setInspectingDocId(docId)}
                onPreviewAuxFile={(file) => setPreviewAuxFile(file)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => setLocation('/specs')}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card/75 p-4 text-left transition hover:border-primary/40 cursor-pointer"
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

      {/* Modal Inspector Overlay for Dashboard quick links */}
      {inspectingDocId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-6xl h-[90vh]">
            <DocumentInspector
              documentId={inspectingDocId}
              onClose={() => setInspectingDocId(null)}
            />
          </div>
        </div>
      )}

      {/* Auxiliary File Preview Modal */}
      {previewAuxFile && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewAuxFile(null)}
        >
          <div
            className="w-full max-w-2xl bg-card border border-border rounded-xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center gap-2">
                {previewAuxFile.kind === 'image' ? (
                  <ImageIcon size={16} className="text-primary" />
                ) : (
                  <FileText size={16} className="text-primary" />
                )}
                <span className="font-semibold text-sm">{previewAuxFile.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({Math.round(previewAuxFile.size / 1024)} KB)
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPreviewAuxFile(null)} className="h-7 w-7 p-0">
                <X size={15} />
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-auto flex items-center justify-center bg-muted/20 rounded-lg p-3">
              {previewAuxFile.kind === 'image' ? (
                <img
                  src={`/${previewAuxFile.path}`}
                  alt={previewAuxFile.name}
                  className="max-h-[55vh] object-contain rounded"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-xs font-mono space-y-2 text-left w-full p-2">
                  <p className="text-muted-foreground">File Path: {previewAuxFile.path}</p>
                  <p className="text-muted-foreground">Category: {previewAuxFile.kind} ({previewAuxFile.ext})</p>
                  <p className="text-xs text-foreground/80">
                    This auxiliary reference file is linked to the specification workspace.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button size="sm" variant="outline" onClick={() => setPreviewAuxFile(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
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
  const [location] = useLocation();
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const featuresQuery = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const featuresList = featuresQuery.data ?? [];

  const selected = useWorkflowUiStore((state) => state.selectedDocumentId);
  const setSelected = useWorkflowUiStore((state) => state.setSelectedDocumentId);
  const filter = useWorkflowUiStore((state) => state.documentFilter);
  const setFilter = useWorkflowUiStore((state) => state.setDocumentFilter);

  // Sync URL search parameters with active document filter
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const filterParam = searchParams.get('filter');
    if (filterParam === 'steering') {
      setFilter('steering');
    } else if (filterParam === 'specifications') {
      setFilter('specifications');
    } else if (filterParam && ['all', 'steering', 'specifications', 'requirements', 'design'].includes(filterParam)) {
      setFilter(filterParam as any);
    }
  }, [setFilter]);

  const filtered = (docs.data ?? []).filter((d: DocumentSummary) => {
    if (filter === 'all') return true;
    if (filter === 'steering') return d.kind === 'steering' || d.path.includes('/steering/');
    if (filter === 'specifications') {
      return Boolean(d.featureId) || (d.kind as string) === 'specifications' || d.path.includes('/specs/') || d.path.includes('/features/');
    }
    if (filter === 'requirements') return d.kind === 'requirements';
    if (filter === 'design') return d.kind === 'design';
    return true;
  });

  // When Specifications filter is active, group documents by spec (feature)
  const groupedSpecs = useMemo(() => {
    if (filter !== 'specifications') return null;
    const groups: Record<string, { title: string; docs: DocumentSummary[] }> = {};

    for (const doc of filtered) {
      const featId = doc.featureId || 'general';
      const featureObj = featuresList.find((f: Feature) => f.id === featId);
      const groupTitle = featureObj?.name || (featId === 'general' ? 'General Specifications' : featId);

      if (!groups[featId]) {
        groups[featId] = { title: groupTitle, docs: [] };
      }
      groups[featId].docs.push(doc);
    }
    return groups;
  }, [filter, filtered, featuresList]);

  const currentId = selected && filtered.some((d: DocumentSummary) => d.id === selected) ? selected : filtered[0]?.id;

  const filterTabs = [
    { id: 'all' as const, label: 'All' },
    { id: 'steering' as const, label: 'Steering' },
    { id: 'specifications' as const, label: 'Specifications' },
    { id: 'requirements' as const, label: 'Requirements' },
    { id: 'design' as const, label: 'Design' },
  ];

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
        <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
          <Surface className="h-fit overflow-hidden">
            <div className="border-b border-border/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Specification set</span>
                <span className="font-mono text-[10px] text-muted-foreground">{docs.data?.length ?? 0}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filterTabs.map(({ id: f, label }) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cx(
                      'rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors',
                      filter === f ? 'bg-sidebar text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    )}
                    data-testid={`filter-documents-${f}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border/60 max-h-[calc(100vh-280px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">No documents in this view.</div>
              ) : groupedSpecs ? (
                Object.entries(groupedSpecs).map(([groupId, group]) => (
                  <div key={groupId} className="p-2 space-y-1">
                    <div className="px-2.5 py-1.5 font-serif text-xs font-semibold text-primary bg-muted/30 rounded flex items-center justify-between">
                      <span className="truncate">{group.title}</span>
                      <Badge variant="secondary" className="font-mono text-[9px] h-4">
                        {group.docs.length}
                      </Badge>
                    </div>
                    {group.docs.map((doc: DocumentSummary) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelected(doc.id)}
                        className={cx(
                          'block w-full p-3 text-left transition rounded-lg hover:bg-secondary/40',
                          currentId === doc.id && 'bg-accent/40 border-l-2 border-primary font-medium'
                        )}
                        data-testid={`select-document-${doc.id}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{doc.title}</span>
                          <StatusPill value={doc.status} />
                        </div>
                        <div className="truncate font-mono text-[9px] text-muted-foreground">{doc.path}</div>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
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

function FeatureTasksRedirect() {
  const { featureId = '' } = useParams<{ featureId: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (featureId) {
      setLocation(`/tasks?spec=${encodeURIComponent(featureId)}`);
    } else {
      setLocation('/tasks');
    }
  }, [featureId, setLocation]);

  return <LoadingRows />;
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
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/steering" component={SteeringPage} />
          <Route path="/specs" component={SpecificationsHub} />
          <Route path="/features" component={SpecificationsHub} />
          <Route path="/features/:featureId" component={FeatureTasksRedirect} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/documents" component={DocumentsPage} />
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
