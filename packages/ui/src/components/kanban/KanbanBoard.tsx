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
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CircleDot,
  GripVertical,
  GitBranch,
  FileText,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { TaskDetailModal } from '@/components/task/TaskDetailModal';

interface KanbanBoardProps {
  tasks: Task[];
  onClaim: (task: Task, worktree: string, actor: string) => void;
  onSubmitReview: (task: Task, note: string) => void;
  onApproveDone: (task: Task, note: string) => void;
  onRequestChanges: (task: Task, note: string) => void;
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

  // Selected task state for TaskDetailModal
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Verification dialog state for dragging to done
  const [pendingDoneTask, setPendingDoneTask] = useState<Task | null>(null);
  const [verificationNote, setVerificationNote] = useState('');

  // Claim dialog state
  const [pendingClaimTask, setPendingClaimTask] = useState<Task | null>(null);
  const [claimWorktree, setClaimWorktree] = useState('');
  const [claimActor, setClaimActor] = useState('');

  // Submit dialog state
  const [pendingSubmitTask, setPendingSubmitTask] = useState<Task | null>(null);
  const [submitNote, setSubmitNote] = useState('');

  // Reject dialog state
  const [pendingRejectTask, setPendingRejectTask] = useState<Task | null>(null);
  const [rejectNote, setRejectNote] = useState('');

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

    // Transition logic:
    // 1. Moving to done requires human verification!
    if (destinationLane === 'done') {
      setPendingDoneTask(task);
      setVerificationNote('');
      return;
    }

    // 2. Moving from todo to in-progress -> claim
    if (task.status === 'todo' && destinationLane === 'in-progress' && task.availability === 'available') {
      setPendingClaimTask(task);
      setClaimWorktree(task.worktree || `worktree/${task.id}`);
      setClaimActor('AI Agent');
      return;
    }

    // 3. Moving from in-progress to to-review -> submit
    if (task.status === 'in-progress' && destinationLane === 'to-review') {
      setPendingSubmitTask(task);
      setSubmitNote('');
      return;
    }

