import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  User,
  Bot,
  Send,
  Trash2,
  Edit3,
  Check,
  X,
  ExternalLink,
  FileText,
  Compass,
  ListTodo,
  Plus,
  Paperclip,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useListComments,
  getListCommentsQueryKey,
  useListFeatures,
  getListFeaturesQueryKey,
  getGetDashboardQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { DocumentInspector } from '@/components/inspector/DocumentInspector';

export interface CommentItem {
  id: string;
  documentId?: string;
  target_file?: string;
  target_type?: 'document' | 'task' | 'general' | 'spec' | 'code' | 'file';
  target_id?: string | null;
  status: 'pending' | 'addressed' | 'resolved' | 'deleted';
  author: 'human' | 'agent';
  created_at?: string;
  createdAt?: string | Date;
  selectedText?: string;
  startLine?: number;
  endLine?: number;
  anchor?: {
    start_line: number;
    end_line: number;
    anchor_text: string;
    context_before?: string;
  } | null;
  instruction: string;
  resolutionNote?: string | null;
  resolution_note?: string | null;
  resolved_at?: string;
  resolved_by?: string;
  attachments?: Array<{ name: string; path: string; size?: number }>;
}

export function CommentsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const activeCommentsQuery = useListComments({
    query: { queryKey: getListCommentsQueryKey() },
  });

  const historyCommentsQuery = useQuery<CommentItem[]>({
    queryKey: ['/api/comments/history'],
    queryFn: async () => {
      const res = await fetch('/api/comments/history');
      if (!res.ok) throw new Error('Failed to load resolved comments history');
      return res.json();
    },
  });

  const featuresQuery = useListFeatures({
    query: { queryKey: getListFeaturesQueryKey() },
  });

  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'resolved' | 'deleted'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'general' | 'steering' | 'spec' | 'task'>('all');
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<'all' | 'human' | 'agent'>('all');

  // Composer state
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [author, setAuthor] = useState<'human' | 'agent'>('human');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; path: string; is_temp?: boolean; size?: number }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit / Resolve states
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Inspecting Document Overlay
  const [inspectingDocId, setInspectingDocId] = useState<string | null>(null);

  // Merge and deduplicate active + history comments
  const allComments: CommentItem[] = useMemo(() => {
    const active = (activeCommentsQuery.data || []) as CommentItem[];
    const history = historyCommentsQuery.data || [];

    const map = new Map<string, CommentItem>();
    for (const c of history) {
      map.set(c.id, {
        ...c,
        status: (c.status as string) === 'deleted' ? 'deleted' : 'resolved',
      });
    }
    for (const c of active) {
      map.set(c.id, {
        ...c,
        status:
          (c.status as string) === 'addressed'
            ? 'resolved'
            : (c.status as string) === 'deleted'
            ? 'deleted'
            : c.status || 'pending',
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      const tA = new Date(a.created_at || a.createdAt || 0).getTime();
      const tB = new Date(b.created_at || b.createdAt || 0).getTime();
      return tB - tA;
    });
  }, [activeCommentsQuery.data, historyCommentsQuery.data]);

  // Derived filter list
  const filteredComments = useMemo(() => {
    return allComments.filter((c) => {
      // 1. Status Filter
      if (statusFilter === 'pending' && c.status !== 'pending') return false;
      if (statusFilter === 'resolved' && c.status !== 'resolved') return false;
      if (statusFilter === 'deleted' && c.status !== 'deleted') return false;

      // 2. Author Filter
      if (authorFilter !== 'all' && c.author !== authorFilter) return false;

      // Determine category
      const targetFile = c.target_file || c.documentId || '';
      const isGeneral = c.target_type === 'general' || targetFile === 'general' || (!targetFile && !c.target_id);
      const isSteering = targetFile.includes('steering/') || ['product.md', 'tech.md', 'structure.md'].some((s) => targetFile.includes(s));
      const isTask = c.target_type === 'task' || Boolean(c.target_id) || targetFile.includes('tasks.yaml');
      const isSpec = !isGeneral && !isSteering && (c.target_type === 'spec' || targetFile.includes('specs/') || (!isTask && targetFile.length > 0));

      // 3. Type Filter
      if (typeFilter === 'general' && !isGeneral) return false;
      if (typeFilter === 'steering' && !isSteering) return false;
      if (typeFilter === 'task' && !isTask) return false;
      if (typeFilter === 'spec' && !isSpec) return false;

      // 4. Spec Filter
      if (specFilter !== 'all') {
        const matchesSpec = targetFile.includes(specFilter) || c.target_id?.startsWith(specFilter);
        if (!matchesSpec) return false;
      }

      // 5. Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = [
          c.instruction,
          c.selectedText,
          c.anchor?.anchor_text,
          c.resolutionNote,
          c.resolution_note,
          targetFile,
          c.target_id,
          c.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [allComments, statusFilter, typeFilter, specFilter, authorFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const total = allComments.length;
    const pending = allComments.filter((c) => c.status === 'pending').length;
    const resolved = allComments.filter((c) => c.status === 'resolved' || (c.status as string) === 'addressed').length;
    const deleted = allComments.filter((c) => c.status === 'deleted').length;
    return { total, pending, resolved, deleted };
  }, [allComments]);

  // Handle File Upload for attachments
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setIsUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('target', 'temp');

        const res = await fetch('/api/upload', {
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
        title: `${uploaded.length} ${uploaded.length === 1 ? 'file' : 'files'} attached`,
        description: `Attached ${uploaded.map((u) => `"${u.name}"`).join(', ')}.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Upload error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Handle Create General Comment
  const handleCreateGeneralComment = async () => {
    if (!instruction.trim() && attachedFiles.length === 0) {
      toast({ title: 'Please enter a directive note or attach reference files', variant: 'destructive' });
      return;
    }

    const commentText = instruction.trim() || `Refer attached references: ${attachedFiles.map((a) => a.name).join(', ')}`;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'general',
          target_file: 'general',
          target_id: null,
          instruction: commentText,
          author,
          attachments: attachedFiles,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit directive');
      }

      setInstruction('');
      setAttachedFiles([]);
      setComposerExpanded(false);
      toast({
        title: 'Directive Queued',
        description: 'New workspace directive added to queue.',
      });

      void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['/api/comments/history'] });
    } catch (err: unknown) {
      toast({
        title: 'Submission Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Resolve Comment
  const handleResolve = async (commentId: string) => {
    setIsResolving(true);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: resolveNote.trim() || 'Resolved by user',
          purge: true,
        }),
      });

      if (!res.ok) throw new Error('Failed to resolve comment');

      setResolvingCommentId(null);
      setResolveNote('');
      toast({ title: 'Resolved', description: 'Moved to resolved history.' });

      void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['/api/comments/history'] });
    } catch (err: unknown) {
      toast({
        title: 'Resolve Failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  // Handle Update Comment Instruction
  const handleUpdate = async (commentId: string) => {
    if (!editText.trim()) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: editText.trim() }),
      });

      if (!res.ok) throw new Error('Failed to update comment');

      setEditingCommentId(null);
      setEditText('');
      toast({ title: 'Comment Updated' });

      void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['/api/comments/history'] });
    } catch (err: unknown) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Delete Comment
  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Delete this comment permanently?')) return;
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete comment');

      toast({ title: 'Comment Deleted' });
      void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['/api/comments/history'] });
    } catch (err: unknown) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  // Target Click Handler
  const handleOpenTarget = (comment: CommentItem) => {
    const targetFile = comment.target_file || comment.documentId || '';
    if (comment.target_type === 'task' || comment.target_id) {
      const specMatch = targetFile.match(/specs\/([^/]+)/);
      const specId = specMatch ? specMatch[1] : featuresQuery.data?.[0]?.id || 'all';
      setLocation(`/tasks?spec=${encodeURIComponent(specId)}&taskId=${encodeURIComponent(comment.target_id || '')}`);
      return;
    }

    if (targetFile && targetFile !== 'general') {
      setInspectingDocId(targetFile);
    }
  };

  const formatDate = (dateStr?: string | Date) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return String(dateStr);
    }
  };

  const hasActiveFilters = search || typeFilter !== 'all' || specFilter !== 'all' || authorFilter !== 'all';

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Sleek Minimal Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              Directives & Comments
            </h1>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {counts.pending} pending
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Centralized queue of human and agent feedback across steering, specs, and tasks.
          </p>
        </div>

        {/* Status Pill Switcher */}
        <div className="mt-3 flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs sm:mt-0">
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
              statusFilter === 'pending'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock size={12} className={statusFilter === 'pending' ? 'text-amber-500' : ''} />
            <span>Pending</span>
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
              {counts.pending}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare size={12} />
            <span>All</span>
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
              {counts.total}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
              statusFilter === 'resolved'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 size={12} className={statusFilter === 'resolved' ? 'text-emerald-500' : ''} />
            <span>Resolved</span>
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
              {counts.resolved}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('deleted')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
              statusFilter === 'deleted'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Trash2 size={12} className={statusFilter === 'deleted' ? 'text-rose-500' : ''} />
            <span>Deleted</span>
            <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px]">
              {counts.deleted}
            </span>
          </button>
        </div>
      </div>

      {/* Modern Integrated Directive Composer */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-3 shadow-xs transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
        {!composerExpanded ? (
          <div
            onClick={() => setComposerExpanded(true)}
            className="flex cursor-text items-center justify-between text-xs text-muted-foreground hover:text-foreground/80 py-1 px-1"
          >
            <div className="flex items-center gap-2">
              <Plus size={14} className="text-primary" />
              <span>Queue a general directive or workspace instruction...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Press to compose
            </kbd>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateGeneralComment();
                }
              }}
              placeholder="Enter directive, review note, or guidance for agent / team... (Ctrl+Enter to post)"
              rows={3}
              className="resize-y border-0 bg-transparent p-1 text-xs font-sans leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
              autoFocus
            />

            {/* Attached files preview chips */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {attachedFiles.map((f, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                  >
                    <Paperclip size={11} className="text-primary" />
                    <span className="truncate max-w-[180px]">{f.name}</span>
                    {f.size ? (
                      <span className="text-[9px] text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="ml-1 text-muted-foreground hover:text-rose-500"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Composer Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
              <div className="flex items-center gap-2">
                {/* Author Segment Toggle */}
                <div className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthor('human')}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      author === 'human'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <User size={11} className="text-blue-500" />
                    <span>Human</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthor('agent')}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      author === 'agent'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Bot size={11} className="text-purple-500" />
                    <span>Agent</span>
                  </button>
                </div>

                {/* Attach File Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Paperclip size={12} />
                  <span>{isUploading ? 'Uploading…' : 'Attach'}</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setComposerExpanded(false);
                    setInstruction('');
                    setAttachedFiles([]);
                  }}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateGeneralComment}
                  disabled={isSubmitting || (!instruction.trim() && attachedFiles.length === 0)}
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  <Send size={11} />
                  <span>{isSubmitting ? 'Posting…' : 'Post Directive'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Streamlined Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instructions, code snippets, files, comments..."
            className="h-8 pl-8 text-xs bg-background/80"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Target Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/40"
          >
            <option value="all">All Targets</option>
            <option value="general">Directives</option>
            <option value="steering">Steering</option>
            <option value="spec">Specs</option>
            <option value="task">Tasks</option>
          </select>

          {/* Spec Scope Filter */}
          <select
            value={specFilter}
            onChange={(e) => setSpecFilter(e.target.value)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/40 max-w-[150px] truncate"
          >
            <option value="all">All Specs</option>
            {(featuresQuery.data || []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Author Filter */}
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/40"
          >
            <option value="all">All Authors</option>
            <option value="human">Human</option>
            <option value="agent">Agent</option>
          </select>

          {/* Reset button if filtered */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setSpecFilter('all');
                setAuthorFilter('all');
              }}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Reset filters"
            >
              <RotateCcw size={12} className="mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Comment Feed */}
      {activeCommentsQuery.isLoading || historyCommentsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : filteredComments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 py-12 px-4 text-center">
          <MessageSquare className="size-8 mx-auto text-muted-foreground/40 mb-2.5" />
          <h3 className="text-sm font-semibold text-foreground">No directives or comments</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {hasActiveFilters
              ? 'No items match your active filters. Try resetting search or scope.'
              : 'Directives and review comments keep human oversight synchronized with agent executions.'}
          </p>
          {!composerExpanded && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setComposerExpanded(true)}
              className="mt-4 h-8 gap-1.5 text-xs"
            >
              <Plus size={12} />
              Add directive
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredComments.map((comment) => {
            const isDeleted = comment.status === 'deleted';
            const isResolved = comment.status === 'resolved';
            const isEditing = editingCommentId === comment.id;
            const isResolvingThis = resolvingCommentId === comment.id;
            const targetFile = comment.target_file || comment.documentId || '';
            const isGeneral = comment.target_type === 'general' || targetFile === 'general' || (!targetFile && !comment.target_id);
            const isSteering = targetFile.includes('steering/') || ['product.md', 'tech.md', 'structure.md'].some((s) => targetFile.includes(s));
            const isTask = comment.target_type === 'task' || Boolean(comment.target_id);

            return (
              <div
                key={comment.id}
                className={`group relative rounded-xl border bg-card transition-all ${
                  isDeleted
                    ? 'border-border/40 bg-card/30 opacity-70 hover:opacity-95'
                    : isResolved
                    ? 'border-border/50 bg-card/40 opacity-75 hover:opacity-100'
                    : 'border-border/80 shadow-xs hover:border-border hover:shadow-sm'
                }`}
              >
                {/* Visual Status Indicator Strip */}
                <div
                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
                    isDeleted ? 'bg-rose-500/50' : isResolved ? 'bg-emerald-500/50' : 'bg-amber-500/80'
                  }`}
                />

                <div className="pl-4 pr-3.5 pt-3 pb-3">
                  {/* Top Header: Author + Target Badge + Time + Action Icons */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {/* Author Pill */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          comment.author === 'agent'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {comment.author === 'agent' ? <Bot size={10} /> : <User size={10} />}
                        <span className="capitalize">{comment.author}</span>
                      </span>

                      {/* Status Badge */}
                      {isDeleted && (
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <Trash2 size={10} />
                          <span>Deleted</span>
                        </span>
                      )}
                      {isResolved && (
                        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={10} />
                          <span>Resolved</span>
                        </span>
                      )}

                      {/* Context Target Link */}
                      {isGeneral ? (
                        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          General Directive
                        </span>
                      ) : isSteering ? (
                        <button
                          type="button"
                          onClick={() => handleOpenTarget(comment)}
                          className="inline-flex items-center gap-1 rounded bg-secondary/70 hover:bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors cursor-pointer"
                        >
                          <Compass size={10} className="text-amber-500" />
                          <span>Steering: {targetFile.replace(/^.*steering\//, '')}</span>
                          <ExternalLink size={8} className="opacity-60" />
                        </button>
                      ) : isTask ? (
                        <button
                          type="button"
                          onClick={() => handleOpenTarget(comment)}
                          className="inline-flex items-center gap-1 rounded bg-secondary/70 hover:bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors cursor-pointer"
                        >
                          <ListTodo size={10} className="text-emerald-500" />
                          <span>Task #{comment.target_id || 'item'}</span>
                          <ExternalLink size={8} className="opacity-60" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenTarget(comment)}
                          className="inline-flex items-center gap-1 rounded bg-secondary/70 hover:bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors cursor-pointer"
                        >
                          <FileText size={10} className="text-sky-500" />
                          <span className="truncate max-w-[150px]">{targetFile}</span>
                          <ExternalLink size={8} className="opacity-60" />
                        </button>
                      )}

                      <span className="text-muted-foreground/40">•</span>
                      <time className="text-[11px] text-muted-foreground">
                        {formatDate(comment.created_at || comment.createdAt)}
                      </time>
                    </div>

                    {/* Quick Card Actions (Visible on hover or mobile) */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!isResolved && !isDeleted && !isResolvingThis && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingCommentId(comment.id);
                            setResolveNote('');
                          }}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                          title="Mark resolved"
                        >
                          <Check size={11} />
                          <span>Resolve</span>
                        </button>
                      )}

                      {!isResolved && !isDeleted && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditText(comment.instruction);
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit instruction"
                        >
                          <Edit3 size={11} />
                        </button>
                      )}

                      {!isDeleted && (
                        <button
                          type="button"
                          onClick={() => handleDelete(comment.id)}
                          className="rounded p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                          title="Delete comment"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Anchored Quote preview if available */}
                  {(comment.selectedText || comment.anchor?.anchor_text) && (
                    <div className="mt-2.5 rounded-md border-l-2 border-primary/40 bg-muted/30 py-1 px-2.5 text-xs font-mono text-muted-foreground">
                      <div className="text-[10px] text-primary/70 mb-0.5">
                        Line {comment.anchor?.start_line || comment.startLine || 1}
                        {comment.anchor?.end_line && comment.anchor.end_line !== (comment.anchor?.start_line || comment.startLine)
                          ? `–${comment.anchor.end_line}`
                          : ''}
                      </div>
                      <p className="italic text-foreground/80 line-clamp-2 mb-0">
                        "{comment.selectedText || comment.anchor?.anchor_text}"
                      </p>
                    </div>
                  )}

                  {/* Comment Body / Instruction */}
                  <div className="mt-2">
                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="text-xs font-mono"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingCommentId(null)}
                            disabled={isSavingEdit}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(comment.id)}
                            disabled={isSavingEdit || !editText.trim()}
                            className="h-7 text-xs"
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${isDeleted ? 'line-through text-muted-foreground' : 'text-foreground/95'}`}>
                        {comment.instruction}
                      </p>
                    )}
                  </div>

                  {/* Attachments preview */}
                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {comment.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={`/${att.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 hover:bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Paperclip size={10} className="text-primary" />
                          <span className="truncate max-w-[160px]">{att.name}</span>
                          {att.size ? (
                            <span className="text-[9px] opacity-60">({Math.round(att.size / 1024)} KB)</span>
                          ) : null}
                          <ExternalLink size={8} className="opacity-50" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Resolution Note if resolved or deleted */}
                  {(isResolved || isDeleted) && (comment.resolutionNote || comment.resolution_note) && (
                    <div className={`mt-2.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground ${
                      isDeleted ? 'border-rose-500/20 bg-rose-500/[.03]' : 'border-emerald-500/20 bg-emerald-500/[.03]'
                    }`}>
                      <div className={`flex items-center gap-1 text-[10px] font-medium ${
                        isDeleted ? 'text-rose-400' : 'text-emerald-500'
                      }`}>
                        {isDeleted ? <Trash2 size={10} /> : <CheckCircle2 size={10} />}
                        <span>{isDeleted ? 'Deleted by user' : 'Resolution'}</span>
                      </div>
                      <p className="mt-0.5 text-foreground/80 pl-3.5 mb-0 text-xs">
                        {comment.resolutionNote || comment.resolution_note}
                      </p>
                    </div>
                  )}

                  {/* Inline Resolve Input */}
                  {isResolvingThis && (
                    <div className="mt-2.5 rounded-lg border border-primary/30 bg-muted/30 p-2.5 space-y-2 animate-in fade-in duration-100">
                      <Input
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="Optional resolution note or outcome summary..."
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleResolve(comment.id);
                          }
                        }}
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResolvingCommentId(null)}
                          disabled={isResolving}
                          className="h-6 px-2 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleResolve(comment.id)}
                          disabled={isResolving}
                          className="h-6 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Check size={10} className="mr-1" />
                          Confirm Resolve
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Inspector Overlay if document target clicked */}
      {inspectingDocId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
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
