import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
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
  const searchString = useSearch();
  const qc = useQueryClient();

  const featuresQuery = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const featuresList = featuresQuery.data ?? [];

  // Parse URL search param `?spec=<spec-id>` reactively
  const specParam = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('spec');
  }, [searchString]);

  const [selectedSpecId, setSelectedSpecId] = useState<string>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('spec') || '';
  });

  // If visiting /tasks without a ?spec param:
  // Automatically redirect / sync URL using setLocation('/tasks?spec=' + encodeURIComponent(defaultSpec), { replace: true })
  useEffect(() => {
    if (!specParam && featuresList.length > 0) {
      const defaultSpec = featuresList[0]?.id || 'all';
      setSelectedSpecId(defaultSpec);
      setLocation(`/tasks?spec=${encodeURIComponent(defaultSpec)}`, { replace: true });
    } else if (specParam) {
      setSelectedSpecId(specParam);
    }
  }, [specParam, featuresList, setLocation]);

  const isAllSpecs = selectedSpecId === 'all';

  const selectedFeature = useMemo(() => {
    if (isAllSpecs) return null;
    return featuresList.find((f: Feature) => f.id === selectedSpecId);
  }, [featuresList, selectedSpecId, isAllSpecs]);

  // Query tasks: when selectedSpecId === 'all', query from /api/tasks (or /api/specs/all/tasks?format=array)
  const allTasksQuery = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: async (): Promise<Task[]> => {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.tasks || []);
        }
      } catch {}
      try {
        const res2 = await fetch('/api/specs/all/tasks?format=array');
        if (res2.ok) {
          const data = await res2.json();
          return Array.isArray(data) ? data : (data.tasks || []);
        }
      } catch {}
      return [];
    },
    enabled: isAllSpecs,
  });

  const singleSpecTasksQuery = useListTasks(isAllSpecs ? '' : selectedSpecId, {
    query: {
      queryKey: getListTasksQueryKey(isAllSpecs ? '' : selectedSpecId),
      enabled: Boolean(selectedSpecId) && !isAllSpecs,
    },
  });

  const [activeTab, setActiveTab] = useState<'kanban' | 'list' | 'dag'>('kanban');
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const createTask = useCreateTask();
  const claimTask = useClaimTask();
  const submitTask = useSubmitTask();
  const reviewTask = useReviewTask();

  const refresh = () => {
    if (isAllSpecs) {
      void qc.invalidateQueries({ queryKey: ['tasks', 'all'] });
    } else if (selectedSpecId) {
      void qc.invalidateQueries({ queryKey: getListTasksQueryKey(selectedSpecId) });
    }
    void qc.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const handleCreateTask = (formData: CreateTaskFormData) => {
    const targetSpecId = isAllSpecs ? (formData.groupId || featuresList[0]?.id) : selectedSpecId;
    if (!targetSpecId) return;

    createTask.mutate(
      {
        featureId: targetSpecId,
        data: {
          id: formData.id,
          groupId: formData.groupId || targetSpecId,
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

  // Instant actions: Status transitions and drag-drop support for both single-spec and All Specifications
  const handleTransitionAction = async (
    task: Task,
    action: string,
    params: { note?: string; worktree?: string; actor?: string; decision?: string } = {}
  ) => {
    const actor = params.actor || 'human';
    const note = params.note || '';
    const originalTaskId = (task as any).originalId || task.id;
    const worktree = params.worktree || task.worktree || `worktree/${originalTaskId}`;
    const parentSpecId = (task as any).specId || (task as any).spec_id || task.groupId || task.featureId;

    if (isAllSpecs) {
      const payload: Record<string, any> = { action, actor };
      if (note) payload.note = note;
      if (params.decision) payload.decision = params.decision;
      if (worktree) payload.worktree = worktree;

      let transitioned = false;
      // Target parent spec endpoint first if known!
      if (parentSpecId) {
        try {
          const res = await fetch(
            `/api/specs/${encodeURIComponent(parentSpecId)}/tasks/${encodeURIComponent(originalTaskId)}/transition`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          );
          if (res.ok) transitioned = true;
        } catch {}
      }

      if (!transitioned) {
        try {
          const res = await fetch(`/api/tasks/${encodeURIComponent(originalTaskId)}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) transitioned = true;
        } catch {}
      }

      if (!transitioned) {
        try {
          const res = await fetch(`/api/specs/all/tasks/${encodeURIComponent(originalTaskId)}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) transitioned = true;
        } catch {}
      }

      refresh();
      return;
    }

    if (action === 'claim') {
      claimTask.mutate(
        { featureId: selectedSpecId, taskId: originalTaskId, data: { worktree, actor } },
        { onSuccess: refresh }
      );
    } else if (action === 'submit') {
      submitTask.mutate(
        { featureId: selectedSpecId, taskId: originalTaskId, data: { note: note || 'Submitted for review' } },
        { onSuccess: refresh }
      );
    } else if (action === 'approve') {
      reviewTask.mutate(
        { featureId: selectedSpecId, taskId: originalTaskId, data: { decision: 'approve', note: note || 'Verified and approved' } },
        { onSuccess: refresh }
      );
    } else if (action === 'reject') {
      reviewTask.mutate(
        { featureId: selectedSpecId, taskId: originalTaskId, data: { decision: 'reject', note: note || 'Changes requested' } },
        { onSuccess: refresh }
      );
    }
  };

  const handleClaim = (task: Task, worktree?: string, actor?: string) => {
    void handleTransitionAction(task, 'claim', { worktree, actor });
  };

  const handleSubmit = (task: Task, note?: string) => {
    void handleTransitionAction(task, 'submit', { note });
  };

  const handleApprove = (task: Task, note?: string) => {
    void handleTransitionAction(task, 'approve', { note, decision: 'approve' });
  };

  const handleReject = (task: Task, note?: string) => {
    void handleTransitionAction(task, 'reject', { note, decision: 'reject' });
  };

  const rawTasks = isAllSpecs ? allTasksQuery.data : singleSpecTasksQuery.data;
  const taskList: Task[] = useMemo(() => {
    const list: Task[] = Array.isArray(rawTasks)
      ? rawTasks
      : Array.isArray((rawTasks as any)?.tasks)
      ? (rawTasks as any).tasks
      : [];

    if (!isAllSpecs) return list;

    return list.map((task: any) => {
      const parentSpec = task.specId || task.spec_id || task.groupId || 'spec';
      const compositeId = `${parentSpec}:${task.id}`;
      return {
        ...task,
        compositeKey: compositeId,
        specId: parentSpec,
        spec_id: parentSpec,
        originalId: task.id,
      };
    });
  }, [rawTasks, isAllSpecs]);

  const isLoading = isAllSpecs ? allTasksQuery.isLoading : singleSpecTasksQuery.isLoading;
  const isError = isAllSpecs ? allTasksQuery.isError : singleSpecTasksQuery.isError;

  return (
    <div className="space-y-6">
      {/* Top Navigation Row: Back Link & Spec Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={selectedSpecId && !isAllSpecs ? `/specs?spec=${encodeURIComponent(selectedSpecId)}` : '/specs'}
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
            value={selectedSpecId || 'all'}
            onValueChange={(val) => {
              setSelectedSpecId(val);
              setLocation(`/tasks?spec=${encodeURIComponent(val)}`);
            }}
          >
            <SelectTrigger className="w-[240px] sm:w-[280px] h-9 text-xs" data-testid="select-spec-switcher">
              <SelectValue placeholder="Select specification..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-medium">
                <span className="font-semibold text-foreground">All Specifications</span>
                <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                  (workspace view)
                </span>
              </SelectItem>
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
            {isAllSpecs ? 'Workspace / All Specifications' : `Specification / ${selectedSpecId || 'None'}`}
          </div>
          <h1 className="font-serif text-[28px] sm:text-[34px] font-semibold leading-tight tracking-[-.04em] text-foreground">
            {isAllSpecs
              ? 'All Specifications & Tasks'
              : selectedFeature?.name ?? selectedSpecId ?? 'Specification Tasks'}
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {isAllSpecs
              ? 'Consolidated task execution board across all specifications in this workspace.'
              : selectedFeature?.description || 'Inspect and execute verifiable tasks for this specification.'}
          </p>
        </div>

        <Button
          onClick={() => setIsComposerOpen(true)}
          className="gap-1.5 shadow-md"
          data-testid="button-new-task"
          disabled={!isAllSpecs && !selectedSpecId}
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
      {featuresQuery.isLoading || isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border/60 bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : featuresQuery.isError || isError ? (
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
            <h2 className="font-serif text-xl font-semibold">
              {isAllSpecs ? 'No tasks found across specifications' : 'No tasks in this specification'}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {isAllSpecs
                ? 'None of the active specifications have tasks defined yet.'
                : 'Break down this feature specification into verifiable tasks for agents and collaborators.'}
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