    // 4. Moving from to-review back to in-progress -> request changes
    if (task.status === 'to-review' && destinationLane === 'in-progress') {
      setPendingRejectTask(task);
      setRejectNote('');
      return;
    }
  };

  const confirmDone = () => {
    if (pendingDoneTask) {
      onApproveDone(pendingDoneTask, verificationNote.trim() || 'Verified by human reviewer.');
      setPendingDoneTask(null);
      setVerificationNote('');
    }
  };

  const confirmClaim = () => {
    if (pendingClaimTask && claimWorktree && claimActor) {
      onClaim(pendingClaimTask, claimWorktree, claimActor);
      setPendingClaimTask(null);
    }
  };

  const confirmSubmit = () => {
    if (pendingSubmitTask && submitNote.trim()) {
      onSubmitReview(pendingSubmitTask, submitNote.trim());
      setPendingSubmitTask(null);
      setSubmitNote('');
    }
  };

  const confirmReject = () => {
    if (pendingRejectTask && rejectNote.trim()) {
      onRequestChanges(pendingRejectTask, rejectNote.trim());
      setPendingRejectTask(null);
      setRejectNote('');
    }
  };

  const lanes: Array<{ id: Task['status']; label: string }> = [
    { id: 'todo', label: 'To Do' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'to-review', label: 'To Review' },
    { id: 'done', label: 'Done' },
  ];

  const blockedTasks = tasks.filter((t) => t.availability === 'blocked' || (t.blockers && t.blockers.length > 0));
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
                onQuickClaim={(t) => {
                  setPendingClaimTask(t);
                  setClaimWorktree(t.worktree || `worktree/${t.id}`);
                  setClaimActor('AI Agent');
                }}
                onQuickSubmit={(t) => {
                  setPendingSubmitTask(t);
                  setSubmitNote('');
                }}
                onQuickApprove={(t) => {
                  setPendingDoneTask(t);
                  setVerificationNote('');
                }}
                onQuickReject={(t) => {
                  setPendingRejectTask(t);
                  setRejectNote('');
                }}
              />
            );
          })}
        </div>

        {/* Floating Portal DragOverlay with smooth drop animation */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={detailTask}
        open={detailTask !== null}
        onOpenChange={(open) => !open && setDetailTask(null)}
        allTasks={tasks}
        onSelectTask={(t) => setDetailTask(t)}
        onClaim={(t) => {
          setPendingClaimTask(t);
          setClaimWorktree(t.worktree || `worktree/${t.id}`);
          setClaimActor('AI Agent');
        }}
        onSubmitReview={(t) => {
          setPendingSubmitTask(t);
          setSubmitNote('');
        }}
        onApprove={(t) => {
          setPendingDoneTask(t);
          setVerificationNote('');
        }}
        onRequestChanges={(t) => {
          setPendingRejectTask(t);
          setRejectNote('');
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

      {/* 1. Human Verification Alert Dialog for Moving to Done */}
      <AlertDialog open={pendingDoneTask !== null} onOpenChange={(open) => !open && setPendingDoneTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={20} />
              <AlertDialogTitle>Human Verification Required</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground pt-1">
              Marking <strong className="text-foreground">{pendingDoneTask?.id}</strong> as{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">DONE</strong> enforces sign-off. Please confirm that
              automated test suites passed and code changes meet the specification.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2 space-y-2">
            <label className="text-[11px] font-mono uppercase text-muted-foreground block">
              Verification Notes / Sign-off Record
            </label>
            <Textarea
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
              placeholder="e.g. Verified test coverage, linter passes, and manual review complete."
              className="text-xs h-20"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDoneTask(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDone}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <CheckCheck size={14} />
              Verify & Mark Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2. Claim Task Dialog */}
      <AlertDialog open={pendingClaimTask !== null} onOpenChange={(open) => !open && setPendingClaimTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Claim Task Lease</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Provide an isolated worktree branch and actor name to claim <strong className="text-foreground">{pendingClaimTask?.id}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] font-mono uppercase text-muted-foreground block mb-1">
                Worktree Path
              </label>
              <Input
                value={claimWorktree}
                onChange={(e) => setClaimWorktree(e.target.value)}
                placeholder=".worktrees/feature-branch"
                className="text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-muted-foreground block mb-1">
                Actor / Agent Name
              </label>
              <Input
                value={claimActor}
                onChange={(e) => setClaimActor(e.target.value)}
                placeholder="Agent or Engineer ID"
                className="text-xs"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingClaimTask(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClaim} disabled={!claimWorktree || !claimActor}>
              Claim Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 3. Submit for Review Dialog */}
      <AlertDialog open={pendingSubmitTask !== null} onOpenChange={(open) => !open && setPendingSubmitTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Task for Review</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Describe the code changes, testing completed, and verification evidence for <strong className="text-foreground">{pendingSubmitTask?.id}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Textarea
              required
              value={submitNote}
              onChange={(e) => setSubmitNote(e.target.value)}
              placeholder="What changed and how was it verified?"
              className="text-xs h-24"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSubmitTask(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={!submitNote.trim()}>
              Submit for Review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 4. Request Changes Dialog */}
      <AlertDialog open={pendingRejectTask !== null} onOpenChange={(open) => !open && setPendingRejectTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Changes</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Provide feedback on what needs to be revised before this task can be approved.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Textarea
              required
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Detailed reasons for changes requested..."
              className="text-xs h-24"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRejectTask(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              disabled={!rejectNote.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Request Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  const getPriorityDot = (p: string) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500';
      case 'medium':
        return 'bg-amber-500';
      default:
        return 'bg-slate-400';
    }
  };

  // While dragging, render a dashed placeholder in place. DragOverlay handles the moving card!
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
      className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-xs transition hover:border-primary/40 cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.id}
            </span>
            <span
              className={`size-1.5 rounded-full ${getPriorityDot(task.priority)}`}
              title={`${task.priority} priority`}
            />
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
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing p-1 -mr-1"
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Worktree & Files Badges */}
      {(task.worktree || (task.files && task.files.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 mb-2.5 font-mono text-[9px] text-muted-foreground">
          {task.worktree && (
            <span className="inline-flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
              <GitBranch size={10} />
              {task.worktree}
            </span>
          )}
          {task.files && task.files.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
              <FileText size={10} />
              {task.files.length}
            </span>
          )}
        </div>
      )}

      {/* Submission Note Preview */}
      {task.submissionNote && (
        <div className="mb-2.5 rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground line-clamp-2">
          <strong className="text-foreground">Note:</strong> {task.submissionNote}
        </div>
      )}

      {/* Quick Action Buttons */}
      <div
        className="flex items-center gap-1.5 pt-2 border-t border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {task.status === 'todo' && task.availability === 'available' && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] w-full"
            onClick={() => onQuickClaim(task)}
          >
            Claim
          </Button>
        )}

        {task.status === 'in-progress' && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] w-full"
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
  const getPriorityDot = (p: string) => {
    switch (p) {
      case 'high':
        return 'bg-rose-500';
      case 'medium':
        return 'bg-amber-500';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div className="w-[280px] rounded-lg border-2 border-primary/60 bg-background/95 p-3 shadow-2xl rotate-1 scale-[1.02] cursor-grabbing backdrop-blur-xs select-none pointer-events-none">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {task.id}
            </span>
            <span
              className={`size-1.5 rounded-full ${getPriorityDot(task.priority)}`}
            />
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
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5 leading-relaxed">
          {task.description}
        </p>
      )}

      {(task.worktree || (task.files && task.files.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 font-mono text-[9px] text-muted-foreground">
          {task.worktree && (
            <span className="inline-flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
              <GitBranch size={10} />
              {task.worktree}
            </span>
          )}
          {task.files && task.files.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-muted/60 px-1.5 py-0.5 rounded">
              <FileText size={10} />
              {task.files.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
