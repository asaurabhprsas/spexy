import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  X,
  Check,
  ChevronsUpDown,
  Search,
  Sparkles,
  Layers,
  FolderGit2,
  RefreshCw,
  GitCommit,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  useListFeatures,
  getListFeaturesQueryKey,
  type Feature,
  type Task,
} from '@workspace/api-client-react';

export interface CreateTaskFormData {
  id: string;
  specId: string;
  groupId: string;
  parentId?: string | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  dependsOn: string[];
  files: string[];
  requirementsRef: string[];
}

export interface TaskComposerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateTaskFormData) => void;
  isPending?: boolean;
  specs?: Feature[];
  selectedSpecId?: string;
  existingTasks?: Task[];
  groups?: Array<{ id: string; name: string }>;
  defaultGroupId?: string;
  defaultParentId?: string | null;
}

/**
 * Extracts a numeric prefix from a group ID or falls back to its 1-based index.
 */
export function extractGroupNumber(groupId: string, groupIndex: number): number {
  if (groupId) {
    const match = groupId.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return groupIndex >= 0 ? groupIndex + 1 : 1;
}

/**
 * Smart auto-generation of Task ID:
 * - If Parent Task IS selected: scan subtasks of parent, suggest `<parentId>.<availableNumber>`
 * - If NO Parent Task is selected: suggest `<groupNum>.<nextAvailable>`
 */
export function generateTaskId({
  parentId,
  groupId,
  groupIndex,
  tasks,
}: {
  parentId: string | null | undefined;
  groupId: string;
  groupIndex: number;
  tasks: Array<{ id: string; parentId?: string | null; groupId?: string }>;
}): string {
  if (parentId && parentId.trim()) {
    const pid = parentId.trim();
    const childTasks = tasks.filter(
      (t) => (t.parentId && t.parentId === pid) || t.id.startsWith(`${pid}.`)
    );

    const usedNumbers = new Set<number>();
    for (const t of childTasks) {
      if (t.id.startsWith(`${pid}.`)) {
        const remainder = t.id.slice(pid.length + 1);
        const segment = remainder.split('.')[0];
        const num = parseInt(segment, 10);
        if (!isNaN(num) && num > 0) {
          usedNumbers.add(num);
        }
      }
    }

    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }
    return `${pid}.${nextNum}`;
  }

  // IF NO Parent Task is selected:
  const groupNum = extractGroupNumber(groupId, groupIndex);
  const groupTasks = tasks.filter(
    (t) =>
      (t.groupId && t.groupId === groupId) ||
      t.id.startsWith(`${groupNum}.`) ||
      t.id === `${groupNum}`
  );

  const usedNumbers = new Set<number>();
  for (const t of groupTasks) {
    if (t.id.startsWith(`${groupNum}.`)) {
      const remainder = t.id.slice(String(groupNum).length + 1);
      const segment = remainder.split('.')[0];
      const num = parseInt(segment, 10);
      if (!isNaN(num) && num > 0) {
        usedNumbers.add(num);
      }
    }
  }

  if (usedNumbers.size === 0) {
    for (const t of tasks) {
      if (t.id.startsWith(`${groupNum}.`)) {
        const remainder = t.id.slice(String(groupNum).length + 1);
        const segment = remainder.split('.')[0];
        const num = parseInt(segment, 10);
        if (!isNaN(num) && num > 0) {
          usedNumbers.add(num);
        }
      }
    }
  }

  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }

  return `${groupNum}.${nextNum}`;
}

// ---------------------------------------------------------------------------
// Searchable Single-Select Component
// ---------------------------------------------------------------------------

interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  status?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  testId?: string;
  className?: string;
  disabled?: boolean;
}

