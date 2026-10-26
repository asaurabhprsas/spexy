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
  Sliders,
  MessageSquare,
  Search,
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
import { UnsavedChangesDialog } from '@/components/inspector/UnsavedChangesDialog';
import { LiveLogsDrawer } from '@/components/logs/LiveLogsDrawer';
import { HierarchicalTaskList } from '@/components/list/HierarchicalTaskList';
import { TaskDagViewer } from '@/components/graph/TaskDagViewer';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import NotFound from '@/pages/not-found';
import { SteeringPage } from '@/pages/SteeringPage';
import { SpecificationsHub } from '@/pages/SpecificationsHub';
import { TasksPage } from '@/pages/TasksPage';
import { CommentsPage } from '@/pages/CommentsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { POPULAR_THEMES, POPULAR_FONTS } from '@/lib/themes';
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

function ThemeManager() {
  const themeId = useWorkflowUiStore((state) => state.themeId);
  const fontId = useWorkflowUiStore((state) => state.fontId);
  const colorMode = useWorkflowUiStore((state) => state.colorMode);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // 1. Resolve dark vs light
    const isDark =
      colorMode === 'dark' ||
      (colorMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // 2. Apply theme color variables
    const theme = POPULAR_THEMES.find((t) => t.id === themeId) || POPULAR_THEMES[0];
    const vars = isDark ? theme.dark : theme.light;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    // 3. Apply font families
    const font = POPULAR_FONTS.find((f) => f.id === fontId) || POPULAR_FONTS[0];
    root.style.setProperty('--app-font-sans', font.fontSans);
    root.style.setProperty('--app-font-serif', font.fontSerif);
    root.style.setProperty('--app-font-mono', font.fontMono);
  }, [themeId, fontId, colorMode]);

  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const filter = useWorkflowUiStore((state) => state.documentFilter);
  const isInspectorFullWidth = useWorkflowUiStore((state) => state.isInspectorFullWidth);
  const dashboard = useGetDashboard();

  useEffect(() => {
    const projName = dashboard.data?.projectName;
    document.title = projName ? `Spexy Dashboard - ${projName}` : 'Spexy Dashboard';
  }, [dashboard.data?.projectName]);
  const health = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 45_000 },
  });
  const { isConnected, status: wsStatus } = useWebSocketSync();
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [logsCount, setLogsCount] = useState(0);

  // Collapsible sidebar state with hover-to-expand
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('spexy_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isHovered, setIsHovered] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('spexy_sidebar_collapsed', String(next));
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
                <span className="block font-serif text-[16px] font-bold tracking-tight">spexy</span>
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
            href="/comments"
            current={location === '/comments'}
            icon={<MessageSquare size={16} />}
            label="Comments"
            badge={dashboard.data?.openCommentsCount && dashboard.data.openCommentsCount > 0 ? dashboard.data.openCommentsCount : undefined}
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/documents"
            current={location === '/documents'}
            icon={<BookOpen size={16} />}
            label="Documents"
            collapsed={!isExpandedView}
          />
          <NavItem
            href="/settings"
            current={location === '/settings'}
            icon={<Sliders size={16} />}
            label="Settings"
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
          'min-w-0 flex-1 pb-12 pt-5 transition-all duration-300',
          isSidebarCollapsed ? 'md:ml-16' : 'md:ml-[252px]',
          isInspectorFullWidth ? 'px-3 sm:px-5 md:px-6 md:pt-6' : 'px-4 sm:px-7 md:px-10 md:pt-9 xl:px-14'
        )}
      >
        <div className={cx('mx-auto transition-all duration-200', isInspectorFullWidth ? 'max-w-none w-full' : 'max-w-[1360px]')}>
          {children}
        </div>
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
  badge,
}: {
  href: string;
  current: boolean;
  icon: ReactNode;
  label: string;
  collapsed?: boolean;
  badge?: number | string;
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
      {badge !== undefined && !collapsed && (
        <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary shrink-0">
          {badge}
        </span>
      )}
      {current && !collapsed && !badge && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary md:block shrink-0" />}
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

function CompactSpecCard({
  feature: f,
  onOpenDoc,
}: {
  feature: Feature;
  onOpenDoc: (docId: string) => void;
}) {
  const [, setLocation] = useLocation();
  const total = f.taskCount || 0;
  const completed = f.completedTaskCount || 0;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/70 hover:bg-card hover:border-primary/40 transition-all">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-sm truncate">{f.name}</span>
          <span className="font-mono text-[9px] bg-muted px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground shrink-0">
            {f.id}
          </span>
          <StatusPill value={f.status} />
        </div>
        {f.description && (
          <p className="text-xs text-muted-foreground truncate mb-2 max-w-xl">
            {f.description}
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 max-w-[180px] overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {completed}/{total} tasks ({progressPercent}%)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => onOpenDoc(`${f.id}:requirements`)}
          title="Inspect Requirements"
        >
          <FileText size={12} className="text-sky-500" />
          <span>Inspect</span>
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(f.id)}`)}
          data-testid={`button-open-tasks-${f.id}`}
        >
          <ListTodo size={12} />
          <span>Tasks</span>
          <ArrowRight size={11} />
        </Button>
      </div>
    </div>
  );
}

function Dashboard() {
  const q = useGetDashboard();
  const features = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const comments = useListComments({ query: { queryKey: getListCommentsQueryKey() } });
  const [, setLocation] = useLocation();

  // Overlay state for inspecting docs from Dashboard quick links
  const [inspectingDocId, setInspectingDocId] = useState<string | null>(null);

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
  const totalTasks = tasks.done + tasks.todo + tasks.inProgress + tasks.toReview + tasks.blocked;
  const taskProgressPercent = totalTasks > 0 ? Math.round((tasks.done / totalTasks) * 100) : 0;
  const gates = d.steeringTotal ? Math.round((d.steeringApprovedCount / d.steeringTotal) * 100) : 0;

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Header */}
      <Heading
        eyebrow="Workspace / overview"
        title={d.projectName}
        detail="Context-driven workspace for specifications, tasks, and human-in-the-loop decisions."
        action={
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SYNCED</span>
            </div>
            <Button
              size="sm"
              onClick={() => setLocation('/specs')}
              className="h-8 gap-1 text-xs"
            >
              <Plus size={13} />
              <span>New Spec</span>
            </Button>
          </div>
        }
      />

      {/* Steering Status Banner */}
      {d.steeringApproved ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[.04] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCheck size={14} />
            </span>
            <span className="font-medium text-foreground">Steering Gate Approved</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              ({d.steeringApprovedCount}/{d.steeringTotal} documents signed off)
            </span>
          </div>
          <button
            onClick={() => setLocation('/steering')}
            className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline cursor-pointer"
          >
            Review context <ArrowRight size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-3.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-amber-500/15 text-amber-600">
              <ShieldCheck size={16} />
            </span>
            <div>
              <div className="font-semibold text-foreground">Steering Gate Pending Human Approval</div>
              <div className="text-[11px] text-muted-foreground">
                Foundational steering documents require human sign-off before autonomous agent execution ({d.steeringApprovedCount}/{d.steeringTotal} approved).
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation('/steering')}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="button-review-steering"
          >
            Review & Sign Off <ArrowRight size={13} />
          </Button>
        </div>
      )}

      {/* High-Signal Metrics Grid (4 Clean Cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          onClick={() => setLocation('/specs')}
          className="cursor-pointer rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Specifications</span>
            <Layers3 size={15} />
          </div>
          <div className="mt-2 font-serif text-3xl font-semibold tracking-tight">{d.featureCount}</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">Living specs in workspace</div>
        </div>

        <div
          onClick={() => setLocation('/tasks')}
          className="cursor-pointer rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Tasks Execution</span>
            <Check size={15} className="text-emerald-500" />
          </div>
          <div className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            {tasks.done}
            <span className="text-sm font-normal text-muted-foreground ml-1.5">/ {totalTasks}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${taskProgressPercent}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{taskProgressPercent}%</span>
          </div>
        </div>

        <div
          onClick={() => setLocation('/tasks')}
          className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
            d.reviewQueueCount > 0
              ? 'border-amber-500/50 bg-amber-500/[.03] hover:border-amber-500'
              : 'border-border/80 bg-card hover:border-primary/40'
          }`}
        >
          <div className={`flex items-center justify-between ${d.reviewQueueCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
            <span className="text-[10px] font-medium uppercase tracking-wider">Review Queue</span>
            <Clock3 size={15} />
          </div>
          <div className={`mt-2 font-serif text-3xl font-semibold tracking-tight ${d.reviewQueueCount > 0 ? 'text-amber-500' : ''}`}>
            {d.reviewQueueCount}
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {d.reviewQueueCount > 0 ? 'Tasks awaiting human sign-off' : 'Queue is all clear'}
          </div>
        </div>

        <div
          onClick={() => setLocation('/comments')}
          className={`cursor-pointer rounded-xl border p-4 transition-all shadow-xs ${
            d.openCommentsCount > 0
              ? 'border-indigo-500/50 bg-indigo-500/[.03] hover:border-indigo-500'
              : 'border-border/80 bg-card hover:border-primary/40'
          }`}
        >
          <div className={`flex items-center justify-between ${d.openCommentsCount > 0 ? 'text-indigo-400' : 'text-muted-foreground'}`}>
            <span className="text-[10px] font-medium uppercase tracking-wider">Active Comments</span>
            <MessageSquare size={15} />
          </div>
          <div className={`mt-2 font-serif text-3xl font-semibold tracking-tight ${d.openCommentsCount > 0 ? 'text-indigo-400' : ''}`}>
            {d.openCommentsCount}
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">Directives & feedback queue</div>
        </div>
      </div>

      {/* Task Flow Execution Pulse */}
      <Surface>
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Execution Pulse</div>
            <h2 className="mb-0 mt-0.5 text-[15px] font-semibold">Task flow breakdown</h2>
          </div>
          <button
            onClick={() => setLocation('/tasks')}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
            data-testid="link-all-features"
          >
            <span>Open tasks board</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Multi-segment continuous status bar */}
        {totalTasks > 0 && (
          <div className="px-5 pt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary flex">
              {tasks.done > 0 && (
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${(tasks.done / totalTasks) * 100}%` }}
                  title={`Done: ${tasks.done}`}
                />
              )}
              {tasks.toReview > 0 && (
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${(tasks.toReview / totalTasks) * 100}%` }}
                  title={`To review: ${tasks.toReview}`}
                />
              )}
              {tasks.inProgress > 0 && (
                <div
                  className="bg-sky-500 h-full transition-all"
                  style={{ width: `${(tasks.inProgress / totalTasks) * 100}%` }}
                  title={`In progress: ${tasks.inProgress}`}
                />
              )}
              {tasks.todo > 0 && (
                <div
                  className="bg-slate-400/60 h-full transition-all"
                  style={{ width: `${(tasks.todo / totalTasks) * 100}%` }}
                  title={`To do: ${tasks.todo}`}
                />
              )}
              {tasks.blocked > 0 && (
                <div
                  className="bg-rose-500 h-full transition-all"
                  style={{ width: `${(tasks.blocked / totalTasks) * 100}%` }}
                  title={`Blocked: ${tasks.blocked}`}
                />
              )}
            </div>
          </div>
        )}

        {/* Status count cards */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border/70 sm:grid-cols-5 sm:divide-y-0">
          {[
            ['To do', tasks.todo, 'todo', 'bg-slate-400'],
            ['In progress', tasks.inProgress, 'in-progress', 'bg-sky-500'],
            ['For review', tasks.toReview, 'to-review', 'bg-amber-500'],
            ['Done', tasks.done, 'done', 'bg-emerald-500'],
            ['Blocked', tasks.blocked, 'blocked', 'bg-rose-500'],
          ].map(([name, val, key, dotColor]) => (
            <div
              key={key}
              onClick={() => setLocation('/tasks')}
              className="px-4 py-4 cursor-pointer hover:bg-muted/15 transition-colors"
            >
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className={`size-1.5 rounded-full ${dotColor}`} />
                <span>{name}</span>
              </div>
              <div className="font-serif text-2xl font-semibold tracking-tight">{val}</div>
            </div>
          ))}
        </div>
      </Surface>

      {/* Specifications & Recent Context (2 Columns) */}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        {/* Left: Active Specifications Overview */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/80 pb-2.5">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">
                Living Specifications
              </div>
              <h2 className="mb-0 mt-0.5 text-[16px] font-semibold">Active feature specs</h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocation('/specs')}
              className="text-xs text-primary gap-1 h-7"
            >
              <span>Manage all</span>
              <ArrowRight size={12} />
            </Button>
          </div>

          {features.isLoading ? (
            <LoadingRows />
          ) : (features.data ?? []).length === 0 ? (
            <Surface className="p-8 text-center">
              <Layers3 className="size-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <h3 className="text-sm font-semibold">No specifications created yet</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Add your first feature specification to generate requirements, design, and executable tasks.
              </p>
              <Button size="sm" onClick={() => setLocation('/specs')}>
                Create specification
              </Button>
            </Surface>
          ) : (
            <div className="space-y-2.5">
              {features.data?.map((f: Feature) => (
                <CompactSpecCard
                  key={f.id}
                  feature={f}
                  onOpenDoc={(docId) => setInspectingDocId(docId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Recent Context (Activity & Feedback) */}
        <div className="space-y-4">
          {/* Recent Activity Card */}
          <Surface>
            <div className="border-b border-border/70 px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Audit Log</div>
              <h2 className="mb-0 mt-0.5 text-[14px] font-semibold">Recent activity</h2>
            </div>
            <div className="divide-y divide-border/60">
              {d.recentActivity.length ? (
                d.recentActivity.slice(0, 4).map((a: ActivityData) => (
                  <div key={a.id} className="flex gap-2.5 px-4 py-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-primary">
                      <Activity size={11} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-[12px] leading-relaxed line-clamp-2">{a.summary}</p>
                      <time className="font-mono text-[9px] text-muted-foreground">{dateLabel(a.createdAt)}</time>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Activity will appear here as work moves.
                </div>
              )}
            </div>
          </Surface>

          {/* Pending Directives / Comments Quick Card */}
          <Surface>
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Review Directives</div>
                <h2 className="mb-0 mt-0.5 text-[14px] font-semibold">Active comments</h2>
              </div>
              <button
                onClick={() => setLocation('/comments')}
                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight size={11} />
              </button>
            </div>
            <div className="divide-y divide-border/60">
              {(comments.data || []).length ? (
                (comments.data as any[]).slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setLocation('/comments')}
                    className="p-3.5 hover:bg-muted/15 transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[160px]">
                        {c.target_file || c.documentId || 'general'}
                      </span>
                      <span className="text-[10px] text-amber-500 font-medium">Pending</span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 mb-0">
                      {c.instruction}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No active comments. Workspace context is clean.
                </div>
              )}
            </div>
          </Surface>
        </div>
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

  const isDocumentDirty = useWorkflowUiStore((state) => state.isDocumentDirty);
  const setIsDocumentDirty = useWorkflowUiStore((state) => state.setIsDocumentDirty);

  // Search & Spec filters
  const [search, setSearch] = useState('');
  const [selectedSpec, setSelectedSpec] = useState<string>('all');

  // Unsaved changes protection
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const confirmDiscard = (action: () => void) => {
    if (isDocumentDirty) {
      setPendingAction(() => action);
      setShowDiscardDialog(true);
    } else {
      action();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    setIsDocumentDirty(false);
    if (pendingAction) {
      const act = pendingAction;
      setPendingAction(null);
      act();
    }
  };

  // Sync URL search parameters with active document filter
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const filterParam = searchParams.get('filter');
    const specParam = searchParams.get('spec');
    if (filterParam === 'steering') {
      setFilter('steering');
    } else if (filterParam === 'specifications') {
      setFilter('specifications');
    } else if (filterParam && ['all', 'steering', 'specifications', 'requirements', 'design'].includes(filterParam)) {
      setFilter(filterParam as any);
    }
    if (specParam) {
      setSelectedSpec(specParam);
    }
  }, [setFilter]);

  const filtered = useMemo(() => {
    return (docs.data ?? []).filter((d: DocumentSummary) => {
      const isSteering = d.kind === 'steering' || d.path.includes('/steering/');
      const isSpec = Boolean(d.featureId) || (d.kind as string) === 'specifications' || d.path.includes('/specs/') || d.path.includes('/features/');

      // Category / Type filter
      if (filter === 'steering' && !isSteering) return false;
      if (filter === 'specifications' && !isSpec) return false;
      if (filter === 'requirements' && d.kind !== 'requirements') return false;
      if (filter === 'design' && d.kind !== 'design') return false;

      // Specific Spec filter
      if (selectedSpec !== 'all') {
        const docSpecId = d.featureId || (d.id.includes(':') ? d.id.split(':')[0] : null);
        if (docSpecId !== selectedSpec && !d.path.includes(`/specs/${selectedSpec}/`)) {
          return false;
        }
      }

      // Search text filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const searchable = [
          d.title,
          d.path,
          d.id,
          d.kind,
          d.featureId,
          d.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(q)) return false;
      }

      return true;
    });
  }, [docs.data, filter, selectedSpec, search]);

  // When Specifications filter is active, group documents by spec (feature)
  const groupedSpecs = useMemo(() => {
    if (filter !== 'specifications' && selectedSpec === 'all') return null;
    const groups: Record<string, { title: string; docs: DocumentSummary[] }> = {};

    for (const doc of filtered) {
      const featId = doc.featureId || (doc.id.includes(':') ? doc.id.split(':')[0] : 'general');
      const featureObj = featuresList.find((f: Feature) => f.id === featId);
      const groupTitle = featureObj?.name || (featId === 'general' ? 'General Specifications' : featId);

      if (!groups[featId]) {
        groups[featId] = { title: groupTitle, docs: [] };
      }
      groups[featId].docs.push(doc);
    }
    return groups;
  }, [filter, selectedSpec, filtered, featuresList]);

  const currentId = selected && filtered.some((d: DocumentSummary) => d.id === selected) ? selected : filtered[0]?.id;

  const filterTabs = [
    { id: 'all' as const, label: 'All' },
    { id: 'steering' as const, label: 'Steering' },
    { id: 'specifications' as const, label: 'Specs' },
  ];

  const subTypeTabs = [
    { id: 'all' as const, label: 'All types' },
    { id: 'requirements' as const, label: 'Reqs' },
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
        <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
          <Surface className="h-fit overflow-hidden">
            <div className="border-b border-border/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground">Specification set</span>
                <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} / {docs.data?.length ?? 0}</span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search titles, paths, specs..."
                  className="h-8 pl-7 pr-7 text-xs font-mono"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Scope Tabs: All / Steering / Specs */}
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
                {filterTabs.map(({ id: f, label }) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      if (filter === f) return;
                      confirmDiscard(() => setFilter(f));
                    }}
                    className={cx(
                      'flex-1 py-1 text-center font-mono text-[10px] uppercase tracking-wider rounded-md transition-colors font-medium',
                      filter === f || (f === 'specifications' && ['requirements', 'design', 'tasks'].includes(filter))
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    data-testid={`filter-documents-${f}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Spec Dropdown (Available when viewing Specs or All) */}
              {featuresList.length > 0 && filter !== 'steering' && (
                <div>
                  <select
                    value={selectedSpec}
                    onChange={(e) => {
                      const val = e.target.value;
                      confirmDiscard(() => setSelectedSpec(val));
                    }}
                    className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">All Specifications ({featuresList.length})</option>
                    {featuresList.map((feat: Feature) => (
                      <option key={feat.id} value={feat.id}>
                        {feat.name} ({feat.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sub-type filter pills (Reqs, Design, Tasks) */}
              {filter !== 'steering' && (
                <div className="flex flex-wrap gap-1">
                  {subTypeTabs.map(({ id: k, label }) => {
                    const isSubActive =
                      filter === k || (k === 'all' && ['all', 'specifications'].includes(filter));
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (isSubActive) return;
                          confirmDiscard(() => setFilter(k));
                        }}
                        className={cx(
                          'rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors',
                          isSubActive
                            ? 'bg-muted text-foreground font-semibold border border-border/80'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Filter Reset */}
              {(search || filter !== 'all' || selectedSpec !== 'all') && (
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                  <span>Filtered ({filtered.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedSpec('all');
                      setFilter('all');
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>

            <div className="divide-y divide-border/60 max-h-[calc(100vh-340px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground space-y-2">
                  <p>No documents matching your filters.</p>
                  {(search || filter !== 'all' || selectedSpec !== 'all') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSearch('');
                        setSelectedSpec('all');
                        setFilter('all');
                      }}
                    >
                      Reset all filters
                    </Button>
                  )}
                </div>
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
                        onClick={() => {
                          if (currentId === doc.id) return;
                          confirmDiscard(() => setSelected(doc.id));
                        }}
                        className={cx(
                          'block w-full p-3 text-left transition rounded-lg border cursor-pointer',
                          currentId === doc.id
                            ? 'bg-primary/10 border-primary/50 text-foreground ring-1 ring-primary/20 shadow-xs font-medium'
                            : 'border-transparent hover:bg-secondary/40 text-muted-foreground hover:text-foreground'
                        )}
                        data-testid={`select-document-${doc.id}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className={cx('truncate text-xs font-semibold', currentId === doc.id ? 'text-primary font-bold' : 'text-foreground')}>{doc.title}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {currentId === doc.id && (
                              <Badge className="font-mono text-[9px] uppercase tracking-wider h-4 px-1.5 bg-primary text-primary-foreground">
                                Active
                              </Badge>
                            )}
                            <StatusPill value={doc.status} />
                          </div>
                        </div>
                        <div className="truncate font-mono text-[9px] text-muted-foreground">{doc.path}</div>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                filtered.map((doc: DocumentSummary) => {
                  const isSelected = currentId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => {
                        if (isSelected) return;
                        confirmDiscard(() => setSelected(doc.id));
                      }}
                      className={cx(
                        'block w-full p-3.5 text-left rounded-lg transition border cursor-pointer',
                        isSelected
                          ? 'bg-primary/10 border-primary/50 text-foreground ring-1 ring-primary/20 shadow-xs font-medium'
                          : 'border-transparent hover:bg-secondary/40 text-muted-foreground hover:text-foreground'
                      )}
                      data-testid={`select-document-${doc.id}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={cx('truncate text-[13px] font-semibold', isSelected ? 'text-primary font-bold' : 'text-foreground')}>{doc.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSelected && (
                            <Badge className="font-mono text-[9px] uppercase tracking-wider h-4 px-1.5 bg-primary text-primary-foreground">
                              Active
                            </Badge>
                          )}
                          <StatusPill value={doc.status} />
                        </div>
                      </div>
                    <div className="truncate font-mono text-[9px] text-muted-foreground">{doc.path}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">{doc.kind}</span>
                      <span className="font-mono text-[9px] text-muted-foreground">r{doc.revision}</span>
                    </div>
                    </button>
                  );
                })
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

      <UnsavedChangesDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onConfirmDiscard={handleConfirmDiscard}
        onKeepEditing={() => {
          setShowDiscardDialog(false);
          setPendingAction(null);
        }}
      />
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
          <Route path="/comments" component={CommentsPage} />
          <Route path="/documents" component={DocumentsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function App() {
  const updatePreferences = useWorkflowUiStore((state) => state.updatePreferences);

  useEffect(() => {
    const currentTarget = useWorkflowUiStore.getState().storageTarget;
    // By default, stay purely in browser localStorage; only fetch from repo if storageTarget is explicitly 'repo'
    if (currentTarget !== 'repo') return;

    fetch('/api/preferences')
      .then((r) => r.json())
      .then((data) => {
        const prefs = data?.preferences ?? data;
        if (prefs && typeof prefs === 'object' && Object.keys(prefs).length > 0) {
          updatePreferences(prefs, { skipBackendSync: true });
        }
      })
      .catch(() => {});
  }, [updatePreferences]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeManager />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
