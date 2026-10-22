import React, { useState, useRef, useEffect, useMemo, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetDocument,
  getGetDocumentQueryKey,
  useUpdateDocument,
  useApproveDocument,
  useListComments,
  getListCommentsQueryKey,
  useCreateComment,
  useResolveComment,
  getListDocumentsQueryKey,
  getGetDashboardQueryKey,
  type Comment,
} from '@workspace/api-client-react';
import {
  MessageSquarePlus,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Save,
  Check,
  X,
  Sparkles,
  Loader2,
  Clock,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Code2,
  Eye,
  Columns2,
  Pencil,
  Trash2,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DocumentInspectorProps {
  documentId: string;
  onClose?: () => void;
}

export function DocumentInspector({ documentId, onClose }: DocumentInspectorProps) {
  const queryClient = useQueryClient();
  const docQuery = useGetDocument(documentId, {
    query: { queryKey: getGetDocumentQueryKey(documentId) },
  });
  const commentsQuery = useListComments({
    query: { queryKey: getListCommentsQueryKey() },
  });

  const updateMutation = useUpdateDocument();
  const approveMutation = useApproveDocument();
  const createCommentMutation = useCreateComment();
  const resolveCommentMutation = useResolveComment();

  const [content, setContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [startLine, setStartLine] = useState(1);
  const [endLine, setEndLine] = useState(1);
  const [instruction, setInstruction] = useState('');
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(true);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [activeHighlightLine, setActiveHighlightLine] = useState<number | null>(null);

  // New UI controls state
  const [viewMode, setViewMode] = useState<'source' | 'preview' | 'split'>('source');
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentDrawerTab, setCommentDrawerTab] = useState<'active' | 'history'>('active');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [isUpdatingComment, setIsUpdatingComment] = useState(false);
  const [historyComments, setHistoryComments] = useState<Comment[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Floating button state for text selection
  const [floatingButtonPos, setFloatingButtonPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const doc = docQuery.data;

  useEffect(() => {
    if (doc?.content !== undefined) {
      setContent(doc.content);
    }
  }, [doc?.id, doc?.revision, doc?.content]);

  // Handle Escape key to exit expand mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Comments for this document
  const docComments = useMemo(() => {
    return (commentsQuery.data ?? []).filter((c: Comment) => c.documentId === documentId);
  }, [commentsQuery.data, documentId]);

  const unresolvedComments = useMemo(() => {
    return docComments.filter((c: Comment) => c.status !== 'resolved');
  }, [docComments]);

  // Load history comments when tab is 'history'
  useEffect(() => {
    if (commentDrawerTab !== 'history') return;
    let cancelled = false;
    setIsLoadingHistory(true);
    fetch(`/api/comments/history?target_file=${encodeURIComponent(documentId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any) => {
        if (!cancelled) {
          const list: Comment[] = Array.isArray(data) ? data : [];
          const localResolved = docComments.filter((c: Comment) => c.status === 'resolved');
          const merged = [...list];
          for (const lr of localResolved) {
            if (!merged.some((m) => m.id === lr.id)) {
              merged.push(lr);
            }
          }
          setHistoryComments(merged);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryComments(docComments.filter((c: Comment) => c.status === 'resolved'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [commentDrawerTab, documentId, docComments]);

  const canApprove = useMemo(() => {
    if (!doc) return false;
    return doc.status !== 'approved' && unresolvedComments.length === 0;
  }, [doc, unresolvedComments]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(documentId) });
    void queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end || start === undefined || end === undefined) {
      setFloatingButtonPos(null);
      return;
    }

    const selected = content.slice(start, end).trim();
    if (!selected) {
      setFloatingButtonPos(null);
      return;
    }

    const before = content.slice(0, start);
    const calculatedStartLine = before.split('\n').length;
    const calculatedEndLine = (before + content.slice(start, end)).split('\n').length;

    setSelectedText(selected);
    setStartLine(calculatedStartLine);
    setEndLine(calculatedEndLine);

    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (containerRect) {
      setFloatingButtonPos({
        top: Math.max(10, textareaRect.top - containerRect.top + 20),
        left: Math.min(containerRect.width - 220, textareaRect.width / 2),
      });
    }
  };

  const handleOpenCommentForm = () => {
    setIsAddingComment(true);
    setIsCommentDrawerOpen(true);
    setCommentDrawerTab('active');
    setFloatingButtonPos(null);
  };

  const handleSaveDocument = (e: FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    updateMutation.mutate(
      {
        documentId,
        data: {
          content,
          expectedRevision: doc.revision,
        },
      },
      {
        onSuccess: () => {
          invalidateAll();
        },
      }
    );
  };

  const handleApproveDocument = () => {
    if (!doc || !canApprove) return;
    approveMutation.mutate(
      { documentId },
      {
        onSuccess: () => {
          invalidateAll();
        },
      }
    );
  };

  const handleCreateComment = (e: FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || !selectedText.trim()) return;

    createCommentMutation.mutate(
      {
        data: {
          documentId,
          selectedText,
          startLine: Number(startLine),
          endLine: Number(endLine),
          instruction,
        },
      },
      {
        onSuccess: () => {
          setIsAddingComment(false);
          setInstruction('');
          setSelectedText('');
          invalidateAll();
        },
      }
    );
  };

  const handleResolveComment = (commentId: string) => {
    resolveCommentMutation.mutate(
      { commentId },
      {
        onSuccess: () => {
          invalidateAll();
        },
      }
    );
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editInstruction.trim()) return;
    setIsUpdatingComment(true);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: editInstruction }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        invalidateAll();
      }
    } finally {
      setIsUpdatingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this review comment?')) return;
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        invalidateAll();
        if (commentDrawerTab === 'history') {
          setHistoryComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      }
    } catch {
      // Ignore
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      case 'in-review':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
      case 'changes-requested':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (docQuery.isLoading) {
    return (
      <div className="flex h-96 items-center justify-center space-x-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span>Loading specification document...</span>
      </div>
    );
  }

  if (docQuery.isError || !doc) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8" />
        <h3 className="text-base font-semibold">Failed to load document</h3>
        <p className="mt-1 text-xs text-muted-foreground">The document could not be retrieved from the server.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void docQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const containerClasses = isExpanded
    ? 'fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col p-4 sm:p-6 transition-all duration-200 shadow-2xl'
    : 'relative flex flex-col h-[calc(100vh-140px)] rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm';

  return (
    <div ref={containerRef} className={containerClasses}>
      {/* Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 bg-background/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-semibold truncate leading-none">{doc.title}</h2>
              <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getStatusBadgeVariant(doc.status)}`}>
                {doc.status}
              </Badge>
              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                r{doc.revision}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate">{doc.path}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Segmented Mode Control: Source | Preview | Split */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setViewMode('source')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'source'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code2 size={13} />
              <span className="hidden sm:inline">Source</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'preview'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye size={13} />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'split'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns2 size={13} />
              <span className="hidden sm:inline">Split</span>
            </button>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!canApprove || approveMutation.isPending}
                  onClick={handleApproveDocument}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  {approveMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  <span className="hidden sm:inline">Approve Document</span>
                </Button>
              </span>
            </TooltipTrigger>
            {!canApprove && (
              <TooltipContent side="bottom">
                {doc.status === 'approved'
                  ? 'Document is already approved.'
                  : unresolvedComments.length > 0
                  ? `Cannot approve: ${unresolvedComments.length} unresolved comment(s) remaining.`
                  : 'Document not ready for approval.'}
              </TooltipContent>
            )}
          </Tooltip>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCommentDrawerOpen(!isCommentDrawerOpen)}
            className="gap-1.5"
          >
            <MessageSquarePlus size={14} />
            <span className="hidden sm:inline">Comments</span>
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
              {unresolvedComments.length}
            </Badge>
          </Button>

          {/* Expand / Maximize Toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title={isExpanded ? 'Collapse to standard view (Esc)' : 'Maximize to full width overlay'}
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </Button>

          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close Inspector" className="h-8 w-8 p-0">
              <X size={16} />
            </Button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="relative flex-1 flex overflow-hidden min-h-0">
        {/* Document Pane */}
        <div className="flex-1 flex flex-col min-w-0 h-full border-r border-border/70 overflow-hidden">
          <form onSubmit={handleSaveDocument} className="flex-1 flex flex-col min-h-0">
            {/* Toolbar status */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/60 text-[11px] text-muted-foreground font-mono shrink-0">
              <div className="flex items-center gap-2 truncate">
                <span>Select text anywhere to anchor AI review</span>
                {doc.approvedBy && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                    ✓ Approved by {doc.approvedBy}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span>Lines: {content.split('\n').length}</span>
                <span>•</span>
                <span>{content.length} chars</span>
              </div>
            </div>

            {/* Document Content View Modes */}
            <div className="relative flex-1 min-h-0 overflow-hidden bg-background/50 flex">
              {/* Floating "Add Comment for AI" button on text selection */}
              {floatingButtonPos && (viewMode === 'source' || viewMode === 'split') && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${floatingButtonPos.top}px`,
                    left: `${floatingButtonPos.left}px`,
                    zIndex: 40,
                  }}
                  className="animate-in fade-in zoom-in-95 duration-150"
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleOpenCommentForm}
                    className="shadow-xl bg-primary text-primary-foreground gap-1.5 font-medium hover:scale-105 transition-transform"
                  >
                    <Sparkles size={13} className="text-amber-300 animate-pulse" />
                    Add Comment for AI
                  </Button>
                </div>
              )}

              {/* Source View */}
              {(viewMode === 'source' || viewMode === 'split') && (
                <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-border/70' : 'w-full'} h-full overflow-auto p-4`}>
                  <Textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onSelect={handleTextSelect}
                    onKeyUp={handleTextSelect}
                    onMouseUp={handleTextSelect}
                    placeholder="Document content..."
                    className="w-full h-full min-h-[450px] font-mono text-xs leading-relaxed resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:outline-none"
                  />
                </div>
              )}

              {/* Preview View */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-y-auto p-6 bg-card/40`}>
                  <MarkdownRenderer content={content} />
                </div>
              )}
            </div>

            {/* Bottom Editor Bar */}
            <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5 bg-muted/20 shrink-0">
              <div className="text-xs text-muted-foreground">
                {content !== doc.content ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
                ) : (
                  <span>All changes saved (r{doc.revision})</span>
                )}
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={content === doc.content || updateMutation.isPending}
                className="gap-1.5"
              >
                {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save Document
              </Button>
            </div>
          </form>
        </div>

        {/* Right Pane: Anchored Comments Drawer */}
        {isCommentDrawerOpen && (
          <aside className="w-80 sm:w-96 flex flex-col h-full bg-card/60 backdrop-blur-md overflow-hidden animate-in slide-in-from-right duration-200 border-l border-border/60">
            {/* Drawer Header with Active vs Resolved History Tabs */}
            <div className="border-b border-border/70 px-4 py-3 bg-muted/30 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 bg-muted/80 p-0.5 rounded-lg border border-border/60">
                  <button
                    type="button"
                    onClick={() => setCommentDrawerTab('active')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                      commentDrawerTab === 'active'
                        ? 'bg-background text-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Active ({unresolvedComments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentDrawerTab('history')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
                      commentDrawerTab === 'history'
                        ? 'bg-background text-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <History size={11} />
                    Resolved History
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {commentDrawerTab === 'active' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => setIsAddingComment(!isAddingComment)}
                    >
                      <MessageSquarePlus size={13} />
                      New
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setIsCommentDrawerOpen(false)}
                    title="Close Comments Drawer"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </div>

            {/* New Comment Composer Form (Active Tab Only) */}
            {commentDrawerTab === 'active' && isAddingComment && (
              <div className="p-4 border-b border-border/70 bg-accent/20 animate-in fade-in duration-150 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Sparkles size={13} className="text-primary" />
                    New AI Annotation
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingComment(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Cancel
                  </button>
                </div>
                <form onSubmit={handleCreateComment} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                      Selected Excerpt
                    </label>
                    <Textarea
                      required
                      value={selectedText}
                      onChange={(e) => setSelectedText(e.target.value)}
                      placeholder="Select text in document or paste here..."
                      className="text-xs font-mono h-16 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                        Start Line
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={startLine}
                        onChange={(e) => setStartLine(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                        End Line
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={endLine}
                        onChange={(e) => setEndLine(Number(e.target.value))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                      Instruction for AI
                    </label>
                    <Textarea
                      required
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="e.g. Clarify edge cases when token expires..."
                      className="text-xs h-20 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={createCommentMutation.isPending || !instruction.trim()}
                  >
                    {createCommentMutation.isPending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Post Comment
                  </Button>
                </form>
              </div>
            )}

            {/* Comment List: Active Tab */}
            {commentDrawerTab === 'active' && (
              <div className="flex-1 overflow-y-auto divide-y divide-border/60">
                {docComments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <MessageSquarePlus className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-xs font-medium">No anchored comments</p>
                    <p className="text-[11px] mt-1 text-muted-foreground/80">
                      Select text in the editor to leave contextual instructions for agents.
                    </p>
                  </div>
                ) : (
                  docComments.map((comment: Comment) => (
                    <article
                      key={comment.id}
                      onClick={() => setActiveHighlightLine(comment.startLine)}
                      className={`p-4 transition-colors hover:bg-muted/40 cursor-pointer ${
                        activeHighlightLine === comment.startLine ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="outline" className="font-mono text-[10px] bg-background">
                          L{comment.startLine}
                          {comment.endLine !== comment.startLine && `–${comment.endLine}`}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[9px] uppercase font-mono ${
                            comment.status === 'resolved'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {comment.status}
                        </Badge>
                      </div>

                      {/* Quoted Excerpt */}
                      <blockquote className="mb-2 border-l-2 border-primary/40 pl-2.5 font-mono text-[11px] text-muted-foreground line-clamp-2 bg-muted/20 py-1 rounded-r">
                        "{comment.selectedText}"
                      </blockquote>

                      {/* Instruction or Inline Edit Mode */}
                      {editingCommentId === comment.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleUpdateComment(comment.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="space-y-2 mb-2.5"
                        >
                          <Textarea
                            value={editInstruction}
                            onChange={(e) => setEditInstruction(e.target.value)}
                            className="text-xs font-sans min-h-[64px]"
                            placeholder="Modify instruction..."
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => setEditingCommentId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              disabled={!editInstruction.trim() || isUpdatingComment}
                            >
                              {isUpdatingComment ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                              Save
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <p className="text-xs leading-relaxed text-foreground font-medium mb-2.5">
                          {comment.instruction}
                        </p>
                      )}

                      {comment.resolutionNote && (
                        <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded mb-2 font-mono">
                          Resolution: {comment.resolutionNote}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>

                        <div className="flex items-center gap-1">
                          {comment.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit instruction"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCommentId(comment.id);
                                setEditInstruction(comment.instruction);
                              }}
                            >
                              <Pencil size={11} />
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete comment"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteComment(comment.id);
                            }}
                          >
                            <Trash2 size={11} />
                          </Button>

                          {comment.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 gap-1"
                              disabled={resolveCommentMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveComment(comment.id);
                              }}
                            >
                              <CheckCircle2 size={12} />
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}

            {/* Comment List: Resolved History Tab */}
            {commentDrawerTab === 'history' && (
              <div className="flex-1 overflow-y-auto divide-y divide-border/60">
                {isLoadingHistory ? (
                  <div className="flex h-36 items-center justify-center space-x-2 text-muted-foreground text-xs">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading resolved history...</span>
                  </div>
                ) : historyComments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mb-2 opacity-40 text-emerald-500" />
                    <p className="text-xs font-medium">No resolved comments</p>
                    <p className="text-[11px] mt-1 text-muted-foreground/80">
                      Comments that have been resolved and purged from active review appear here.
                    </p>
                  </div>
                ) : (
                  historyComments.map((comment: Comment) => (
                    <article key={comment.id} className="p-4 transition-colors hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="outline" className="font-mono text-[10px] bg-background">
                          L{comment.startLine}
                          {comment.endLine !== comment.startLine && `–${comment.endLine}`}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] uppercase font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 gap-1">
                          <CheckCircle2 size={10} />
                          RESOLVED
                        </Badge>
                      </div>

                      <blockquote className="mb-2 border-l-2 border-emerald-500/40 pl-2.5 font-mono text-[11px] text-muted-foreground line-clamp-2 bg-muted/20 py-1 rounded-r">
                        "{comment.selectedText}"
                      </blockquote>

                      <p className="text-xs leading-relaxed text-foreground/90 font-medium mb-2">
                        {comment.instruction}
                      </p>

                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded mb-2 font-mono">
                        <span className="font-semibold block mb-0.5">Resolution Note:</span>
                        {comment.resolutionNote || 'Verified and addressed'}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock size={11} />
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete history record"
                          onClick={() => void handleDeleteComment(comment.id)}
                        >
                          <Trash2 size={11} />
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