function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No options found',
  allowCustom = false,
  testId,
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase().trim();
    return options.filter((opt) => {
      const labelMatch = opt.label.toLowerCase().includes(query);
      const valMatch = opt.value.toLowerCase().includes(query);
      const subMatch = opt.sublabel?.toLowerCase().includes(query);
      const keyMatch = opt.keywords?.toLowerCase().includes(query);
      return labelMatch || valMatch || subMatch || keyMatch;
    });
  }, [options, search]);

  const hasExactMatch = useMemo(
    () => options.some((opt) => opt.value.toLowerCase() === search.toLowerCase().trim()),
    [options, search]
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  const getStatusBadgeVariant = (st?: string) => {
    switch (st) {
      case 'done':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'in-progress':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'to-review':
        return 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-testid={testId}
          className={`w-full justify-between h-9 text-xs font-normal bg-background hover:bg-muted/50 border-border/80 ${className}`}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption ? (
              <>
                <span className="font-medium text-foreground truncate">
                  {selectedOption.label}
                </span>
                {selectedOption.sublabel && (
                  <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                    {selectedOption.sublabel}
                  </span>
                )}
                {selectedOption.badge && (
                  <Badge variant="secondary" className="font-mono text-[10px] px-1 py-0 h-4">
                    {selectedOption.badge}
                  </Badge>
                )}
              </>
            ) : value ? (
              <span className="font-mono text-xs text-foreground truncate">{value}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] sm:w-[380px] p-0 shadow-lg" align="start">
        <div className="p-2 border-b border-border/70 bg-card/40">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/60">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[240px] p-1">
          {filteredOptions.length === 0 && (!allowCustom || !search.trim() || hasExactMatch) && (
            <div className="p-4 text-center text-xs text-muted-foreground">{emptyText}</div>
          )}

          {allowCustom && search.trim() && !hasExactMatch && (
            <button
              type="button"
              onClick={() => handleSelect(search.trim())}
              className="w-full text-left px-3 py-2 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-2 mb-1 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                Use custom: <strong className="font-mono font-bold">{search.trim()}</strong>
              </span>
            </button>
          )}

          {filteredOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-md text-left transition-colors ${
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-muted/70 text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-[11px] text-muted-foreground truncate">
                      {opt.sublabel}
                    </span>
                  )}
                  {opt.status && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-mono ${getStatusBadgeVariant(
                        opt.status
                      )}`}
                    >
                      {opt.status}
                    </span>
                  )}
                </div>
                {opt.badge && (
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {opt.badge}
                  </Badge>
                )}
                {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-1" />}
              </button>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Searchable Multi-Select Component (for depends_on)
// ---------------------------------------------------------------------------

interface SearchableMultiSelectProps {
  selectedValues: string[];
  onChange: (values: string[]) => void;
  tasks: Task[];
  placeholder?: string;
  searchPlaceholder?: string;
  testId?: string;
}

function SearchableMultiSelect({
  selectedValues,
  onChange,
  tasks,
  placeholder = 'Add dependencies...',
  searchPlaceholder = 'Search task ID or title...',
  testId,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const query = search.toLowerCase().trim();
    return tasks.filter((t) => {
      const idMatch = t.id.toLowerCase().includes(query);
      const titleMatch = t.title.toLowerCase().includes(query);
      return idMatch || titleMatch;
    });
  }, [tasks, search]);

  const toggleTask = (taskId: string) => {
    if (selectedValues.includes(taskId)) {
      onChange(selectedValues.filter((id) => id !== taskId));
    } else {
      onChange([...selectedValues, taskId]);
    }
  };

  const removeTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedValues.filter((id) => id !== taskId));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          >
            done
          </Badge>
        );
      case 'in-progress':
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
          >
            in-progress
          </Badge>
        );
      case 'to-review':
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/10"
          >
            review
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 border-border text-muted-foreground bg-muted"
          >
            todo
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected Task Chips */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-md bg-muted/30 border border-border/70">
          {selectedValues.map((taskId) => {
            const task = tasks.find((t) => t.id === taskId);
            return (
              <span
                key={taskId}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded bg-card border border-border/80 text-xs shadow-xs"
              >
                <span className="font-mono font-semibold text-primary text-[11px]">
                  #{taskId}
                </span>
                {task && (
                  <span className="max-w-[140px] truncate text-[11px] text-muted-foreground hidden sm:inline">
                    {task.title}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => removeTask(taskId, e)}
                  className="rounded hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Remove dependency ${taskId}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Popover trigger button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid={testId}
            className="w-full justify-between h-9 text-xs font-normal bg-background hover:bg-muted/50 border-border/80"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-muted-foreground">
                {selectedValues.length === 0
                  ? placeholder
                  : `${selectedValues.length} ${
                      selectedValues.length === 1 ? 'task' : 'tasks'
                    } selected`}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] sm:w-[420px] p-0 shadow-lg" align="start">
          <div className="p-2 border-b border-border/70 bg-card/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/60 flex-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <span className="text-[11px] font-mono text-muted-foreground shrink-0">
              {selectedValues.length}/{tasks.length}
            </span>
          </div>

          <ScrollArea className="max-h-[240px] p-1">
            {filteredTasks.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matching tasks found in this specification.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isSelected = selectedValues.includes(task.id);
                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTask(task.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleTask(task.id);
                      }
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-md cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleTask(task.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="font-mono font-semibold text-[11px] text-primary shrink-0 px-1 py-0.5 rounded bg-muted/80">
                      #{task.id}
                    </span>
                    <span className="flex-1 truncate text-xs">{task.title}</span>
                    {getStatusBadge(task.status)}
                  </div>
                );
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main TaskComposerSheet Component
// ---------------------------------------------------------------------------

export function TaskComposerSheet({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
  specs = [],
  selectedSpecId = '',
  existingTasks = [],
  groups = [],
  defaultGroupId = '',
  defaultParentId = null,
}: TaskComposerSheetProps) {
  // Query all specs if none passed
  const fallbackFeaturesQuery = useListFeatures({
    query: {
      queryKey: getListFeaturesQueryKey(),
      enabled: !specs || specs.length === 0,
    },
  });
  const allSpecs: Feature[] = specs && specs.length > 0 ? specs : fallbackFeaturesQuery.data ?? [];

  // Active Specification selected inside Composer
  const [activeSpecId, setActiveSpecId] = useState<string>(() => {
    if (selectedSpecId && selectedSpecId !== 'all') return selectedSpecId;
    return allSpecs[0]?.id || '';
  });

  // Query details (tasks and groups) for active spec if different from current page's selectedSpecId
  const specDetailsQuery = useQuery({
    queryKey: ['spec-tasks', activeSpecId],
    queryFn: async () => {
      if (!activeSpecId || activeSpecId === 'all') return { tasks: [], groups: [] };
      const res = await fetch(`/api/specs/${encodeURIComponent(activeSpecId)}/tasks`);
      if (!res.ok) return { tasks: [], groups: [] };
      const data = await res.json();
      const tasks: Task[] = Array.isArray(data) ? data : data.tasks || [];
      const specGroups: Array<{ id: string; name: string }> = data.groups || [];
      return { tasks, groups: specGroups };
    },
    enabled: Boolean(activeSpecId) && activeSpecId !== 'all',
  });

  // Effective tasks and groups for the active spec
  const currentTasks: Task[] = useMemo(() => {
    if (activeSpecId === selectedSpecId && existingTasks && existingTasks.length > 0) {
      return existingTasks;
    }
    return specDetailsQuery.data?.tasks || [];
  }, [activeSpecId, selectedSpecId, existingTasks, specDetailsQuery.data?.tasks]);

  const currentGroups: Array<{ id: string; name: string }> = useMemo(() => {
    if (activeSpecId === selectedSpecId && groups && groups.length > 0) {
      return groups;
    }
    if (specDetailsQuery.data?.groups && specDetailsQuery.data.groups.length > 0) {
      return specDetailsQuery.data.groups;
    }
    // Fallback: derive groups from currentTasks
    const uniqueGroupIds = Array.from(
      new Set(currentTasks.map((t) => t.groupId).filter(Boolean))
    );
    if (uniqueGroupIds.length > 0) {
      return uniqueGroupIds.map((gid) => ({
        id: gid,
        name: gid.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
    }
    return [{ id: 'phase-1', name: 'Phase 1: Foundation' }];
  }, [activeSpecId, selectedSpecId, groups, specDetailsQuery.data?.groups, currentTasks]);

  // Form State
  const [id, setId] = useState('');
  const [isIdManuallyEdited, setIsIdManuallyEdited] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId || 'phase-1');
  const [parentId, setParentId] = useState<string | null>(defaultParentId || null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [files, setFiles] = useState('');
  const [requirementsRef, setRequirementsRef] = useState('');

  // Calculate smart ID
  const computeSmartId = useCallback(
    (pId: string | null | undefined, gId: string, tasksList: Task[], groupsList: Array<{ id: string; name: string }>) => {
      const gIndex = groupsList.findIndex((g) => g.id === gId);
      return generateTaskId({
        parentId: pId,
        groupId: gId,
        groupIndex: gIndex,
        tasks: tasksList,
      });
    },
    []
  );

  // Sync state whenever composer is opened or defaultParentId changes
  useEffect(() => {
    if (open) {
      const initialSpecId =
        selectedSpecId && selectedSpecId !== 'all' ? selectedSpecId : allSpecs[0]?.id || '';
      setActiveSpecId(initialSpecId);

      const targetParent = defaultParentId || null;
      setParentId(targetParent);

      // Determine initial group
      let initialGroup = defaultGroupId;
      if (targetParent) {
        const pTask = currentTasks.find((t) => t.id === targetParent);
        if (pTask?.groupId) {
          initialGroup = pTask.groupId;
        }
      }
      if (!initialGroup && currentGroups.length > 0) {
        initialGroup = currentGroups[0].id;
      }
      const effectiveGroup = initialGroup || 'phase-1';
      setGroupId(effectiveGroup);

      // Generate suggested task ID
      const suggested = computeSmartId(targetParent, effectiveGroup, currentTasks, currentGroups);
      setId(suggested);
      setIsIdManuallyEdited(false);
    }
  }, [open, defaultParentId, defaultGroupId, selectedSpecId]);

  // Update suggested ID when task list arrives asynchronously if not manually edited
  useEffect(() => {
    if (open && !isIdManuallyEdited && currentTasks.length > 0) {
      const suggested = computeSmartId(parentId, groupId, currentTasks, currentGroups);
      setId(suggested);
    }
  }, [open, isIdManuallyEdited, currentTasks, currentGroups, parentId, groupId]);

  // Handle active specification change inside composer
  const handleSpecChange = (newSpecId: string) => {
    setActiveSpecId(newSpecId);
    // When spec changes, clear parent and dependencies belonging to old spec
    setParentId(null);
    setDependsOn([]);
  };

  // When activeSpecId, parentId, or groupId change, update suggested task ID if not manually edited
  const updateSuggestedId = (newParentId: string | null, newGroupId: string) => {
    const suggested = computeSmartId(newParentId, newGroupId, currentTasks, currentGroups);
    setId(suggested);
    setIsIdManuallyEdited(false);
  };

  const handleParentChange = (newParentVal: string) => {
    const nextParent = newParentVal === '__none__' || !newParentVal ? null : newParentVal;
    setParentId(nextParent);

    // If a parent is chosen, match group with parent's group if known
    let targetGroup = groupId;
    if (nextParent) {
      const parentTask = currentTasks.find((t) => t.id === nextParent);
      if (parentTask?.groupId) {
        targetGroup = parentTask.groupId;
        setGroupId(targetGroup);
      }
    }
    updateSuggestedId(nextParent, targetGroup);
  };

  const handleGroupChange = (newGroupId: string) => {
    setGroupId(newGroupId);
    if (!parentId) {
      updateSuggestedId(null, newGroupId);
    }
  };

  const handleRegenerateId = () => {
    updateSuggestedId(parentId, groupId);
  };

  const resetForm = () => {
    setId('');
    setIsIdManuallyEdited(false);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDependsOn([]);
    setFiles('');
    setRequirementsRef('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !title.trim() || !groupId.trim() || !activeSpecId) return;

    const parsedFiles = files
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedRefs = requirementsRef
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    onSubmit({
      id: id.trim(),
      specId: activeSpecId,
      groupId: groupId.trim(),
      parentId: parentId ? parentId.trim() : null,
      title: title.trim(),
      description: description.trim(),
      priority,
      dependsOn,
      files: parsedFiles,
      requirementsRef: parsedRefs,
    });
  };

  // Options for Specification selector
  const specOptions: SearchableSelectOption[] = useMemo(() => {
    return allSpecs.map((spec) => ({
      value: spec.id,
      label: spec.name || spec.id,
      sublabel: spec.id,
      badge: `${spec.completedTaskCount}/${spec.taskCount} done`,
      keywords: `${spec.id} ${spec.name} ${spec.description}`,
    }));
  }, [allSpecs]);

  // Options for Group selector
  const groupOptions: SearchableSelectOption[] = useMemo(() => {
    return currentGroups.map((g) => ({
      value: g.id,
      label: g.name,
      badge: g.id,
      keywords: `${g.id} ${g.name}`,
    }));
  }, [currentGroups]);

  // Options for Parent Task selector
  const parentOptions: SearchableSelectOption[] = useMemo(() => {
    const list: SearchableSelectOption[] = [
      {
        value: '__none__',
        label: 'None (Top-level Task)',
        sublabel: 'Creates a root task for the selected group',
        keywords: 'none root top-level',
      },
    ];

    for (const task of currentTasks) {
      list.push({
        value: task.id,
        label: `#${task.id} ${task.title}`,
        status: task.status,
        badge: task.groupId,
        keywords: `${task.id} ${task.title} ${task.groupId}`,
      });
    }

    return list;
  }, [currentTasks]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col h-full bg-background border-l border-border/80 shadow-2xl"
      >
        <SheetHeader className="p-6 pb-4 border-b border-border/70 bg-card/40">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-serif text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Create Specification Task
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Define a verifiable, scoped task with smart task ID numbering and dependency tracking.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {/* Specification & Group Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-spec" className="text-xs flex items-center gap-1.5">
                    <FolderGit2 className="h-3 w-3 text-primary" />
                    Specification <span className="text-rose-500">*</span>
                  </Label>
                  <SearchableSelect
                    id="task-composer-spec"
                    value={activeSpecId}
                    onChange={handleSpecChange}
                    options={specOptions}
                    placeholder="Select specification..."
                    searchPlaceholder="Search specifications..."
                    testId="select-task-spec"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-group" className="text-xs flex items-center gap-1.5 font-mono">
                    <Layers className="h-3 w-3 text-primary" />
                    Group / Phase <span className="text-rose-500">*</span>
                  </Label>
                  <SearchableSelect
                    id="task-composer-group"
                    value={groupId}
                    onChange={handleGroupChange}
                    options={groupOptions}
                    placeholder="Select or enter group..."
                    searchPlaceholder="Search group or enter custom ID..."
                    allowCustom
                    testId="input-task-group"
                  />
                </div>
              </div>

              {/* Parent Task Selector & Auto-generated ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-parent" className="text-xs font-mono flex items-center justify-between">
                    <span>Parent Task (Optional)</span>
                    {parentId && (
                      <span className="text-[10px] text-primary font-sans font-medium">
                        Subtask mode
                      </span>
                    )}
                  </Label>
                  <SearchableSelect
                    id="task-composer-parent"
                    value={parentId || '__none__'}
                    onChange={handleParentChange}
                    options={parentOptions}
                    placeholder="None (Top-level Task)"
                    searchPlaceholder="Search by task ID or title..."
                    testId="input-task-parent"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="task-composer-id" className="text-xs font-mono">
                      Task ID <span className="text-rose-500">*</span>
                    </Label>
                    <button
                      type="button"
                      onClick={handleRegenerateId}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      title="Auto-calculate next ID based on parent & group"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      Auto-generate
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="task-composer-id"
                      value={id}
                      onChange={(e) => {
                        setId(e.target.value);
                        setIsIdManuallyEdited(true);
                      }}
                      required
                      maxLength={48}
                      placeholder="e.g. 1.1 or 2.1"
                      className="font-mono text-xs pr-8"
                      data-testid="input-task-id"
                    />
                    {!isIdManuallyEdited && id && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center" title="Auto-generated ID">
                        <Sparkles className="h-3.5 w-3.5 text-primary opacity-70" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="task-composer-title" className="text-xs">
                  Title <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="task-composer-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={2}
                  maxLength={180}
                  placeholder="e.g. Implement JWT verification token middleware"
                  className="text-xs"
                  data-testid="input-task-title"
                />
              </div>

              {/* Scope & Description */}
              <div className="space-y-1.5">
                <Label htmlFor="task-composer-desc" className="text-xs">
                  Scope & Acceptance Description
                </Label>
                <Textarea
                  id="task-composer-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={4000}
                  placeholder="Detail user problem, expected behavior, verification constraints, and safety guidelines..."
                  className="text-xs min-h-[80px]"
                  data-testid="input-task-description"
                />
              </div>

              {/* Priority & Dependencies */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-priority" className="text-xs">
                    Priority
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(val: 'low' | 'medium' | 'high') => setPriority(val)}
                  >
                    <SelectTrigger id="task-composer-priority" className="text-xs h-9">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low" className="text-xs">Low</SelectItem>
                      <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                      <SelectItem value="high" className="text-xs">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono">
                    Dependencies (<code className="text-primary font-semibold">depends_on</code>)
                  </Label>
                  <SearchableMultiSelect
                    selectedValues={dependsOn}
                    onChange={setDependsOn}
                    tasks={currentTasks}
                    placeholder="Search and add dependencies..."
                    searchPlaceholder="Filter tasks by ID or keyword..."
                    testId="input-task-dependencies"
                  />
                </div>
              </div>

              {/* Target Files & Requirements Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-files" className="text-xs font-mono">
                    Target Files (One per line)
                  </Label>
                  <Textarea
                    id="task-composer-files"
                    value={files}
                    onChange={(e) => setFiles(e.target.value)}
                    placeholder="src/auth/jwt.ts&#10;tests/jwt.test.ts"
                    className="font-mono text-xs min-h-[60px]"
                    data-testid="input-task-files"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-refs" className="text-xs font-mono">
                    Requirements Ref (One per line)
                  </Label>
                  <Textarea
                    id="task-composer-refs"
                    value={requirementsRef}
                    onChange={(e) => setRequirementsRef(e.target.value)}
                    placeholder="SEC-01&#10;AUTH-REQ-2"
                    className="font-mono text-xs min-h-[60px]"
                    data-testid="input-task-refs"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="p-4 border-t border-border/70 bg-card/60 flex flex-row items-center justify-between">
            <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
              Target: <span className="font-semibold text-foreground">{activeSpecId}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !id.trim() || !title.trim() || !groupId.trim() || !activeSpecId}
                data-testid="button-create-task"
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {isPending ? 'Creating…' : 'Create Task'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
