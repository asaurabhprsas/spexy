import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  useListFeatures,
  getListFeaturesQueryKey,
  useListTasks,
  getListTasksQueryKey,
  useCreateTask,
  useClaimTask,
  useSubmitTask,
  useReviewTask,
  getGetDashboardQueryKey,
  type Feature,
  type Task,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  Plus,
  LayoutGrid,
  ListOrdered,
  Network,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { HierarchicalTaskList } from '@/components/list/HierarchicalTaskList';
import { TaskDagViewer } from '@/components/graph/TaskDagViewer';
import { TaskComposerSheet, type CreateTaskFormData } from '@/components/task/TaskComposerSheet';

export function TasksPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const featuresQuery = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const featuresList = featuresQuery.data ?? [];

  // Parse URL search param `?spec=<spec-id>`
  const searchParams = new URLSearchParams(window.location.search);
  const specParam = searchParams.get('spec');

  const selectedSpecId = useMemo(() => {
    if (specParam && featuresList.some((f: Feature) => f.id === specParam)) {
      return specParam;
    }
    return featuresList[0]?.id || '';
  }, [specParam, featuresList]);

  const selectedFeature = useMemo(() => {
    return featuresList.find((f: Feature) => f.id === selectedSpecId);
  }, [featuresList, selectedSpecId]);

  const tasksQuery = useListTasks(selectedSpecId, {
    query: {
      queryKey: getListTasksQueryKey(selectedSpecId),
      enabled: Boolean(selectedSpecId),
    },
  });

  const [activeTab, setActiveTab] = useState<'kanban' | 'list' | 'dag'>('kanban');
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const createTask = useCreateTask();
  const claimTask = useClaimTask();
  const submitTask = useSubmitTask();
  const reviewTask = useReviewTask();

  const refresh = () => {
    if (selectedSpecId) {
      void qc.invalidateQueries({ queryKey: getListTasksQueryKey(selectedSpecId) });
    }
    void qc.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const handleCreateTask = (formData: CreateTaskFormData) => {
    if (!selectedSpecId) return;

    createTask.mutate(
      {
        featureId: selectedSpecId,
        data: {
          id: formData.id,
          groupId: formData.groupId,
          parentId: formData.parentId || null,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          dependsOn: formData.dependsOn,
          files: formData.files,
          requirementsRef: formData.requirementsRef,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setIsComposerOpen(false);
        },
      }
    );
  };

  // Instant actions without intrusive window.prompt!
  const handleClaim = (task: Task, worktree?: string, actor?: string) => {
    if (!selectedSpecId) return;
    const wt = worktree || task.worktree || `worktree/${task.id}`;
    const act = actor || 'human';
    claimTask.mutate(
      { featureId: selectedSpecId, taskId: task.id, data: { worktree: wt, actor: act } },
      { onSuccess: refresh }
    );
  };

  const handleSubmit = (task: Task, note?: string) => {
    if (!selectedSpecId) return;
    const n = note || 'Submitted for review';
    submitTask.mutate(
      { featureId: selectedSpecId, taskId: task.id, data: { note: n } },
      { onSuccess: refresh }
    );
  };

  const handleApprove = (task: Task, note?: string) => {
    if (!selectedSpecId) return;
    const n = note || 'Verified and approved';
    reviewTask.mutate(
      { featureId: selectedSpecId, taskId: task.id, data: { decision: 'approve', note: n } },
      { onSuccess: refresh }
    );
  };

  const handleReject = (task: Task, note?: string) => {
    if (!selectedSpecId) return;
    const n = note || 'Changes requested';
    reviewTask.mutate(
      { featureId: selectedSpecId, taskId: task.id, data: { decision: 'reject', note: n } },
      { onSuccess: refresh }
    );
  };

  const rawTasks = tasksQuery.data;
  const taskList: Task[] = Array.isArray(rawTasks)
    ? rawTasks
    : Array.isArray((rawTasks as any)?.tasks)
    ? (rawTasks as any).tasks
    : [];

  return (
    <div className="space-y-6">
      {/* Top Navigation Row: Back Link & Spec Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={selectedSpecId ? `/specs?spec=${encodeURIComponent(selectedSpecId)}` : '/specs'}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors no-underline cursor-pointer"
          data-testid="link-back-specs"
        >
          <ArrowLeft size={14} />
          Back to Specifications
        </Link>

        {/* Spec Switcher dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
            Active Spec:
          </span>
          <Select
            value={selectedSpecId}
            onValueChange={(val) => {
              setLocation(`/tasks?spec=${encodeURIComponent(val)}`);
            }}
          >
            <SelectTrigger className="w-[240px] sm:w-[280px] h-9 text-xs" data-testid="select-spec-switcher">
              <SelectValue placeholder="Select specification..." />
            </SelectTrigger>
            <SelectContent>
              {featuresList.map((f: Feature) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  <span className="font-semibold text-foreground">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                    ({f.completedTaskCount}/{f.taskCount} done)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Spec Header & Action Row */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-primary">
            Specification / {selectedSpecId || 'None'}
          </div>
          <h1 className="font-serif text-[28px] sm:text-[34px] font-semibold leading-tight tracking-[-.04em] text-foreground">
            {selectedFeature?.name ?? selectedSpecId ?? 'Specification Tasks'}
          </h1>
          {selectedFeature?.description && (
            <p className="mb-0 mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {selectedFeature.description}
            </p>
          )}
        </div>

        <Button
          onClick={() => setIsComposerOpen(true)}
          className="gap-1.5 shadow-md"
          data-testid="button-new-task"
          disabled={!selectedSpecId}
        >
          <Plus size={15} />
          Add Task
        </Button>
      </header>

      {/* Task Creation Right Sheet */}
      <TaskComposerSheet
        open={isComposerOpen}
        onOpenChange={setIsComposerOpen}
        onSubmit={handleCreateTask}
        isPending={createTask.isPending}
        defaultGroupId={selectedFeature?.id || ''}
      />

      {/* Main Content Area */}
      {featuresQuery.isLoading || tasksQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border/60 bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : featuresQuery.isError || tasksQuery.isError ? (
        <div className="rounded-xl border border-border/80 bg-card/90 p-5 flex items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400">
            <AlertCircle size={18} />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Couldn’t load task breakdown</div>
            <p className="mb-0 mt-1 text-xs text-muted-foreground">
              Please check your workspace connection and retry.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw size={14} className="mr-1.5" />
            Try again
          </Button>
        </div>
      ) : !selectedSpecId ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 grid min-h-[300px] place-items-center p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles size={20} />
            </span>
            <h2 className="font-serif text-lg font-semibold">No active specifications</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a specification first to track its task board and execution progress.
            </p>
            <Button onClick={() => setLocation('/specs')} className="mt-4 gap-1.5" size="sm">
              Go to Specifications
            </Button>
          </div>
        </div>
      ) : taskList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 grid min-h-[320px] place-items-center p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <LayoutGrid size={22} />
            </span>
            <h2 className="font-serif text-xl font-semibold">No tasks in this specification</h2>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Break down this feature specification into verifiable tasks for agents and collaborators.
            </p>
            <Button onClick={() => setIsComposerOpen(true)} className="mt-5 gap-1.5">
              <Plus size={14} />
              Create First Task
            </Button>
          </div>
        </div>
      ) : (
        /* Tabs: Kanban, List, DAG Visualizer */
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'kanban' | 'list' | 'dag')}
          className="space-y-5"
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

            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-[10px]">
                Total: {taskList.length}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 border-emerald-500/30">
                Completed: {taskList.filter((t: Task) => t.status === 'done').length}
              </Badge>
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
              onClaim={(t, wt, act) => handleClaim(t, wt, act)}
              onSubmitReview={(t, note) => handleSubmit(t, note)}
              onApprove={(t, note) => handleApprove(t, note)}
              onRequestChanges={(t, note) => handleReject(t, note)}
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
