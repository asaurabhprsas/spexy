import React, { useState } from 'react';
import type { Task } from '@workspace/api-client-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  GitBranch,
  Shield,
  TestTube,
  FileCode,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Link as LinkIcon,
  Check,
  RotateCcw,
  CornerDownRight,
  FileText,
  ListTree,
} from 'lucide-react';
import { TaskDetailSheet } from '@/components/task/TaskDetailSheet';

export type ExtendedTask = Task & {
  notes?: {
    security?: string | null;
    testing?: string | null;
  };
};

interface HierarchicalTaskListProps {
  tasks: ExtendedTask[];
  onClaim?: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview?: (task: Task, note?: string) => void;
  onApprove?: (task: Task, note?: string) => void;
  onRequestChanges?: (task: Task, note?: string) => void;
  onSetStatus?: (task: Task, status: Task['status']) => void;
}

export function HierarchicalTaskList({
  tasks,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
  onSetStatus,
}: HierarchicalTaskListProps) {
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Group tasks by groupId (Phase)
  const groupedTasks = React.useMemo(() => {
    const groups: Record<string, ExtendedTask[]> = {};
    for (const task of tasks) {
      const gid = task.groupId || 'general';
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(task);
    }
    return groups;
  }, [tasks]);

  const groupKeys = Object.keys(groupedTasks);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-40 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">No tasks declared</h3>
        <p className="mt-1 text-xs">Define tasks under this feature specification to begin tracking progress.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={groupKeys}
        className="space-y-3"
      >
        {groupKeys.map((groupKey) => {
          const groupTasks = groupedTasks[groupKey];
          const completedCount = groupTasks.filter((t) => t.status === 'done').length;

          // Build tree: roots have parentId === null or parentId not in this group
          const roots = groupTasks.filter(
            (t) => !t.parentId || !groupTasks.some((p) => p.id === t.parentId)
          );

          return (
            <AccordionItem
              key={groupKey}
              value={groupKey}
              className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs"
            >
              <AccordionTrigger className="px-5 py-3.5 hover:no-underline bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
                    Phase: {groupKey.replace(/-/g, ' ').toUpperCase()}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px] h-5">
                    {completedCount} / {groupTasks.length} Done
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 pt-2">
                <div className="space-y-3">
                  {roots.map((rootTask) => {
                    const children = groupTasks.filter((t) => t.parentId === rootTask.id);
                    return (
                      <TaskTreeNode
                        key={rootTask.id}
                        task={rootTask}
                        childrenTasks={children}
                        allTasks={groupTasks}
                        onSelectTask={(t) => setDetailTask(t)}
                        onClaim={onClaim}
                        onSubmitReview={onSubmitReview}
                        onApprove={onApprove}
                        onRequestChanges={onRequestChanges}
                      />
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={detailTask}
        open={detailTask !== null}
        onOpenChange={(open) => !open && setDetailTask(null)}
        allTasks={tasks}
        onSelectTask={(t) => setDetailTask(t)}
        onClaim={(t, wt, act) => {
          onClaim?.(t, wt, act);
          setDetailTask((prev) => (prev ? { ...prev, status: 'in-progress', worktree: wt ?? null, actor: act ?? null } : null));
        }}
        onSubmitReview={(t, note) => {
          onSubmitReview?.(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'to-review', submissionNote: note ?? null } : null));
        }}
        onApprove={(t, note) => {
          onApprove?.(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'done' } : null));
        }}
        onRequestChanges={(t, note) => {
          onRequestChanges?.(t, note);
          setDetailTask((prev) => (prev ? { ...prev, status: 'todo' } : null));
        }}
        onSetStatus={(t, status) => {
          onSetStatus?.(t, status);
          setDetailTask((prev) => (prev ? { ...prev, status } : null));
        }}
      />
    </div>
  );
}

interface TaskTreeNodeProps {
  task: ExtendedTask;
  childrenTasks: ExtendedTask[];
  allTasks: ExtendedTask[];
  level?: number;
  onSelectTask?: (task: Task) => void;
  onClaim?: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview?: (task: Task, note?: string) => void;
  onApprove?: (task: Task, note?: string) => void;
  onRequestChanges?: (task: Task, note?: string) => void;
}

function TaskTreeNode({
  task,
  childrenTasks,
  allTasks,
  level = 0,
  onSelectTask,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
}: TaskTreeNodeProps) {
  // Chevron controls subtask expansion (default expanded)
  const [isSubtasksOpen, setIsSubtasksOpen] = useState(true);
  // Separate toggle for task description/details
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'to-review':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'in-progress':
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const isBlocked = task.availability === 'blocked' || (task.blockers && task.blockers.length > 0);
  const completedSubtasks = childrenTasks.filter((t) => t.status === 'done').length;
  const hasSubtasks = childrenTasks.length > 0;
  const hasDetails = Boolean(
    task.description ||
    task.notes?.security ||
    task.notes?.testing ||
    (task.files && task.files.length > 0) ||
    (task.dependsOn && task.dependsOn.length > 0) ||
    task.submissionNote
  );

  return (
    <div className={`relative ${level > 0 ? 'mt-2' : ''}`}>
      {/* Horizontal branch line connecting from parent's vertical line */}
      {level > 0 && (
        <div
          className="absolute -left-4 sm:-left-5 top-5 w-4 sm:w-5 h-0.5 bg-border/80"
          aria-hidden="true"
        />
      )}

      {/* Main Task Item Card (ClickUp style) */}
      <div
        onClick={() => onSelectTask?.(task)}
        className="rounded-lg border border-border/75 bg-card/95 hover:bg-accent/15 p-3 sm:p-3.5 shadow-xs transition hover:border-primary/50 cursor-pointer group"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          {/* Left section: Chevron, Subtask Indicator, Badges, Title */}
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {/* Chevron toggle button for subtasks */}
            {hasSubtasks ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSubtasksOpen(!isSubtasksOpen);
                }}
                className="mt-0.5 size-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                title={isSubtasksOpen ? 'Collapse subtasks' : 'Expand subtasks'}
                aria-label={isSubtasksOpen ? 'Collapse subtasks' : 'Expand subtasks'}
              >
                {isSubtasksOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : level > 0 ? (
              <span className="mt-1 size-5 grid place-items-center text-muted-foreground/70 shrink-0">
                <CornerDownRight size={13} />
              </span>
            ) : (
              <span className="mt-1 size-6 grid place-items-center text-muted-foreground/30 text-xs shrink-0 select-none">
                •
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/50">
                  {task.id}
                </span>

                <Badge
                  variant="outline"
                  className={`font-mono text-[9px] uppercase tracking-wider ${getPriorityBadge(task.priority)}`}
                >
                  {task.priority}
                </Badge>

                <Badge
                  variant="outline"
                  className={`font-mono text-[9px] uppercase tracking-wider ${getStatusBadge(task.status)}`}
                >
                  {task.status.replace('-', ' ')}
                </Badge>

                {/* Subtask Count Pill/Badge on parent task */}
                {hasSubtasks && (
                  <Badge
                    variant="secondary"
                    className="font-mono text-[9px] px-2 py-0.5 rounded-full border border-border/70 flex items-center gap-1 bg-muted/70 text-muted-foreground"
                    title={`${childrenTasks.length} nested subtasks (${completedSubtasks} completed)`}
                  >
                    <ListTree size={10} className="text-primary" />
                    <span>
                      {childrenTasks.length} {childrenTasks.length === 1 ? 'subtask' : 'subtasks'} • {completedSubtasks}/{childrenTasks.length} done
                    </span>
                  </Badge>
                )}

                {/* Blocked Badge with Tooltip */}
                {isBlocked && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge variant="destructive" className="font-mono text-[9px] uppercase tracking-wider gap-1 cursor-help">
                          <AlertCircle size={10} />
                          Blocked
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {task.blockers && task.blockers.length > 0
                          ? `Blocked by: ${task.blockers.join(', ')}`
                          : 'Waiting on dependent tasks to finish'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Worktree Lease Badge */}
                {task.worktree && (
                  <Badge variant="secondary" className="font-mono text-[9px] gap-1 bg-primary/10 text-primary border-primary/20">
                    <GitBranch size={10} />
                    {task.worktree}
                  </Badge>
                )}

                {/* Separate details expand/collapse button */}
                {hasDetails && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDetailsOpen(!isDetailsOpen);
                    }}
                    className="ml-auto text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                    title={isDetailsOpen ? 'Hide description and details' : 'Show description and details'}
                  >
                    <FileText size={11} />
                    <span>{isDetailsOpen ? 'Hide' : 'Details'}</span>
                  </button>
                )}
              </div>

              <h4 className="text-xs font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                {task.title}
              </h4>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div
            className="flex items-center gap-1.5 self-center shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {task.status === 'todo' && task.availability === 'available' && onClaim && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-medium"
                onClick={() => onClaim(task, task.worktree || '', 'human')}
              >
                Claim
              </Button>
            )}

            {task.status === 'in-progress' && onSubmitReview && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-medium"
                onClick={() => onSubmitReview(task, 'Submitted for review')}
              >
                Submit Review
              </Button>
            )}

            {task.status === 'to-review' && (
              <div className="flex items-center gap-1">
                {onApprove && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-medium shadow-xs"
                    onClick={() => onApprove(task, 'Approved by reviewer')}
                  >
                    <Check size={12} />
                    Approve
                  </Button>
                )}
                {onRequestChanges && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 gap-1 font-medium"
                    onClick={() => onRequestChanges(task, 'Changes requested')}
                  >
                    <RotateCcw size={12} />
                    Request Changes
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expandable Details Section (Inline) */}
        {isDetailsOpen && (
          <div className="mt-3 pt-3 border-t border-border/60 space-y-2.5 text-xs animate-in fade-in duration-150">
            {/* Description */}
            {task.description && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">
                  Description
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}

            {/* Notes: Security & Testing */}
            {(task.notes?.security || task.notes?.testing) && (
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                {task.notes?.security && (
                  <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 mb-1 font-mono text-[10px]">
                      <Shield size={12} />
                      Security Note
                    </span>
                    <p className="text-muted-foreground">{task.notes.security}</p>
                  </div>
                )}
                {task.notes?.testing && (
                  <div className="rounded border border-sky-500/20 bg-sky-500/5 p-2 text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 mb-1 font-mono text-[10px]">
                      <TestTube size={12} />
                      Testing Note
                    </span>
                    <p className="text-muted-foreground">{task.notes.testing}</p>
                  </div>
                )}
              </div>
            )}

            {/* Affected Files */}
            {task.files && task.files.length > 0 && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground block mb-1 flex items-center gap-1">
                  <FileCode size={11} />
                  Affected Files ({task.files.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {task.files.map((file: string, i: number) => (
                    <span
                      key={i}
                      className="font-mono text-[10px] bg-muted/60 text-muted-foreground px-2 py-0.5 rounded border border-border/60"
                    >
                      {file}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies & Requirements */}
            {((task.dependsOn && task.dependsOn.length > 0) || (task.requirementsRef && task.requirementsRef.length > 0)) && (
              <div className="flex flex-wrap gap-3 pt-1 text-[10px] font-mono text-muted-foreground">
                {task.dependsOn && task.dependsOn.length > 0 && (
                  <div className="flex items-center gap-1">
                    <LinkIcon size={10} />
                    <span>Depends on: {task.dependsOn.join(', ')}</span>
                  </div>
                )}
                {task.requirementsRef && task.requirementsRef.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span>Requirements: {task.requirementsRef.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Submission Note */}
            {task.submissionNote && (
              <div className="rounded bg-accent/40 p-2 text-[11px] border border-border/50">
                <span className="font-semibold text-foreground">Submission Note: </span>
                <span className="text-muted-foreground">{task.submissionNote}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recursive Sub-tasks with modern tree connector indentation */}
      {hasSubtasks && isSubtasksOpen && (
        <div className="relative ml-4 sm:ml-5 pl-4 sm:pl-5 border-l-2 border-border/70 space-y-2 mt-2">
          {childrenTasks.map((childTask) => {
            const grandChildren = allTasks.filter((t) => t.parentId === childTask.id);
            return (
              <TaskTreeNode
                key={childTask.id}
                task={childTask}
                childrenTasks={grandChildren}
                allTasks={allTasks}
                level={level + 1}
                onSelectTask={onSelectTask}
                onClaim={onClaim}
                onSubmitReview={onSubmitReview}
                onApprove={onApprove}
                onRequestChanges={onRequestChanges}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
