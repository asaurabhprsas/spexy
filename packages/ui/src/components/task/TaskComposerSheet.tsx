import React, { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

export interface CreateTaskFormData {
  id: string;
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
  defaultGroupId?: string;
}

export function TaskComposerSheet({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
  defaultGroupId = '',
}: TaskComposerSheetProps) {
  const [id, setId] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [parentId, setParentId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dependsOn, setDependsOn] = useState('');
  const [files, setFiles] = useState('');
  const [requirementsRef, setRequirementsRef] = useState('');

  const resetForm = () => {
    setId('');
    setGroupId(defaultGroupId);
    setParentId('');
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDependsOn('');
    setFiles('');
    setRequirementsRef('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !title.trim() || !groupId.trim()) return;

    const parsedDependsOn = dependsOn
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

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
      groupId: groupId.trim(),
      parentId: parentId.trim() || null,
      title: title.trim(),
      description: description.trim(),
      priority,
      dependsOn: parsedDependsOn,
      files: parsedFiles,
      requirementsRef: parsedRefs,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col h-full bg-background border-l border-border/80 shadow-2xl"
      >
        <SheetHeader className="p-6 pb-4 border-b border-border/70 bg-card/40">
          <SheetTitle className="font-serif text-lg sm:text-xl font-bold tracking-tight text-foreground">
            Create Specification Task
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Define a verifiable, scoped task that human or autonomous agents can claim and execute.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-id" className="text-xs font-mono">
                    Task ID <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="task-composer-id"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    required
                    maxLength={32}
                    placeholder="e.g. auth-middleware-jwt"
                    className="font-mono text-xs"
                    data-testid="input-task-id"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-composer-group" className="text-xs font-mono">
                    Group ID / Phase <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="task-composer-group"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    required
                    maxLength={64}
                    placeholder="e.g. phase-1-foundations"
                    className="font-mono text-xs"
                    data-testid="input-task-group"
                  />
                </div>
              </div>

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
                  className="text-xs min-h-[90px]"
                  data-testid="input-task-description"
                />
              </div>

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
                  <Label htmlFor="task-composer-parent" className="text-xs font-mono">
                    Parent Task ID (Optional)
                  </Label>
                  <Input
                    id="task-composer-parent"
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    placeholder="parent-task-id"
                    className="font-mono text-xs"
                    data-testid="input-task-parent"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-composer-deps" className="text-xs font-mono">
                  Depends On (One task ID per line)
                </Label>
                <Textarea
                  id="task-composer-deps"
                  value={dependsOn}
                  onChange={(e) => setDependsOn(e.target.value)}
                  placeholder="setup-db-schema&#10;auth-contracts"
                  className="font-mono text-xs min-h-[64px]"
                  data-testid="input-task-dependencies"
                />
              </div>

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
                    className="font-mono text-xs min-h-[64px]"
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
                    className="font-mono text-xs min-h-[64px]"
                    data-testid="input-task-refs"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="p-4 border-t border-border/70 bg-card/60 flex flex-row items-center justify-end gap-2">
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
              disabled={isPending || !id.trim() || !title.trim() || !groupId.trim()}
              data-testid="button-create-task"
              className="gap-1.5"
            >
              <Plus size={14} />
              {isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
