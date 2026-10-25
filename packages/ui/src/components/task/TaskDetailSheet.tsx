import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListComments,
  useCreateComment,
  useResolveComment,
  getListCommentsQueryKey,
  type Task,
  type Comment,
} from '@workspace/api-client-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Send,
  SlidersHorizontal,
  MessageSquare,
  Paperclip,
  BookmarkCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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
};

export interface TaskDetailSheetProps {
  task: TaskDetailItem | null;
  specId?: string;
  initialTab?: 'overview' | 'dependencies' | 'files' | 'notes' | 'comments';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTasks?: Task[];
  onSelectTask?: (task: Task) => void;
  onClaim?: (task: Task, worktree?: string, actor?: string) => void;
  onSubmitReview?: (task: Task, note?: string) => void;
  onApprove?: (task: Task, note?: string) => void;
  onRequestChanges?: (task: Task, note?: string) => void;
  onSetStatus?: (task: Task, status: Task['status']) => void;
}

export function TaskDetailSheet({
  task,
  specId,
  initialTab,
  open,
  onOpenChange,
  allTasks = [],
  onSelectTask,
  onClaim,
  onSubmitReview,
  onApprove,
  onRequestChanges,
  onSetStatus,
}: TaskDetailSheetProps) {
  // Local form state for inline actions without window.prompt
  const [worktreeInput, setWorktreeInput] = useState('');
  const [actorInput, setActorInput] = useState('human');
  const [submitNoteInput, setSubmitNoteInput] = useState('');
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [showAdvancedClaim, setShowAdvancedClaim] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'dependencies' | 'files' | 'notes' | 'comments'>(
    initialTab || 'overview'
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, task]);

  const resolvedSpecId = React.useMemo(() => {
    if (specId) return specId;
    if ((task as any)?.specId) return (task as any).specId;
    if ((task as any)?.featureId) return (task as any).featureId;
    const urlSpec = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('spec') : null;
    if (urlSpec && urlSpec !== 'all') return urlSpec;
    return 'demo-spec';
  }, [specId, task]);

  const queryClient = useQueryClient();
  const commentsQuery = useListComments({ query: { queryKey: getListCommentsQueryKey() } });
  const allComments = (commentsQuery.data || []) as any[];
  const taskComments = allComments.filter(
    (c) => c.target_id === task?.id || (c.target_type === 'task' && c.target_id === task?.id)
  );

  const [newCommentText, setNewCommentText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; path: string; is_temp: boolean }>>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  const resolveCommentMutation = useResolveComment();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !resolvedSpecId) return;

    const files = Array.from(fileList);
    setIsUploadingAttachment(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('target', 'temp');
        formData.append('specId', resolvedSpecId);

        const res = await fetch(`/api/specs/${encodeURIComponent(resolvedSpecId)}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Upload failed for "${file.name}"`);
        }

        const data = await res.json();
        return {
          name: data.filename || file.name,
          path: data.path,
          is_temp: true,
          size: file.size,
        };
      });

      const uploaded = await Promise.all(uploadPromises);
      setAttachedFiles((prev) => [...prev, ...uploaded]);
      toast({
        title: `${uploaded.length} ${uploaded.length === 1 ? 'attachment' : 'attachments'} uploaded`,
        description: `Attached ${uploaded.map((u) => `"${u.name}"`).join(', ')} as reference.`,
      });
    } catch (err: unknown) {
      toast({ title: 'Upload error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setIsUploadingAttachment(false);
      e.target.value = '';
    }
  };

  const handleAddComment = () => {
    if ((!newCommentText.trim() && attachedFiles.length === 0) || !task) return;
    const instruction = newCommentText.trim() || `Attached reference: ${attachedFiles.map((a) => a.name).join(', ')}`;

    fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_file: `specs/${resolvedSpecId}/tasks.yaml`,
        target_type: 'task',
        target_id: task.id,
        instruction,
        author: 'human',
        attachments: attachedFiles,
      }),
    })
      .then((res) => {
        if (res.ok) {
          setNewCommentText('');
          setAttachedFiles([]);
          void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
          toast({ title: 'Comment added', description: 'Your comment and attachments were saved.' });
        }
      })
      .catch((err) => {
        toast({ title: 'Failed to add comment', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      });
  };

  const handlePreserveAttachment = async (filename: string, filepath?: string) => {
    if (!resolvedSpecId) return;
    try {
      const res = await fetch(`/api/preserve-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, filepath, specId: resolvedSpecId }),
      });
      if (res.ok) {
        toast({ title: 'Preserved in repo', description: `Moved ${filename} to permanent references.` });
        void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: ['spec-files', resolvedSpecId] });
      } else {
        toast({ title: 'Failed to preserve file', variant: 'destructive' });
      }
    } catch (err: unknown) {
      toast({ title: 'Preserve error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (task) {
      setWorktreeInput(task.worktree || `worktree/${task.id}`);
      setActorInput(task.actor || task.claimedBy || 'human');
      setSubmitNoteInput('');
      setReviewNoteInput('');
      setShowAdvancedClaim(false);
      setActiveTab(initialTab || 'overview');
      setNewCommentText('');
      setAttachedFiles([]);
    }
  }, [task?.id, task?.status]);

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

  const handleClaimClick = () => {
    const wt = worktreeInput.trim() || task.worktree || `worktree/${task.id}`;
    const act = actorInput.trim() || 'human';
    onClaim?.(task, wt, act);
  };

  const handleSubmitClick = () => {
    const note = submitNoteInput.trim() || 'Submitted for review';
    onSubmitReview?.(task, note);
  };

  const handleApproveClick = () => {
    const note = reviewNoteInput.trim() || 'Approved by human reviewer';
    onApprove?.(task, note);
  };

  const handleRejectClick = () => {
    const note = reviewNoteInput.trim() || 'Changes requested';
    onRequestChanges?.(task, note);
  };

  const handleStatusSelect = async (newStatus: Task['status']) => {
    if (!task || newStatus === task.status) return;
    if (onSetStatus) {
      onSetStatus(task, newStatus);
    } else {
      const originalTaskId = (task as any).originalId || task.id;
      const specId = (task as any).specId || (task as any).spec_id || task.groupId || task.featureId;
      const url = specId
        ? `/api/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(originalTaskId)}/transition`
        : `/api/tasks/${encodeURIComponent(originalTaskId)}/transition`;
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_status', status: newStatus, actor: 'human' }),
        });
      } catch {}
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col h-full bg-background border-l border-border/80 shadow-2xl"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border/70 space-y-3 bg-card/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold bg-muted text-foreground px-2 py-0.5 rounded border border-border/60">
              {task.id}
            </span>
            <Badge
              variant="outline"
              className={`font-mono text-[10px] uppercase tracking-wider ${getPriorityBadgeClass(task.priority)}`}
            >
              {task.priority} priority
            </Badge>

            {/* Manual Status Selector Dropdown */}
            <Select
              value={task.status}
              onValueChange={(val) => handleStatusSelect(val as Task['status'])}
            >
              <SelectTrigger
                className={`h-6 text-[10px] font-mono uppercase tracking-wider px-2 py-0 border ${getStatusBadgeClass(task.status)} font-semibold shadow-xs gap-1`}
                aria-label="Change task status"
                data-testid="select-task-status"
              >
                <SelectValue placeholder={task.status.replace('-', ' ')} />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="todo" className="text-xs font-mono uppercase">
                  To Do
                </SelectItem>
                <SelectItem value="in-progress" className="text-xs font-mono uppercase">
                  In Progress
                </SelectItem>
                <SelectItem value="to-review" className="text-xs font-mono uppercase">
                  To Review
                </SelectItem>
                <SelectItem value="done" className="text-xs font-mono uppercase">
                  Done
                </SelectItem>
              </SelectContent>
            </Select>
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

          <SheetTitle className="font-serif text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug">
            {task.title}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Task details and controls for {task.id}: {task.title}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content Body */}
        <ScrollArea className="flex-1 p-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="space-y-5"
          >
            <TabsList className="grid grid-cols-5 w-full bg-muted/70 p-1">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="dependencies" className="text-xs">
                Deps {task.dependsOn?.length ? `(${task.dependsOn.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="files" className="text-xs">
                Files {task.files?.length ? `(${task.files.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
              <TabsTrigger value="comments" className="text-xs">
                Comments {taskComments.length ? `(${taskComments.length})` : ''}
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: OVERVIEW */}
            <TabsContent value="overview" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Description */}
              <div>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">
                  Scope & Acceptance Criteria
                </h4>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans">
                  {task.description ? (
                    task.description
                  ) : (
                    <span className="italic text-muted-foreground">No description provided for this task.</span>
                  )}
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 text-xs">
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

              {/* Parent Task ID */}
              {task.parentId && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Parent Task</span>
                  <Badge variant="outline" className="font-mono text-xs">{task.parentId}</Badge>
                </div>
              )}

              {/* Action Area for Claim or Submit */}
              <div className="rounded-xl border border-border/80 bg-accent/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
                    Workflow Actions
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Status:
                    </span>
                    <Select
                      value={task.status}
                      onValueChange={(val) => handleStatusSelect(val as Task['status'])}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs font-mono uppercase tracking-wider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="todo" className="text-xs font-mono uppercase">To Do</SelectItem>
                        <SelectItem value="in-progress" className="text-xs font-mono uppercase">In Progress</SelectItem>
                        <SelectItem value="to-review" className="text-xs font-mono uppercase">To Review</SelectItem>
                        <SelectItem value="done" className="text-xs font-mono uppercase">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Claim Options */}
                {task.status === 'todo' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Ready to be claimed by a collaborator or agent.</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => setShowAdvancedClaim(!showAdvancedClaim)}
                      >
                        <SlidersHorizontal size={12} />
                        {showAdvancedClaim ? 'Hide options' : 'Options'}
                      </Button>
                    </div>

                    {showAdvancedClaim && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/60">
                        <div>
                          <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                            Actor / Assignee
                          </label>
                          <Input
                            value={actorInput}
                            onChange={(e) => setActorInput(e.target.value)}
                            placeholder="human or agent-id"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                            Worktree Path
                          </label>
                          <Input
                            value={worktreeInput}
                            onChange={(e) => setWorktreeInput(e.target.value)}
                            placeholder={`worktree/${task.id}`}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* In-Progress Submission Note */}
                {task.status === 'in-progress' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block">
                      Submission / Verification Note (Optional)
                    </label>
                    <Textarea
                      value={submitNoteInput}
                      onChange={(e) => setSubmitNoteInput(e.target.value)}
                      placeholder="Describe what changed and how verification was performed..."
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                )}

                {/* To-Review Verification Note */}
                {task.status === 'to-review' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block">
                      Review Feedback / Verification Note (Optional)
                    </label>
                    <Textarea
                      value={reviewNoteInput}
                      onChange={(e) => setReviewNoteInput(e.target.value)}
                      placeholder="Enter review notes, confirmation details, or requested changes..."
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: DEPENDENCIES & BLOCKERS */}
            <TabsContent value="dependencies" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Blockers Alert */}
              {task.blockers && task.blockers.length > 0 && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3.5 space-y-1">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5 font-semibold">
                    <AlertCircle size={13} />
                    Unmet Dependencies / Blockers ({task.blockers.length})
                  </h4>
                  <p className="text-xs text-rose-600 dark:text-rose-300 font-mono">
                    Waiting on: {task.blockers.join(' • ')}
                  </p>
                </div>
              )}

              {/* Dependencies List */}
              <div>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 font-semibold">
                  <LinkIcon size={12} className="text-primary" />
                  Prerequisite Tasks ({task.dependsOn?.length || 0})
                </h4>

                {task.dependsOn && task.dependsOn.length > 0 ? (
                  <div className="grid gap-2">
                    {task.dependsOn.map((depId) => {
                      const depTask = allTasks.find((t) => t.id === depId);
                      const isDepDone = depTask?.status === 'done';
                      return (
                        <div
                          key={depId}
                          onClick={() => depTask && onSelectTask?.(depTask)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                            depTask ? 'cursor-pointer hover:border-primary/50' : 'opacity-80'
                          } ${
                            isDepDone
                              ? 'bg-emerald-500/5 border-emerald-500/30'
                              : 'bg-card border-border/70'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isDepDone ? (
                              <Check size={14} className="text-emerald-500 shrink-0" />
                            ) : (
                              <Clock size={14} className="text-amber-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-foreground block">{depId}</span>
                              {depTask && (
                                <span className="text-[11px] text-muted-foreground truncate block">
                                  {depTask.title}
                                </span>
                              )}
                            </div>
                          </div>
                          {depTask && (
                            <Badge
                              variant="outline"
                              className={`font-mono text-[9px] uppercase ${getStatusBadgeClass(depTask.status)}`}
                            >
                              {depTask.status}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    No prerequisite dependencies declared. This task is ready to be started immediately.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: FILES & REQUIREMENTS */}
            <TabsContent value="files" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Target Files */}
              <div>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 font-semibold">
                  <FileCode size={12} className="text-primary" />
                  Target Files ({task.files?.length || 0})
                </h4>
                {task.files && task.files.length > 0 ? (
                  <div className="space-y-1.5">
                    {task.files.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between font-mono text-[11px] bg-muted/40 p-2 rounded-md border border-border/60"
                      >
                        <span className="truncate text-foreground/90">{file}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    No specific file paths associated with this task.
                  </div>
                )}
              </div>

              <Separator />

              {/* Reference Documents & Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <Paperclip size={12} className="text-primary" />
                    Reference Documents & Attachments ({attachedFiles.length})
                  </h4>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-all shadow-2xs">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploadingAttachment}
                    />
                    <Upload size={12} className="text-primary" />
                    <span>{isUploadingAttachment ? 'Uploading...' : 'Upload Reference'}</span>
                  </label>
                </div>
                {attachedFiles.length > 0 ? (
                  <div className="space-y-1.5">
                    {attachedFiles.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between font-mono text-[11px] bg-muted/40 p-2 rounded-md border border-border/60"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Paperclip size={12} className="text-primary shrink-0" />
                          <span className="truncate text-foreground/90">{att.name}</span>
                          {att.is_temp && (
                            <Badge variant="outline" className="font-mono text-[9px] text-amber-600 border-amber-500/30">
                              temp
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] gap-1 hover:text-emerald-600"
                          onClick={() => handlePreserveAttachment(att.name)}
                        >
                          <BookmarkCheck size={11} className="text-emerald-600" />
                          Keep
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    No reference files uploaded yet. Click above to attach a document.
                  </div>
                )}
              </div>

              <Separator />

              {/* Requirements References */}
              <div>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                  Requirements References ({task.requirementsRef?.length || 0})
                </h4>
                {task.requirementsRef && task.requirementsRef.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {task.requirementsRef.map((ref, i) => (
                      <Badge key={i} variant="secondary" className="font-mono text-[11px] px-2.5 py-1">
                        {ref}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    No requirements anchors referenced.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 4: NOTES */}
            <TabsContent value="notes" className="space-y-4 m-0 focus-visible:outline-none">
              {/* Security and Testing Cards */}
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400 mb-1.5 font-mono text-[11px]">
                    <Shield size={13} />
                    Security Assessment
                  </span>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {task.notes?.security || 'No security constraints or hazards documented for this task.'}
                  </p>
                </div>

                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3.5 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-400 mb-1.5 font-mono text-[11px]">
                    <TestTube size={13} />
                    Testing Protocol
                  </span>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {task.notes?.testing || 'No specific automated test requirements specified.'}
                  </p>
                </div>

                {task.submissionNote && (
                  <div className="rounded-lg border border-border/70 bg-accent/30 p-3.5 text-xs">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-foreground font-semibold block mb-1">
                      Recorded Submission Notes
                    </span>
                    <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
                      {task.submissionNote}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 5: COMMENTS & REFERENCES */}
            <TabsContent value="comments" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <MessageSquare size={12} className="text-primary" />
                    Task Comments & Feedback ({taskComments.length})
                  </h4>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Visible to AI agents & reviewers
                  </span>
                </div>

                {/* Upload Banner */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-muted/40">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Upload size={13} className="text-primary" />
                      Attach Reference Documents
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Upload diagrams, specs, or logs to include with your feedback.
                    </p>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-all shadow-xs hover:border-primary/50">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploadingAttachment}
                    />
                    <Upload size={12} className="text-primary" />
                    <span>{isUploadingAttachment ? 'Uploading...' : 'Upload Document'}</span>
                  </label>
                </div>

                {/* Add Comment Box */}
                <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2.5">
                  <Textarea
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Add an instruction, question, or note for this task..."
                    className="text-xs min-h-[70px] resize-none bg-background"
                  />

                  {/* Attached Files List */}
                  {attachedFiles.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground block">
                        Attached Files ({attachedFiles.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {attachedFiles.map((att, i) => (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-muted border border-border/80"
                          >
                            <Paperclip size={10} className="text-primary" />
                            <span className="max-w-[120px] truncate">{att.name}</span>
                            <button
                              type="button"
                              onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border/70 bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors shadow-2xs">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploadingAttachment}
                      />
                      <Paperclip size={12} className="text-primary" />
                      <span>{isUploadingAttachment ? 'Uploading...' : 'Attach File'}</span>
                    </label>

                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!newCommentText.trim() && attachedFiles.length === 0}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Send size={12} />
                      Post Comment
                    </Button>
                  </div>
                </div>

                {/* Comments List */}
                {taskComments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                    <MessageSquare size={20} className="mx-auto mb-2 text-primary opacity-40" />
                    No comments on this task yet. Add feedback or guidelines above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {taskComments.map((cmt) => (
                      <div
                        key={cmt.id}
                        className={`rounded-lg border p-3 text-xs space-y-2 ${
                          cmt.status === 'addressed'
                            ? 'bg-muted/30 border-border/50 opacity-75'
                            : 'bg-card border-border/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`font-mono text-[9px] uppercase ${
                                cmt.author === 'agent'
                                  ? 'bg-sky-500/10 text-sky-600 border-sky-500/30'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              }`}
                            >
                              {cmt.author}
                            </Badge>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {cmt.created_at ? new Date(cmt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {cmt.status === 'addressed' ? (
                              <Badge variant="secondary" className="font-mono text-[9px] text-emerald-600">
                                Addressed
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-emerald-600"
                                onClick={() => {
                                  resolveCommentMutation.mutate(
                                    { commentId: cmt.id },
                                    {
                                      onSuccess: () => {
                                        void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
                                        toast({ title: 'Comment resolved' });
                                      },
                                    }
                                  );
                                }}
                              >
                                <Check size={11} className="mr-1" />
                                Resolve
                              </Button>
                            )}
                          </div>
                        </div>

                        <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {cmt.instruction}
                        </p>

                        {/* Attachments if any */}
                        {cmt.attachments && cmt.attachments.length > 0 && (
                          <div className="pt-1 space-y-1 border-t border-border/50">
                            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider block">
                              Attached References
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {cmt.attachments.map((att: { name?: string; path?: string; is_temp?: boolean } | string, i: number) => {
                                const attPath = typeof att === 'string' ? att : att.path || att.name || '';
                                const attName = typeof att === 'string' ? att.split('/').pop() : att.name || att.path?.split('/').pop();
                                const isTemp = typeof att === 'object' ? Boolean(att.is_temp || att.path?.includes('.temp')) : att.includes('.temp');
                                return (
                                  <div
                                    key={i}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-muted/60 border border-border/60"
                                  >
                                    <Paperclip size={10} className="text-primary" />
                                    <a
                                      href={`/api/files/raw?path=${encodeURIComponent(attPath)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline font-mono truncate max-w-[140px]"
                                      title={attName}
                                    >
                                      {attName}
                                    </a>
                                    {isTemp && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-4 px-1 text-[9px] text-amber-600 dark:text-amber-400 hover:text-emerald-600 font-sans"
                                        onClick={() => handlePreserveAttachment(attName || 'attachment', attPath)}
                                        title="Keep in permanent repository references"
                                      >
                                        <BookmarkCheck size={9} className="mr-0.5" />
                                        Keep
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        {/* Action Footer */}
        <SheetFooter className="p-4 border-t border-border/70 bg-card/60 flex flex-row items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-muted-foreground">
            Revision {task.revision}
          </div>

          <div className="flex items-center gap-2">
            {task.status === 'todo' && task.availability === 'available' && onClaim && (
              <Button
                size="sm"
                onClick={handleClaimClick}
                className="gap-1.5"
              >
                <Sparkles size={13} />
                Claim Task
              </Button>
            )}

            {task.status === 'in-progress' && onSubmitReview && (
              <Button
                size="sm"
                onClick={handleSubmitClick}
                className="gap-1.5"
              >
                <Send size={13} />
                Submit for Review
              </Button>
            )}

            {task.status === 'to-review' && (
              <div className="flex items-center gap-2">
                {onRequestChanges && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                    onClick={handleRejectClick}
                  >
                    <RotateCcw size={14} />
                    Request Changes
                  </Button>
                )}
                {onApprove && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleApproveClick}
                  >
                    <CheckCheck size={14} />
                    Approve (Human)
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
