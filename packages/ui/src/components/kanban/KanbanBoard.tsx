import React, { useState } from 'react';
import type { Task } from '@workspace/api-client-react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CircleDot,
  GripVertical,
  GitBranch,
  FileCode,
  FileText,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  User,
  Sparkles,
} from 'lucide-react';
import { TaskDetailSheet } from '@/components/task/TaskDetailSheet';

interface KanbanBoardProps {
  tasks: Task[];
  onClaim: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview: (task: Task, note?: string) => void;
  onApproveDone: (task: Task, note?: string) => void;
  onRequestChanges: (task: Task, note?: string) => void;
}

export function KanbanBoard({
  tasks,
  onClaim,
  onSubmitReview,
  onApproveDone,
  onRequestChanges,
}: KanbanBoardProps) {
  // Dragging active item state for smooth DragOverlay
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Selected task state for TaskDetailSheet (sidebar)
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveTaskId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    if (!event.over) return;
    const taskId = String(event.active.id);
    const destinationLane = String(event.over.id) as Task['status'];
    const task = tasks.find((t) => t.id === taskId);

    if (!task || destinationLane === task.status) return;

    // Instant transitions without ANY intrusive window.prompt!
    if (destinationLane === 'done') {
      onApproveDone(task, 'Verified and approved by reviewer');
      return;
    }

    if (task.status === 'todo' && destinationLane === 'in-progress') {
      onClaim(task, task.worktree || '', 'human');
      return;
    }

    if (task.status === 'in-progress' && destinationLane === 'to-review') {
      onSubmitReview(task, 'Submitted for review');
      return;
    }

    if (task.status === 'to-review' && (destinationLane === 'in-progress' || destinationLane === 'todo')) {
      onRequestChanges(task, 'Changes requested');
      return;
    }
  };

  const lanes: Array<{ id: Task['status']; label: string }> = [
    { id: 'todo', label: 'To Do' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'to-review', label: 'To Review' },
    { id: 'done', label: 'Done' },
  ];

  const blockedTasks = tasks.filter(
    (t) => t.availability === 'blocked' || (t.blockers && t.blockers.length > 0)
  );
  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : null;

  return (
    <div className="space-y-6">
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {lanes.map((lane) => {
            const laneTasks = tasks.filter(
              (t) => t.status === lane.id && (lane.id !== 'todo' || t.availability !== 'blocked')
            );
            return (
              <KanbanLane
                key={lane.id}
                status={lane.id}
                label={lane.label}
                tasks={laneTasks}
                onSelectTask={(t) => setDetailTask(t)}
                onQuickClaim={(t) => onClaim(t, t.worktree || '', 'human')}
                onQuickSubmit={(t) => onSubmitReview(t, 'Submitted for review')}
                onQuickApprove={(t) => onApproveDone(t, 'Verified and approved')}
                onQuickReject={(t) => onRequestChanges(t, 'Changes requested')}
              />
            );
          })}
        </div>

        {/* Floating Portal DragOverlay with smooth drop animation */}
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Sheet on the Right */}
      <TaskDetailSheet
        task={detailTask}
        open={detailTask !== null}
        onOpenChange={(open) => !open && setDetailTask(null)}
        allTasks={tasks}
        onSelectTask={(t) => setDetailTask(t)}
        onClaim={(t, wt, act) => {
          onClaim(t, wt, act);
          setDetailTask((prev) => (prev ? { ...prev, status: 'in-progress', worktree: wt ?? null, actor: act ?? null } : null));
        }}
        onSubmitReview={(t, note) => {
          onSubmitReview(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'to-review', submissionNote: note ?? null } : null));
        }}
        onApprove={(t, note) => {
          onApproveDone(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'done' } : null));
        }}
        onRequestChanges={(t, note) => {
          onRequestChanges(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'todo' } : null));
        }}
      />

      {/* Blocked Dependencies Drawer / Box */}
      {blockedTasks.length > 0 && (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />
            <h3 className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider font-mono">
              Blocked Dependencies ({blockedTasks.length})
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {blockedTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setDetailTask(t)}
                className="rounded-lg border border-rose-300/60 dark:border-rose-900/60 bg-background/80 p-3 cursor-pointer hover:border-rose-500/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{t.id}</span>
                  <Badge variant="destructive" className="font-mono text-[9px] uppercase">
                    Blocked
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold text-foreground line-clamp-1">{t.title}</h4>
                <p className="mt-1 font-mono text-[10px] text-rose-700 dark:text-rose-400">
                  {t.blockers?.length ? `Blocked by: ${t.blockers.join(' • ')}` : 'Waiting on dependencies'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface KanbanLaneProps {
  status: Task['status'];
  label: string;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onQuickClaim: (task: Task) => void;
  onQuickSubmit: (task: Task) => void;
  onQuickApprove: (task: Task) => void;
  onQuickReject: (task: Task) => void;
}

function KanbanLane({
  status,
  label,
  tasks,
  onSelectTask,
  onQuickClaim,
  onQuickSubmit,
  onQuickApprove,
  onQuickReject,
}: KanbanLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const getStatusDotColor = (s: Task['status']) => {
    switch (s) {
      case 'done':
        return 'text-emerald-500';
      case 'to-review':
        return 'text-amber-500';
      case 'in-progress':
        return 'text-sky-500';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs transition-all ${
        isOver ? 'ring-2 ring-primary/60 border-primary bg-accent/20' : ''
      }`}
    >
      {/* Lane Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <CircleDot size={14} className={getStatusDotColor(status)} />
          <h3 className="text-xs font-semibold text-foreground tracking-tight">{label}</h3>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] h-5">
          {tasks.length.toString().padStart(2, '0')}
        </Badge>
      </div>

      {/* Lane Body */}
      <div className="flex-1 p-3 space-y-2.5 min-h-[360px] overflow-y-auto max-h-[calc(100vh-280px)]">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-border/60 text-center font-mono text-[11px] text-muted-foreground p-4">
            <span>Drop tasks here</span>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onSelect={onSelectTask}
              onQuickClaim={onQuickClaim}
              onQuickSubmit={onQuickSubmit}
              onQuickApprove={onQuickApprove}
              onQuickReject={onQuickReject}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  task: Task;
  onSelect: (task: Task) => void;
  onQuickClaim: (task: Task) => void;
  onQuickSubmit: (task: Task) => void;
  onQuickApprove: (task: Task) => void;
  onQuickReject: (task: Task) => void;
}

function KanbanCard({
  task,
  onSelect,
  onQuickClaim,
  onQuickSubmit,
  onQuickApprove,
  onQuickReject,
}: KanbanCardProps) {
  const isDraggable = task.status !== 'done' && task.availability !== 'blocked';
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: task.id,
      disabled: !isDraggable,
    });

  const getPriorityBadgeClass = (p: string) => {
    switch (p) {
      case 'high':
        return 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      case 'medium':
        return 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      default:
        return 'border-slate-500/30 text-slate-600 dark:text-slate-400 bg-slate-500/10';
    }
  };

  const actorName = (task as any).actor || (task as any).claimedBy || null;

  // While dragging, render placeholder
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="rounded-lg border-2 border-dashed border-primary/50 bg-muted/30 p-3 opacity-30 min-h-[96px] pointer-events-none transition-all"
        aria-hidden="true"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {task.id}
          </span>
        </div>
        <h4 className="text-xs font-semibold text-foreground/50 line-clamp-2">
          {task.title}
        </h4>
      </div>
    );
  }

  return (
    <article
      ref={setNodeRef}
      onClick={() => onSelect(task)}
      className="rounded-lg border border-border/70 bg-background/90 p-3 shadow-xs transition hover:border-primary/50 cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="font-mono text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.id}
            </span>
            <Badge
              variant="outline"
              className={`font-mono text-[8px] uppercase tracking-wider px-1.5 py-0 h-4 ${getPriorityBadgeClass(task.priority)}`}
            >
              {task.priority}
            </Badge>
            {actorName && (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0 rounded">
                <User size={10} className="text-primary" />
                {actorName}
              </span>
            )}
          </div>
          <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {task.title}
          </h4>
        </div>

        {isDraggable && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            type="button"
            aria-label="Drag task"
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing p-1 -mr-1 shrink-0"
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Files or dependencies badges if any */}
      {(task.files?.length || task.dependsOn?.length) ? (
        <div className="flex items-center gap-2 mb-2 font-mono text-[9px] text-muted-foreground">
          {task.files && task.files.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileCode size={11} className="text-muted-foreground" />
              {task.files.length} {task.files.length === 1 ? 'file' : 'files'}
            </span>
          )}
          {task.dependsOn && task.dependsOn.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span>deps: {task.dependsOn.length}</span>
            </span>
          )}
        </div>
      ) : null}

      {/* Quick Action Buttons */}
      <div
        className="flex items-center gap-1.5 pt-2 border-t border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {task.status === 'todo' && task.availability === 'available' && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] w-full gap-1 hover:bg-primary/10 hover:text-primary"
            onClick={() => onQuickClaim(task)}
          >
            <Sparkles size={11} />
            Claim
          </Button>
        )}

        {task.status === 'in-progress' && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] w-full gap-1"
            onClick={() => onQuickSubmit(task)}
          >
            Submit for Review
          </Button>
        )}

        {task.status === 'to-review' && (
          <div className="flex items-center gap-1 w-full">
            <Button
              size="sm"
              className="h-6 px-2 text-[11px] flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              onClick={() => onQuickApprove(task)}
            >
              <Check size={11} />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-1.5 text-[11px] text-rose-600 hover:text-rose-700"
              onClick={() => onQuickReject(task)}
              title="Request Changes"
            >
              <RotateCcw size={11} />
            </Button>
          </div>
        )}

        {task.status === 'done' && (
          <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 py-0.5">
            <CheckCheck size={12} />
            <span>Verified Complete</span>
          </div>
        )}
      </div>
    </article>
  );
}

function KanbanCardOverlay({ task }: { task: Task }) {
  const actorName = (task as any).actor || (task as any).claimedBy || null;

  return (
    <div className="w-[280px] rounded-lg border-2 border-primary/60 bg-background/95 p-3 shadow-2xl rotate-1 scale-[1.02] cursor-grabbing backdrop-blur-xs select-none pointer-events-none">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.id}
            </span>
            <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0 h-4">
              {task.priority}
            </Badge>
            {actorName && (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0 rounded">
                <User size={10} className="text-primary" />
                {actorName}
              </span>
            )}
          </div>
          <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
            {task.title}
          </h4>
        </div>
        <div className="text-primary p-1 -mr-1">
          <GripVertical size={14} />
        </div>
      </div>

      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
          {task.description}
        </p>
      )}
    </div>
  );
}
