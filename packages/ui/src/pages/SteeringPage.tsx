import React, { useState, useMemo } from 'react';
import {
  useListDocuments,
  getListDocumentsQueryKey,
  type DocumentSummary,
} from '@workspace/api-client-react';
import { Compass, BookOpen, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflowUiStore } from '@/store/ui';
import { DocumentInspector } from '@/components/inspector/DocumentInspector';
import { UnsavedChangesDialog } from '@/components/inspector/UnsavedChangesDialog';

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export function SteeringPage() {
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isInspectorFullWidth = useWorkflowUiStore((state) => state.isInspectorFullWidth);
  const isDocumentDirty = useWorkflowUiStore((state) => state.isDocumentDirty);
  const setIsDocumentDirty = useWorkflowUiStore((state) => state.setIsDocumentDirty);

  // Unsaved changes protection
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const confirmDiscard = (action: () => void) => {
    if (isDocumentDirty) {
      setPendingAction(() => action);
      setShowDiscardDialog(true);
    } else {
      action();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    setIsDocumentDirty(false);
    if (pendingAction) {
      const act = pendingAction;
      setPendingAction(null);
      act();
    }
  };

  // STRICT Isolation: ONLY steering documents, never specifications or features
  const steeringDocs = useMemo(() => {
    return (docs.data ?? []).filter(
      (d: DocumentSummary) =>
        d.kind === 'steering' ||
        d.path.includes('/steering/') ||
        d.path.startsWith('.specflow/steering/')
    );
  }, [docs.data]);

  const currentId =
    selectedId && steeringDocs.some((d: DocumentSummary) => d.id === selectedId)
      ? selectedId
      : steeringDocs[0]?.id;

  return (
    <div className="space-y-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-primary">
            Workspace / steering
          </div>
          <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-.04em] sm:text-[36px]">
            Steering Principles & Constitution
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-muted-foreground">
            The foundational operating constitution, architectural constraints, and safety guidelines
            that strictly govern and anchor all autonomous agents and human collaborators in this workspace.
          </p>
        </div>
      </header>

      {docs.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-border/60 bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : docs.isError ? (
        <div className="rounded-xl border border-border/80 bg-card/90 p-5 flex items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400">
            <AlertCircle size={18} />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Couldn’t load steering documents</div>
            <p className="mb-0 mt-1 text-xs text-muted-foreground">
              Please check your workspace connection and retry.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void docs.refetch()}>
            <RefreshCw size={14} className="mr-1.5" />
            Try again
          </Button>
        </div>
      ) : steeringDocs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 grid min-h-[320px] place-items-center p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Compass size={22} />
            </span>
            <h2 className="font-serif text-xl font-semibold">No steering documents defined</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Steering documents anchor your project’s constitution and architecture boundaries. Add markdown documents inside{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">.specflow/steering/</code> to establish guidelines.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
          {/* Steering Documents Navigation Panel */}
          <div className="rounded-xl border border-border/80 bg-card/90 shadow-[0_2px_14px_hsl(32_22%_34%/.035)] h-fit overflow-hidden">
            <div className="border-b border-border/70 p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[.17em] text-muted-foreground font-semibold">
                  Constitutional Corpus
                </span>
                <Badge variant="secondary" className="font-mono text-[10px] h-5">
                  {steeringDocs.length} {steeringDocs.length === 1 ? 'doc' : 'docs'}
                </Badge>
              </div>
            </div>

            <div className="divide-y divide-border/60 max-h-[calc(100vh-280px)] overflow-y-auto">
              {steeringDocs.map((doc: DocumentSummary) => (
                <button
                  key={doc.id}
                  onClick={() => {
                    if (currentId === doc.id) return;
                    confirmDiscard(() => setSelectedId(doc.id));
                  }}
                  className={cx(
                    'block w-full p-4 text-left transition hover:bg-secondary/40 cursor-pointer',
                    currentId === doc.id && 'bg-accent/40 border-l-2 border-primary font-medium'
                  )}
                  data-testid={`select-steering-${doc.id}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-foreground">{doc.title}</span>
                    <Badge
                      variant="outline"
                      className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                    >
                      {doc.status}
                    </Badge>
                  </div>
                  <div className="truncate font-mono text-[9px] text-muted-foreground">{doc.path}</div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-primary font-semibold">
                      steering
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">r{doc.revision}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Document Inspector Body */}
          {currentId ? (
            <DocumentInspector key={currentId} documentId={currentId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-card/50 grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary">
                  <BookOpen size={20} />
                </span>
                <h3 className="font-serif text-lg font-semibold">Select a document</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a steering document on the left to inspect and review its content.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <UnsavedChangesDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onConfirmDiscard={handleConfirmDiscard}
        onKeepEditing={() => {
          setShowDiscardDialog(false);
          setPendingAction(null);
        }}
      />
    </div>
  );
}
