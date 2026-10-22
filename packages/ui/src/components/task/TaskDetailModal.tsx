import React from 'react';
import type { Task } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  User,
  Clock,
  Lock,
  FileCode,
  Link as LinkIcon,
  Shield,
  TestTube,
  Sparkles,
  Layers,
} from 'lucide-react';

export type TaskDetailItem = Task & {
  actor?: string;
  claimedBy?: string;
  lockedAt?: string;
  locked_at?: string;
  leaseExpiresAt?: string;
  notes?: {
    security?: string | null;
    testing?: string | null;
  };
  [key: string]: any;
};

export interface TaskDetailModalProps {
  task: TaskDetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTasks?: Task[];
  onSelectTask?: (task: Task) => void;
  onClaim?: (task: Task) => void;
  onSubmitReview?: (task: Task) => void;
  onApprove?: (task: Task) => void;
  onRequestChanges?: (task: Task) => void;
}

export function TaskDetailModal({
  task,
  open,
  onOpenChange,
  allTasks = [],
  onSelectTask,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
}: TaskDetailModalProps) {
  if (!task) return null;

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30';
    }
  };

  const getStatusBadgeClass = (status: string) => {
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
  const actorName = task.actor || task.claimedBy || null;
  const lockedTime = task.lockedAt || task.locked_at || task.leaseExpiresAt || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-6 sm:p-7 gap-5">
        <DialogHeader className="space-y-3 border-b border-border/70 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold bg-muted text-foreground px-2 py-0.5 rounded border border-border/60">
              {task.id}
            </span>
            <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getPriorityBadgeClass(task.priority)}`}>
              {task.priority} priority
            </Badge>
            <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getStatusBadgeClass(task.status)}`}>
              {task.status.replace('-', ' ')}
            </Badge>
            {isBlocked && (
              <Badge variant="destructive" className="font-mono text-[10px] uppercase tracking-wider gap-1">
                <AlertCircle size={11} />
                Blocked
              </Badge>
            )}
            {task.groupId && (
              <span className="text-[11px] font-mono text-muted-foreground ml-auto flex items-center gap-1">
                <Layers size={12} className="text-primary" />
                Phase: <strong className="text-foreground">{task.groupId}</strong>
              </span>
            )}
          </div>

          <DialogTitle className="font-serif text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug">
            {task.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Task details for {task.id}: {task.title}
          </DialogDescription>
        </DialogHeader>

        {/* Task Description / Scope */}
        <div>
          <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">
            Scope & Acceptance Criteria
          </h4>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans">
            {task.description ? task.description : (
              <span className="italic text-muted-foreground">No description provided for this task.</span>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border border-border/70 bg-card/60 p-3 text-xs">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
              Assigned Worktree
            </span>
            <span className="font-mono text-[11px] flex items-center gap-1.5 text-foreground truncate">
              <GitBranch size={13} className="text-primary shrink-0" />
              {task.worktree || <span className="text-muted-foreground italic">None</span>}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
              Actor / Claimed By
            </span>
            <span className="font-mono text-[11px] flex items-center gap-1.5 text-foreground truncate">
              <User size={13} className="text-primary shrink-0" />
              {actorName || <span className="text-muted-foreground italic">Unassigned</span>}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
              Lock / Lease
            </span>
            <span className="font-mono text-[11px] flex items-center gap-1.5 text-foreground truncate">
              <Lock size={13} className="text-muted-foreground shrink-0" />
              {lockedTime ? (
                <span>{new Date(lockedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              ) : (
                <span className="text-muted-foreground italic">Unlocked</span>
              )}
            </span>
          </div>
        </div>

        {/* Dependencies (dependsOn) */}
        {task.dependsOn && task.dependsOn.length > 0 && (
          <div>
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5 font-semibold">
              <LinkIcon size={12} className="text-primary" />
              Dependencies ({task.dependsOn.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {task.dependsOn.map((depId) => {
                const depTask = allTasks.find((t) => t.id === depId);
                const isDepDone = depTask?.status === 'done';
                return (
                  <button
                    key={depId}
                    type="button"
                    onClick={() => {
                      if (depTask && onSelectTask) {
                        onSelectTask(depTask);
                      }
                    }}
                    disabled={!depTask || !onSelectTask}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all ${
                      isDepDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted/60 border-border/70 text-foreground/80 hover:border-primary/50 cursor-pointer'
                    }`}
                    title={depTask ? `${depTask.title} (${depTask.status})` : 'Dependency'}
                  >
                    {isDepDone ? <Check size={11} className="text-emerald-500" /> : <Clock size={11} className="text-amber-500" />}
                    <span>{depId}</span>
                    {depTask && (
                      <span className="text-[9px] uppercase px-1 rounded bg-background/60 text-muted-foreground">
                        {depTask.status}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Blockers */}
        {task.blockers && task.blockers.length > 0 && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1.5 font-semibold">
              <AlertCircle size={13} />
              Blockers ({task.blockers.length})
            </h4>
            <p className="text-xs text-rose-600 dark:text-rose-300 font-mono">
              Waiting on: {task.blockers.join(' • ')}
            </p>
          </div>
        )}

        {/* Affected Files */}
        {task.files && task.files.length > 0 && (
          <div>
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5 font-semibold">
              <FileCode size={12} className="text-primary" />
              Target Files ({task.files.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {task.files.map((file, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 font-mono text-[11px] bg-muted/60 text-foreground/85 px-2 py-0.5 rounded border border-border/70"
                >
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Requirements References */}
        {task.requirementsRef && task.requirementsRef.length > 0 && (
          <div>
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">
              Requirements References
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {task.requirementsRef.map((ref, i) => (
                <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                  {ref}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Verification and Security Notes */}
        {(task.notes?.security || task.notes?.testing || task.submissionNote) && (
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Implementation & Verification Notes
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {task.notes?.security && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                  <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 mb-1 font-mono text-[10px]">
                    <Shield size={12} />
                    Security Assessment
                  </span>
                  <p className="text-muted-foreground text-[11px]">{task.notes.security}</p>
                </div>
              )}
              {task.notes?.testing && (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
                  <span className="flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 mb-1 font-mono text-[10px]">
                    <TestTube size={12} />
                    Testing Protocol
                  </span>
                  <p className="text-muted-foreground text-[11px]">{task.notes.testing}</p>
                </div>
              )}
            </div>

            {task.submissionNote && (
              <div className="rounded-lg border border-border/70 bg-accent/30 p-3 text-xs">
                <span className="text-[10px] font-mono uppercase tracking-wider text-foreground font-semibold block mb-1">
                  Submission Notes for Review
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed whitespace-pre-wrap">
                  {task.submissionNote}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Quick Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-border/70 mt-2">
          <div className="text-[11px] font-mono text-muted-foreground">
            Revision {task.revision}
          </div>

          <div className="flex items-center gap-2">
            {task.status === 'todo' && task.availability === 'available' && onClaim && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onClaim(task);
                }}
                className="gap-1.5"
              >
                <Sparkles size={13} />
                Claim Task
              </Button>
            )}

            {task.status === 'in-progress' && onSubmitReview && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onSubmitReview(task);
                }}
                className="gap-1.5"
              >
                Submit for Review
              </Button>
            )}

            {task.status === 'to-review' && (
              <div className="flex items-center gap-2">
                {onApprove && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      onOpenChange(false);
                      onApprove(task);
                    }}
                  >
                    <CheckCheck size={14} />
                    Verify & Approve
                  </Button>
                )}
                {onRequestChanges && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                    onClick={() => {
                      onOpenChange(false);
                      onRequestChanges(task);
                    }}
                  >
                    <RotateCcw size={14} />
                    Request Changes
                  </Button>
                )}
              </div>
            )}

            {task.status === 'done' && (
              <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={15} />
                <span>Verified Complete</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
