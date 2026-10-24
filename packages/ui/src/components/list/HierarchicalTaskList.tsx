import React, { useState, useMemo } from 'react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  MoreHorizontal,
  ChevronsUpDown,
  Maximize2,
  CheckCircle2,
  Clock,
  PlayCircle,
  CircleDot,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { TaskDetailSheet } from '@/components/task/TaskDetailSheet';

export type ExtendedTask = Task & {
  parent_id?: string | null;
  notes?: {
    security?: string | null;
    testing?: string | null;
  };
};

export function getTaskParentId(task: Task | ExtendedTask): string | null {
  return (task as any).parent_id || (task as any).parentId || null;
}

interface HierarchicalTaskListProps {
  tasks: ExtendedTask[];
  specId?: string;
  onClaim?: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview?: (task: Task, note?: string) => void;
  onApprove?: (task: Task, note?: string) => void;
  onRequestChanges?: (task: Task, note?: string) => void;
  onSetStatus?: (task: Task, status: Task['status']) => void;
  onCreateSubtask?: (parentId: string, specId?: string) => void;
}

export function HierarchicalTaskList({
  tasks,
  specId,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
  onSetStatus,
  onCreateSubtask,
}: HierarchicalTaskListProps) {
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'dependencies' | 'files' | 'notes' | 'comments'>('overview');
  const [allExpanded, setAllExpanded] = useState(false);
  // Default to collapsed so parent tasks show right arrow to expand sub-tasks down
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  // Group tasks by groupId (Phase)
  const groupedTasks = useMemo(() => {
    const groups: Record<string, ExtendedTask[]> = {};
    for (const task of tasks) {
      const gid = task.groupId || 'general';
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(task);
    }
    return groups;
  }, [tasks]);

  const groupKeys = Object.keys(groupedTasks);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    if (allExpanded) {
      setExpandedTaskIds(new Set());
      setAllExpanded(false);
    } else {
      const allParentIds = new Set(
        tasks.filter((t) => tasks.some((child) => getTaskParentId(child) === t.id)).map((t) => t.id)
      );
      setExpandedTaskIds(allParentIds);
      setAllExpanded(true);
    }
  };

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
      {/* Global List Toolbar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{tasks.length} Total Tasks</span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {tasks.filter((t) => t.status === 'done').length} Completed
          </span>
          <span>•</span>
          <span className="text-sky-600 dark:text-sky-400 font-medium">
            {tasks.filter((t) => t.status === 'in-progress').length} In Progress
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExpandAll}
          className="h-7 text-xs font-mono text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ChevronsUpDown size={13} />
          {allExpanded ? 'Collapse All Subtasks' : 'Expand All Subtasks'}
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={groupKeys}
        className="space-y-3"
      >
        {groupKeys.map((groupKey) => {
          const groupTasks = groupedTasks[groupKey];
          const completedCount = groupTasks.filter((t) => t.status === 'done').length;
          const progressPercent = Math.round((completedCount / groupTasks.length) * 100) || 0;

          // Build tree roots (parentId === null or parentId not in group)
          const roots = groupTasks.filter(
            (t) => !getTaskParentId(t) || !groupTasks.some((p) => p.id === getTaskParentId(t))
          );

          return (
            <AccordionItem
              key={groupKey}
              value={groupKey}
              className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs"
            >
              <AccordionTrigger className="px-5 py-3 hover:no-underline bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3 w-full pr-4">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
                      Phase: {groupKey.replace(/-/g, ' ').toUpperCase()}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px] h-5">
                      {completedCount} / {groupTasks.length} Done ({progressPercent}%)
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-28 sm:w-36 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="p-3 pt-2">
                <div className="space-y-2">
                  {roots.map((rootTask) => {
                    const children = groupTasks.filter((t) => getTaskParentId(t) === rootTask.id);
                    return (
                      <TaskRowItem
                        key={rootTask.id}
                        task={rootTask}
                        childrenTasks={children}
                        allTasks={groupTasks}
                        level={0}
                        expandedTaskIds={expandedTaskIds}
                        onToggleExpand={toggleTaskExpansion}
                        onSelectTask={(t) => {
                          setDetailTab('overview');
                          setDetailTask(t);
                        }}
                        onOpenComments={(t) => {
                          setDetailTab('comments');
                          setDetailTask(t);
                        }}
                        onClaim={onClaim}
                        onSubmitReview={onSubmitReview}
                        onApprove={onApprove}
                        onRequestChanges={onRequestChanges}
                        onSetStatus={onSetStatus}
                        onCreateSubtask={onCreateSubtask}
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
        specId={specId}
        initialTab={detailTab}
        open={detailTask !== null}
        onOpenChange={(open) => !open && setDetailTask(null)}
        allTasks={tasks}
        onSelectTask={(t) => {
          setDetailTab('overview');
          setDetailTask(t);
        }}
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

interface TaskRowItemProps {
  task: ExtendedTask;
  childrenTasks: ExtendedTask[];
  allTasks: ExtendedTask[];
  level: number;
  expandedTaskIds: Set<string>;
  onToggleExpand: (taskId: string) => void;
  onSelectTask?: (task: Task) => void;
  onOpenComments?: (task: Task) => void;
  onClaim?: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview?: (task: Task, note?: string) => void;
  onApprove?: (task: Task, note?: string) => void;
  onRequestChanges?: (task: Task, note?: string) => void;
  onSetStatus?: (task: Task, status: Task['status']) => void;
  onCreateSubtask?: (parentId: string, specId?: string) => void;
}

function TaskRowItem({
  task,
  childrenTasks,
  allTasks,
  level,
  expandedTaskIds,
  onToggleExpand,
  onSelectTask,
  onOpenComments,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
  onSetStatus,
  onCreateSubtask,
}: TaskRowItemProps) {
  const isExpanded = expandedTaskIds.has(task.id);
  const hasSubtasks = childrenTasks.length > 0;
  const completedSubtasks = childrenTasks.filter((t) => t.status === 'done').length;
  const isBlocked = task.availability === 'blocked' || (task.blockers && task.blockers.length > 0);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 size={14} className="text-emerald-600" />;
      case 'to-review':
        return <Clock size={14} className="text-amber-600" />;
      case 'in-progress':
        return <PlayCircle size={14} className="text-sky-600" />;
      default:
        return <CircleDot size={14} className="text-muted-foreground" />;
    }
  };

  return (
    <div className={`relative ${level > 0 ? 'mt-1.5' : ''}`}>
      {/* Horizontal connector line for nested sub-tasks */}
      {level > 0 && (
        <div
          className="absolute -left-3.5 sm:-left-4 top-4 w-3.5 sm:w-4 h-0.5 bg-border/80"
          aria-hidden="true"
        />
      )}

      {/* Main Task Row Card */}
      <div
        className={`rounded-lg border transition-all ${
          task.status === 'done'
            ? 'bg-card/60 border-border/50 opacity-90'
            : isBlocked
            ? 'bg-card border-rose-500/30'
            : 'bg-card/95 border-border/80 hover:border-primary/50'
        } p-2.5 sm:p-3 shadow-2xs group`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left section: Expand Toggle + Status Dropdown + Title + Badges */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* ClickUp-style Expand/Collapse Chevron Button */}
            {hasSubtasks ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(task.id);
                }}
                className="size-6 grid place-items-center rounded border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer shrink-0 shadow-2xs"
                title={isExpanded ? `Collapse ${childrenTasks.length} subtasks` : `Expand ${childrenTasks.length} subtasks`}
                aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="text-primary font-bold" />
                ) : (
                  <ChevronRight size={14} className="text-foreground/70" />
                )}
              </button>
            ) : level > 0 ? (
              <span className="size-6 grid place-items-center text-muted-foreground/60 shrink-0" title="Subtask">
                <CornerDownRight size={13} />
              </span>
            ) : (
              <span className="size-6 grid place-items-center text-muted-foreground/30 text-xs shrink-0 select-none">
                •
              </span>
            )}

            {/* Quick Status Selector Dropdown */}
            {onSetStatus ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="size-6 grid place-items-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                    title={`Status: ${task.status}. Click to change`}
                  >
                    {getStatusIcon(task.status)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuItem onClick={() => onSetStatus(task, 'todo')} className="text-xs gap-2">
                    <CircleDot size={12} className="text-muted-foreground" />
                    <span>To Do</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSetStatus(task, 'in-progress')} className="text-xs gap-2">
                    <PlayCircle size={12} className="text-sky-600" />
                    <span>In Progress</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSetStatus(task, 'to-review')} className="text-xs gap-2">
                    <Clock size={12} className="text-amber-600" />
                    <span>To Review</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSetStatus(task, 'done')} className="text-xs gap-2">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span>Done</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="size-6 grid place-items-center shrink-0">
                {getStatusIcon(task.status)}
              </span>
            )}

            {/* Task ID */}
            <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded border border-border/60 shrink-0">
              {task.id}
            </span>

            {/* Task Title (Click opens details) */}
            <span
              onClick={() => onSelectTask?.(task)}
              className={`text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer truncate ${
                task.status === 'done' ? 'line-through text-muted-foreground' : ''
              }`}
              title={task.title}
            >
              {task.title}
            </span>

            {/* Priority Badge */}
            <Badge
              variant="outline"
              className={`font-mono text-[9px] uppercase tracking-wider hidden sm:inline-flex shrink-0 ${getPriorityBadge(task.priority)}`}
            >
              {task.priority}
            </Badge>

            {/* Subtask count pill (Clicking also toggles expansion!) */}
            {hasSubtasks && (
              <Badge
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(task.id);
                }}
                className="font-mono text-[9px] px-2 py-0.5 rounded-full border border-border/70 flex items-center gap-1 bg-muted/80 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer shrink-0"
                title={`${childrenTasks.length} subtasks (${completedSubtasks} done). Click to ${isExpanded ? 'collapse' : 'expand'}`}
              >
                <ListTree size={10} className="text-primary" />
                <span>
                  {childrenTasks.length} {childrenTasks.length === 1 ? 'subtask' : 'subtasks'} ({completedSubtasks}/{childrenTasks.length})
                </span>
              </Badge>
            )}

            {/* Blocked Badge */}
            {isBlocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="destructive" className="font-mono text-[9px] uppercase tracking-wider gap-1 cursor-help shrink-0">
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

            {/* Worktree Lease */}
            {task.worktree && (
              <Badge variant="secondary" className="font-mono text-[9px] gap-1 bg-primary/10 text-primary border-primary/20 hidden md:inline-flex shrink-0">
                <GitBranch size={10} />
                {task.worktree}
              </Badge>
            )}

            {/* Files Badge */}
            {task.files && task.files.length > 0 && (
              <span className="font-mono text-[9px] text-muted-foreground hidden lg:inline-flex items-center gap-1 shrink-0">
                <FileCode size={10} />
                {task.files.length} {task.files.length === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 self-center shrink-0">
            {/* Contextual Action Button */}
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
                    Changes
                  </Button>
                )}
              </div>
            )}

            {/* Quick Add Subtask Button */}
            {onCreateSubtask && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onCreateSubtask(task.id, task.groupId || undefined)}
                title="Add subtask"
              >
                <Plus size={13} />
              </Button>
            )}

            {/* Quick Comments & Attachments Button */}
            {onOpenComments && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments(task);
                }}
                title="Task comments & attachments"
              >
                <MessageSquare size={13} />
              </Button>
            )}

            {/* Open Detail Sheet Button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSelectTask?.(task)}
              title="Open task details"
            >
              <Maximize2 size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Recursive Nested Sub-tasks */}
      {hasSubtasks && isExpanded && (
        <div className="relative ml-3.5 sm:ml-4 pl-3.5 sm:pl-4 border-l-2 border-border/70 space-y-1.5 mt-1.5 animate-in fade-in duration-150">
          {childrenTasks.map((childTask) => {
            const grandChildren = allTasks.filter((t) => getTaskParentId(t) === childTask.id);
            return (
              <TaskRowItem
                key={childTask.id}
                task={childTask}
                childrenTasks={grandChildren}
                allTasks={allTasks}
                level={level + 1}
                expandedTaskIds={expandedTaskIds}
                onToggleExpand={onToggleExpand}
                onSelectTask={onSelectTask}
                onOpenComments={onOpenComments}
                onClaim={onClaim}
                onSubmitReview={onSubmitReview}
                onApprove={onApprove}
                onRequestChanges={onRequestChanges}
                onSetStatus={onSetStatus}
                onCreateSubtask={onCreateSubtask}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
