import React, { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import {
  useListFeatures,
  getListFeaturesQueryKey,
  useCreateFeature,
  useListDocuments,
  getListDocumentsQueryKey,
  getGetDashboardQueryKey,
  useListTasks,
  getListTasksQueryKey,
  type Feature,
  type DocumentSummary,
  type Task,
} from '@workspace/api-client-react';
import {
  Layers3,
  Layers,
  LayoutGrid,
  Plus,
  ArrowRight,
  Sparkles,
  FileText,
  FileCode,
  Image as ImageIcon,
  FolderOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  AlertCircle,
  RefreshCw,
  Calendar,
  Database,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useWorkflowUiStore } from '@/store/ui';
import { DocumentInspector } from '@/components/inspector/DocumentInspector';
import { MarkdownRenderer } from '@/components/inspector/MarkdownRenderer';
import { UnsavedChangesDialog } from '@/components/inspector/UnsavedChangesDialog';

export interface SpecFileInfo {
  name: string;
  relativePath: string;
  kind: 'requirements' | 'design' | 'tasks' | 'reference' | 'image' | 'log' | 'other';
  sizeBytes: number;
  extension: string;
  updatedAt: string;
}

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function SpecificationsHub() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const featuresQuery = useListFeatures({ query: { queryKey: getListFeaturesQueryKey() } });
  const docsQuery = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const createFeatureMutation = useCreateFeature();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeSpecFilterTab, setActiveSpecFilterTab] = useState<
    'requirements' | 'design' | 'tasks' | 'references' | 'images' | 'all-files'
  >('requirements');
  const [selectedReferenceFile, setSelectedReferenceFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const searchString = useSearch();
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

  const features = featuresQuery.data ?? [];

  // Parse URL search param `?spec=<spec-id>` reactively with useSearch
  const specParam = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('spec');
  }, [searchString]);

  // Maintain local state selectedSpecId initialized from query param or first feature
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('spec') || null;
  });

  // Keep selectedSpecId synced when specParam in searchString changes or features arrive
  useEffect(() => {
    if (specParam && features.some((f: Feature) => f.id === specParam)) {
      setSelectedSpecId(specParam);
    } else if (!selectedSpecId && features.length > 0) {
      setSelectedSpecId(features[0].id);
    } else if (selectedSpecId && !features.some((f: Feature) => f.id === selectedSpecId) && features.length > 0) {
      setSelectedSpecId(features[0].id);
    }
  }, [specParam, features, selectedSpecId]);

  const selectedSpec = useMemo(() => {
    return features.find((f: Feature) => f.id === selectedSpecId) || null;
  }, [features, selectedSpecId]);

  // Fetch auxiliary files for the selected specification via GET /api/specs/:id/files
  const { data: specFilesData, isLoading: isFilesLoading } = useQuery({
    queryKey: ['spec-files', selectedSpecId],
    queryFn: async (): Promise<SpecFileInfo[]> => {
      if (!selectedSpecId) return [];
      const res = await fetch(`/api/specs/${encodeURIComponent(selectedSpecId)}/files`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.files || []) as SpecFileInfo[];
    },
    enabled: Boolean(selectedSpecId),
  });

  const specFiles = specFilesData ?? [];

  // Fetch reference file content if selected
  const { data: refFileContent, isLoading: isRefContentLoading } = useQuery({
    queryKey: ['spec-file-content', selectedSpecId, selectedReferenceFile],
    queryFn: async (): Promise<string> => {
      if (!selectedSpecId || !selectedReferenceFile) return '';
      const res = await fetch(
        `/api/specs/${encodeURIComponent(selectedSpecId)}/files/${encodeURIComponent(
          selectedReferenceFile
        )}`
      );
      if (!res.ok) return 'Failed to load reference file content.';
      return await res.text();
    },
    enabled: Boolean(selectedSpecId && selectedReferenceFile),
  });

  // Query tasks for the selected specification to show the tasks summary
  const tasksQuery = useListTasks(selectedSpecId || '', {
    query: {
      queryKey: getListTasksQueryKey(selectedSpecId || ''),
      enabled: Boolean(selectedSpecId),
    },
  });

  const rawTasks = tasksQuery.data;
  const specTasks: Task[] = Array.isArray(rawTasks)
    ? rawTasks
    : Array.isArray((rawTasks as any)?.tasks)
    ? (rawTasks as any).tasks
    : [];

  // Find doc ID for requirements.md and design.md in the document index
  const allDocs = docsQuery.data ?? [];
  const requirementsDoc = allDocs.find(
    (d: DocumentSummary) =>
      d.id === `${selectedSpecId}:requirements` ||
      (d.featureId === selectedSpecId && d.kind === 'requirements') ||
      (d.path.includes(`/${selectedSpecId}/`) && d.path.endsWith('requirements.md'))
  );
  const designDoc = allDocs.find(
    (d: DocumentSummary) =>
      d.id === `${selectedSpecId}:design` ||
      (d.featureId === selectedSpecId && d.kind === 'design') ||
      (d.path.includes(`/${selectedSpecId}/`) && d.path.endsWith('design.md'))
  );

  const handleSelectSpec = (specId: string) => {
    if (specId === selectedSpecId) return;
    confirmDiscard(() => {
      setSelectedSpecId(specId);
      setLocation(`/specs?spec=${encodeURIComponent(specId)}`);
      setSelectedReferenceFile(null);
    });
  };

  const handleCreateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const id = String(formData.get('id') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const description = String(formData.get('description') || '').trim();

    if (!id || !name) return;

    createFeatureMutation.mutate(
      { data: { id, name, description } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setIsCreateOpen(false);
          setLocation(`/specs?spec=${encodeURIComponent(id)}`);
        },
      }
    );
  };

  // Filter references and images from the spec files list
  const referenceFiles = useMemo(() => {
    return specFiles.filter(
      (f) =>
        f.kind === 'reference' ||
        f.relativePath.startsWith('references/') ||
        (f.extension === '.md' && f.name !== 'requirements.md' && f.name !== 'design.md')
    );
  }, [specFiles]);

  const imageFiles = useMemo(() => {
    return specFiles.filter(
      (f) =>
        f.kind === 'image' ||
        f.relativePath.startsWith('images/') ||
        ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'].includes(f.extension.toLowerCase())
    );
  }, [specFiles]);

  // Set default reference file if none selected
  useEffect(() => {
    if (referenceFiles.length > 0 && !selectedReferenceFile) {
      setSelectedReferenceFile(referenceFiles[0].relativePath);
    }
  }, [referenceFiles, selectedReferenceFile]);

  // Filtered spec list for search
  const filteredFeatures = useMemo(() => {
    if (!searchQuery.trim()) return features;
    const q = searchQuery.toLowerCase();
    return features.filter(
      (f: Feature) =>
        f.name.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
    );
  }, [features, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-primary">
            Workspace / Specifications Hub
          </div>
          <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-.04em] sm:text-[36px]">
            Specifications & Feature Assets
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-muted-foreground">
            Authoritative units of intent and implementation specifications. Inspect requirements, design decisions,
            auxiliary research references, diagrams, and operational task breakdowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedSpec && (
            <Button
              onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(selectedSpec.id)}`)}
              className="gap-2 bg-primary text-primary-foreground font-semibold shadow-md"
              data-testid="button-open-tasks"
            >
              <LayoutGrid size={15} />
              Open Tasks & Kanban
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setIsCreateOpen((v) => !v)}
            data-testid="button-new-spec"
            className="gap-1.5"
          >
            <Plus size={15} />
            New Specification
          </Button>
        </div>
      </header>

      {/* Inline Create Specification Form */}
      {isCreateOpen && (
        <section className="mb-6 p-6 rounded-xl border border-primary/40 bg-card/95 shadow-lg animate-in fade-in duration-200">
          <div className="mb-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-semibold">
              New Specification
            </span>
            <h2 className="mb-0 mt-1 font-serif text-xl font-bold">Define Feature Specification</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Creates a dedicated specification directory under <code className="font-mono">.spexy/specs/[id]/</code> with requirements, design, and tasks scaffolds.
            </p>
          </div>

          <form onSubmit={handleCreateSubmit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-mono">
                Specification ID (lowercase-hyphenated) <span className="text-rose-500">*</span>
              </Label>
              <Input
                name="id"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                minLength={2}
                maxLength={64}
                placeholder="e.g. real-time-chat"
                className="font-mono text-xs"
                data-testid="input-feature-id"
              />
            </div>

            <div>
              <Label className="text-xs">
                Display Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="e.g. Real-time Chat Collaboration"
                className="text-xs"
                data-testid="input-feature-name"
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs">Description & Scope</Label>
              <Textarea
                name="description"
                maxLength={2000}
                placeholder="Explain the user problem, intended behavior, and key architectural boundaries..."
                className="text-xs min-h-[80px]"
                data-testid="input-feature-description"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <Button
                type="submit"
                disabled={createFeatureMutation.isPending}
                size="sm"
                data-testid="button-create-feature"
                className="gap-1.5"
              >
                <Plus size={14} />
                {createFeatureMutation.isPending ? 'Creating…' : 'Create Specification'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Main Grid: Left Spec Selector, Right Spec Hub Details */}
      {featuresQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border/60 bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : featuresQuery.isError ? (
        <div className="rounded-xl border border-border/80 bg-card/90 p-5 flex items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400">
            <AlertCircle size={18} />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Couldn’t load specifications</div>
            <p className="mb-0 mt-1 text-xs text-muted-foreground">
              Please check your workspace connection and retry.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void featuresQuery.refetch()}>
            <RefreshCw size={14} className="mr-1.5" />
            Try again
          </Button>
        </div>
      ) : features.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/50 grid min-h-[320px] place-items-center p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Layers size={24} />
            </span>
            <h2 className="font-serif text-xl font-semibold">No specifications created yet</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Define your first specification to establish requirements, architectural designs, and actionable task breakdown for agents.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-5 gap-1.5">
              <Plus size={14} />
              Create your first specification
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Specifications Sidebar List */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search specifications..."
                className="pl-9 h-9 text-xs"
              />
            </div>

              <div className="rounded-xl border border-border/80 bg-card/90 overflow-hidden shadow-xs divide-y divide-border/60 max-h-[calc(100vh-250px)] overflow-y-auto">
                {filteredFeatures.map((f: Feature) => {
                  const isSelected = f.id === selectedSpecId;
                  const progressPct =
                    f.taskCount > 0 ? Math.round((f.completedTaskCount / f.taskCount) * 100) : 0;

                  return (
                    <button
                      key={f.id}
                      onClick={() => handleSelectSpec(f.id)}
                      className={cx(
                        'block w-full p-4 text-left transition hover:bg-secondary/40 cursor-pointer',
                        isSelected && 'bg-accent/40 border-l-2 border-primary'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-serif text-sm font-semibold truncate text-foreground">
                          {f.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`font-mono text-[9px] uppercase tracking-wider ${
                            f.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : f.status === 'in-progress'
                              ? 'bg-sky-500/10 text-sky-600 border-sky-500/30'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {f.status}
                        </Badge>
                      </div>

                      <div className="font-mono text-[10px] text-muted-foreground truncate mb-2">
                        {f.id}
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span>
                            {f.completedTaskCount}/{f.taskCount} tasks
                          </span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          {/* Specification Detail & Documents Tabs */}
          {selectedSpec ? (
            <div className="space-y-5">
              {/* Spec Hero Card */}
              <div className="rounded-xl border border-border/80 bg-card/90 p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold bg-muted px-2 py-0.5 rounded border border-border/60">
                        {selectedSpec.id}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
                      >
                        {selectedSpec.status}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {selectedSpec.completedTaskCount} of {selectedSpec.taskCount} tasks done
                      </Badge>
                    </div>

                    <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                      {selectedSpec.name}
                    </h2>

                    {selectedSpec.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
                        {selectedSpec.description}
                      </p>
                    )}
                  </div>

                  {/* Primary Call to Action */}
                  <Button
                    onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(selectedSpec.id)}`)}
                    className="gap-2 bg-primary text-primary-foreground font-semibold shadow-md shrink-0"
                  >
                    <LayoutGrid size={15} />
                    View Kanban & Tasks
                  </Button>
                </div>
              </div>

              {/* Filter Tabs for Previewing Spec Documents and Files */}
              <Tabs
                value={activeSpecFilterTab}
                onValueChange={(v) => {
                  const nextTab = v as any;
                  if (nextTab === activeSpecFilterTab) return;
                  confirmDiscard(() => {
                    setActiveSpecFilterTab(nextTab);
                  });
                }}
                className="space-y-4"
              >
                <div className="border-b border-border/70 pb-2">
                  <TabsList className="bg-muted/80 p-1 flex-wrap">
                    <TabsTrigger value="requirements" className="gap-1.5 text-xs">
                      <FileCheck2 size={13} />
                      Requirements
                    </TabsTrigger>
                    <TabsTrigger value="design" className="gap-1.5 text-xs">
                      <FileText size={13} />
                      Design
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="gap-1.5 text-xs">
                      <LayoutGrid size={13} />
                      Tasks Overview ({specTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="references" className="gap-1.5 text-xs">
                      <FileCode size={13} />
                      References ({referenceFiles.length})
                    </TabsTrigger>
                    <TabsTrigger value="images" className="gap-1.5 text-xs">
                      <ImageIcon size={13} />
                      Images ({imageFiles.length})
                    </TabsTrigger>
                    <TabsTrigger value="all-files" className="gap-1.5 text-xs">
                      <FolderOpen size={13} />
                      All Files ({specFiles.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* 1. REQUIREMENTS TAB */}
                <TabsContent value="requirements" className="m-0 focus-visible:outline-none">
                  {requirementsDoc ? (
                    <DocumentInspector
                      key={requirementsDoc.id || `req-${selectedSpecId}`}
                      documentId={requirementsDoc.id}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                      <FileCheck2 size={24} className="mx-auto mb-2 text-primary opacity-60" />
                      <p className="font-semibold text-foreground">No requirements.md found for this specification.</p>
                      <p className="mt-1">Add requirements.md under .spexy/specs/{selectedSpec.id}/</p>
                    </div>
                  )}
                </TabsContent>

                {/* 2. DESIGN TAB */}
                <TabsContent value="design" className="m-0 focus-visible:outline-none">
                  {designDoc ? (
                    <DocumentInspector
                      key={designDoc.id || `des-${selectedSpecId}`}
                      documentId={designDoc.id}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                      <FileText size={24} className="mx-auto mb-2 text-primary opacity-60" />
                      <p className="font-semibold text-foreground">No design.md found for this specification.</p>
                      <p className="mt-1">Add design.md under .spexy/specs/{selectedSpec.id}/</p>
                    </div>
                  )}
                </TabsContent>

                {/* 3. TASKS OVERVIEW TAB */}
                <TabsContent value="tasks" className="m-0 focus-visible:outline-none">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/80 bg-card/90 p-5 flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="font-serif text-lg font-semibold text-foreground">
                          Task Breakdown ({specTasks.length} tasks)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Tasks defined in <code className="font-mono text-primary">tasks.yaml</code> for this specification.
                        </p>
                      </div>

                      <Button
                        onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(selectedSpec.id)}`)}
                        className="gap-2"
                      >
                        <LayoutGrid size={14} />
                        Open Interactive Board
                      </Button>
                    </div>

                    {specTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                        <LayoutGrid size={24} className="mx-auto mb-2 text-primary opacity-60" />
                        <p className="font-semibold text-foreground">No tasks defined in tasks.yaml yet.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(selectedSpec.id)}`)}
                          className="mt-3 gap-1.5"
                        >
                          <Plus size={13} />
                          Add Task
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {specTasks.map((t: Task) => (
                          <div
                            key={t.id}
                            onClick={() => setLocation(`/tasks?spec=${encodeURIComponent(selectedSpec.id)}`)}
                            className="rounded-lg border border-border/70 bg-card p-3 hover:border-primary/50 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {t.id}
                              </span>
                              <Badge
                                variant="outline"
                                className={`font-mono text-[9px] uppercase ${
                                  t.status === 'done'
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                    : t.status === 'in-progress'
                                    ? 'bg-sky-500/10 text-sky-600 border-sky-500/30'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {t.status}
                              </Badge>
                            </div>
                            <h4 className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                              {t.title}
                            </h4>
                            {t.description && (
                              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                                {t.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* 4. REFERENCES TAB */}
                <TabsContent value="references" className="m-0 focus-visible:outline-none">
                  {referenceFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                      <FileCode size={24} className="mx-auto mb-2 text-primary opacity-60" />
                      <p className="font-semibold text-foreground">No reference documents discovered.</p>
                      <p className="mt-1">
                        Add architecture or research files inside <code className="font-mono">.spexy/specs/{selectedSpec.id}/references/</code>.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                      {/* Reference Files List */}
                      <div className="rounded-xl border border-border/70 bg-card p-3 space-y-1.5 h-fit">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-2 block mb-1">
                          Reference Corpus ({referenceFiles.length})
                        </span>
                        {referenceFiles.map((f) => (
                          <button
                            key={f.relativePath}
                            onClick={() => setSelectedReferenceFile(f.relativePath)}
                            className={cx(
                              'w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition flex items-center justify-between gap-2 cursor-pointer',
                              selectedReferenceFile === f.relativePath
                                ? 'bg-primary/10 text-primary font-semibold border border-primary/30'
                                : 'text-foreground/80 hover:bg-muted/50'
                            )}
                          >
                            <span className="truncate">{f.name}</span>
                            <span className="text-[9px] text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                          </button>
                        ))}
                      </div>

                      {/* Reference Content Preview */}
                      <div className="rounded-xl border border-border/70 bg-card p-5 min-h-[300px]">
                        {isRefContentLoading ? (
                          <div className="space-y-3">
                            <div className="h-6 w-1/3 bg-muted rounded animate-pulse" />
                            <div className="h-20 w-full bg-muted rounded animate-pulse" />
                          </div>
                        ) : refFileContent ? (
                          <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/70">
                              <span className="font-mono text-xs font-semibold text-primary">
                                {selectedReferenceFile}
                              </span>
                              <Badge variant="outline" className="font-mono text-[9px]">
                                Markdown
                              </Badge>
                            </div>
                            <MarkdownRenderer content={refFileContent} />
                          </div>
                        ) : (
                          <div className="text-center text-xs text-muted-foreground py-10">
                            Select a reference file on the left to preview.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* 5. IMAGES TAB */}
                <TabsContent value="images" className="m-0 focus-visible:outline-none">
                  {imageFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 bg-card/50 p-8 text-center text-xs text-muted-foreground">
                      <ImageIcon size={24} className="mx-auto mb-2 text-primary opacity-60" />
                      <p className="font-semibold text-foreground">No image assets discovered.</p>
                      <p className="mt-1">
                        Add screenshots or architecture diagrams inside <code className="font-mono">.spexy/specs/{selectedSpec.id}/images/</code>.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                      {imageFiles.map((img) => {
                        const imgUrl = `/api/specs/${encodeURIComponent(selectedSpec.id)}/files/${img.relativePath}`;
                        return (
                          <div
                            key={img.relativePath}
                            className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs hover:border-primary/50 transition-colors flex flex-col"
                          >
                            <div className="h-44 bg-muted/30 grid place-items-center overflow-hidden p-2">
                              <img
                                src={imgUrl}
                                alt={img.name}
                                className="max-h-full max-w-full object-contain rounded"
                                loading="lazy"
                              />
                            </div>
                            <div className="p-3 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-mono text-xs font-semibold text-foreground truncate block">
                                  {img.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {formatBytes(img.sizeBytes)}
                                </span>
                              </div>
                              <a
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors p-1"
                                title="Open full resolution"
                              >
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* 6. ALL FILES DIRECTORY BROWSER */}
                <TabsContent value="all-files" className="m-0 focus-visible:outline-none">
                  <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
                    <div className="p-4 border-b border-border/70 bg-muted/20 flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        Directory Contents: .spexy/specs/{selectedSpec.id}/
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {specFiles.length} {specFiles.length === 1 ? 'file' : 'files'}
                      </Badge>
                    </div>

                    {specFiles.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No files discovered for this specification.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {specFiles.map((file) => {
                          const fileUrl = `/api/specs/${encodeURIComponent(selectedSpec.id)}/files/${file.relativePath}`;
                          return (
                            <div
                              key={file.relativePath}
                              className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {file.kind === 'image' ? (
                                  <ImageIcon size={16} className="text-sky-500 shrink-0" />
                                ) : file.kind === 'requirements' || file.kind === 'design' ? (
                                  <FileCheck2 size={16} className="text-emerald-500 shrink-0" />
                                ) : file.kind === 'reference' ? (
                                  <FileCode size={16} className="text-amber-500 shrink-0" />
                                ) : (
                                  <FileText size={16} className="text-muted-foreground shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <span className="font-mono font-medium text-foreground block truncate">
                                    {file.relativePath}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatBytes(file.sizeBytes)} • Updated{' '}
                                    {file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : 'recently'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[9px] uppercase tracking-wider"
                                >
                                  {file.kind}
                                </Badge>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                                  title="View raw file"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
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
