import React, { useMemo, useState } from 'react';
import type { Task } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  Layers,
  Sparkles,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Info,
  X,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react';

interface TaskDagViewerProps {
  tasks: Task[];
  onSelectTask?: (task: Task) => void;
}

interface DagNode {
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
}

interface DagEdge {
  fromId: string;
  toId: string;
  fromNode: DagNode;
  toNode: DagNode;
}

function getTaskDependencies(task: Task | undefined): string[] {
  if (!task) return [];
  const deps = task.dependsOn || (task as any).depends_on || [];
  return Array.isArray(deps) ? deps : [];
}

export function TaskDagViewer({ tasks, onSelectTask }: TaskDagViewerProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Compute graph layout (ranks, positions, and edges)
  const { nodes, edges, width, height, nodeMap } = useMemo(() => {
    const nodeWidth = 200;
    const nodeHeight = 68;
    const xSpacing = 280;
    const ySpacing = 100;
    const paddingX = 60;
    const paddingY = 60;

    const taskMap = new Map<string, Task>();
    for (const t of tasks) {
      taskMap.set(t.id, t);
      if ((t as any).originalId) {
        taskMap.set((t as any).originalId, t);
      }
    }

    // 1. Calculate ranks (topological levels)
    const rankMap = new Map<string, number>();

    const calculateRank = (taskId: string, visited: Set<string> = new Set()): number => {
      if (rankMap.has(taskId)) return rankMap.get(taskId)!;
      if (visited.has(taskId)) return 0; // prevent cycles

      visited.add(taskId);
      const t = taskMap.get(taskId);
      const deps = getTaskDependencies(t);
      if (!t || deps.length === 0) {
        rankMap.set(taskId, 0);
        return 0;
      }

      let maxDepRank = -1;
      for (const depId of deps) {
        if (taskMap.has(depId)) {
          const r = calculateRank(depId, new Set(visited));
          if (r > maxDepRank) maxDepRank = r;
        }
      }

      const currentRank = maxDepRank + 1;
      rankMap.set(taskId, currentRank);
      return currentRank;
    };

    for (const t of tasks) {
      calculateRank(t.id);
    }

    // 2. Group by rank
    const columns = new Map<number, Task[]>();
    let maxRank = 0;
    for (const t of tasks) {
      const r = rankMap.get(t.id) ?? 0;
      if (r > maxRank) maxRank = r;
      if (!columns.has(r)) columns.set(r, []);
      columns.get(r)!.push(t);
    }

    // 3. Assign (x, y) coordinates
    const calculatedNodes: DagNode[] = [];
    const nMap = new Map<string, DagNode>();
    let maxColumnLength = 1;

    for (const [r, colTasks] of Array.from(columns.entries())) {
      if (colTasks.length > maxColumnLength) {
        maxColumnLength = colTasks.length;
      }
      colTasks.forEach((t, index) => {
        const x = paddingX + r * xSpacing;
        const y = paddingY + index * ySpacing;
        const node: DagNode = {
          task: t,
          x,
          y,
          width: nodeWidth,
          height: nodeHeight,
          rank: r,
        };
        calculatedNodes.push(node);
        nMap.set(t.id, node);
      });
    }

    // 4. Build directed edges (from dependency -> dependent)
    const calculatedEdges: DagEdge[] = [];
    for (const t of tasks) {
      const toNode = nMap.get(t.id);
      if (!toNode) continue;
      const deps = getTaskDependencies(t);

      for (const depId of deps) {
        const fromNode =
          nMap.get(depId) ||
          Array.from(nMap.values()).find((n) => (n.task as any).originalId === depId);
        if (fromNode) {
          calculatedEdges.push({
            fromId: fromNode.task.id,
            toId: t.id,
            fromNode,
            toNode,
          });
        }
      }
    }

    const calculatedWidth = Math.max(900, paddingX * 2 + (maxRank + 1) * xSpacing);
    const calculatedHeight = Math.max(500, paddingY * 2 + maxColumnLength * ySpacing + 40);

    return {
      nodes: calculatedNodes,
      edges: calculatedEdges,
      width: calculatedWidth,
      height: calculatedHeight,
      nodeMap: nMap,
    };
  }, [tasks]);

  // Compute dependency chain (upstream + downstream) for highlighting
  const { highlightedNodeIds, highlightedEdgeKeys } = useMemo(() => {
    if (!selectedTaskId) {
      return {
        highlightedNodeIds: new Set<string>(),
        highlightedEdgeKeys: new Set<string>(),
      };
    }

    const nodeIds = new Set<string>([selectedTaskId]);
    const edgeKeys = new Set<string>();

    // 1. Upstream dependencies (what does this task depend on)
    const traverseUp = (currId: string) => {
      const node = nodeMap.get(currId);
      if (!node) return;
      const deps = getTaskDependencies(node.task);
      for (const depId of deps) {
        const targetNode =
          nodeMap.get(depId) ||
          Array.from(nodeMap.values()).find((n) => (n.task as any).originalId === depId);
        const resolvedId = targetNode ? targetNode.task.id : depId;
        if (!nodeIds.has(resolvedId)) {
          nodeIds.add(resolvedId);
          edgeKeys.add(`${resolvedId}->${currId}`);
          traverseUp(resolvedId);
        } else {
          edgeKeys.add(`${resolvedId}->${currId}`);
        }
      }
    };

    // 2. Downstream dependents (what depends on this task)
    const traverseDown = (currId: string) => {
      for (const edge of edges) {
        if (edge.fromId === currId) {
          if (!nodeIds.has(edge.toId)) {
            nodeIds.add(edge.toId);
            edgeKeys.add(`${edge.fromId}->${edge.toId}`);
            traverseDown(edge.toId);
          } else {
            edgeKeys.add(`${edge.fromId}->${edge.toId}`);
          }
        }
      }
    };

    traverseUp(selectedTaskId);
    traverseDown(selectedTaskId);

    return {
      highlightedNodeIds: nodeIds,
      highlightedEdgeKeys: edgeKeys,
    };
  }, [selectedTaskId, nodeMap, edges]);

  const handleNodeClick = (task: Task) => {
    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
    } else {
      setSelectedTaskId(task.id);
      if (onSelectTask) {
        onSelectTask(task);
      }
    }
  };

  const getStatusColor = (task: Task) => {
    if (task.status === 'done') {
      return {
        fill: '#10b981', // emerald-500
        border: 'border-emerald-500',
        bg: 'bg-emerald-500/15',
        text: 'text-emerald-700 dark:text-emerald-400',
      };
    }
    if (task.availability === 'blocked' || (task.blockers && task.blockers.length > 0)) {
      return {
        fill: '#f43f5e', // rose-500
        border: 'border-rose-500',
        bg: 'bg-rose-500/15',
        text: 'text-rose-700 dark:text-rose-400',
      };
    }
    if (task.status === 'to-review') {
      return {
        fill: '#f59e0b', // amber-500
        border: 'border-amber-500',
        bg: 'bg-amber-500/15',
        text: 'text-amber-700 dark:text-amber-400',
      };
    }
    if (task.status === 'in-progress') {
      return {
        fill: '#0ea5e9', // sky-500
        border: 'border-sky-500',
        bg: 'bg-sky-500/15',
        text: 'text-sky-700 dark:text-sky-400',
      };
    }
    // todo
    return {
      fill: '#94a3b8', // slate-400
      border: 'border-slate-400',
      bg: 'bg-slate-500/15',
      text: 'text-slate-700 dark:text-slate-400',
    };
  };

  const selectedTask = selectedTaskId ? nodeMap.get(selectedTaskId)?.task : null;

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-40 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">No tasks to visualize</h3>
        <p className="mt-1 text-xs">Add tasks with declared dependencies to see the directed acyclic graph.</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
      {/* Visualizer Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3 bg-muted/20">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
            <Layers size={14} className="text-primary" />
            Dependency DAG Visualizer
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {nodes.length} Nodes • {edges.length} Dependencies
          </Badge>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-slate-400" />
            Todo
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-sky-500" />
            In Progress
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" />
            To Review
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rose-500" />
            Blocked
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Done
          </span>
        </div>

        {/* Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground w-10 text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </Button>
          {selectedTaskId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 ml-2"
              onClick={() => setSelectedTaskId(null)}
            >
              <RotateCcw size={12} />
              Clear Chain
            </Button>
          )}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative min-h-[480px] max-h-[640px] overflow-auto bg-background/50 p-6 flex justify-center items-start">
        <svg
          width={width * zoomLevel}
          height={height * zoomLevel}
          viewBox={`0 0 ${width} ${height}`}
          className="transition-all duration-150"
        >
          <defs>
            {/* Standard arrow marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>

            {/* Highlighted chain arrow marker */}
            <marker
              id="arrow-highlighted"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
            </marker>

            {/* Drop shadow filter for nodes */}
            <filter id="node-shadow" x="-5%" y="-5%" width="115%" height="115%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* Background Grid Pattern (optional visual polish) */}
          <g opacity="0.1">
            {Array.from({ length: Math.ceil(width / 40) }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 40} y1={0} x2={i * 40} y2={height} stroke="currentColor" strokeDasharray="2 4" />
            ))}
            {Array.from({ length: Math.ceil(height / 40) }).map((_, i) => (
              <line key={`h-${i}`} x1={0} y1={i * 40} x2={width} y2={i * 40} stroke="currentColor" strokeDasharray="2 4" />
            ))}
          </g>

          {/* Edges */}
          <g className="edges">
            {edges.map((edge) => {
              const edgeKey = `${edge.fromId}->${edge.toId}`;
              const isEdgeHighlighted = highlightedEdgeKeys.has(edgeKey);
              const isDimmed = selectedTaskId !== null && !isEdgeHighlighted;

              const x1 = edge.fromNode.x + edge.fromNode.width;
              const y1 = edge.fromNode.y + edge.fromNode.height / 2;
              const x2 = edge.toNode.x;
              const y2 = edge.toNode.y + edge.toNode.height / 2;

              // Smooth cubic bezier curve between nodes
              const dx = Math.max(40, (x2 - x1) * 0.5);
              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

              return (
                <path
                  key={edgeKey}
                  d={pathData}
                  fill="none"
                  stroke={isEdgeHighlighted ? '#3b82f6' : '#94a3b8'}
                  strokeWidth={isEdgeHighlighted ? 2.5 : 1.5}
                  strokeOpacity={isDimmed ? 0.2 : isEdgeHighlighted ? 1 : 0.6}
                  markerEnd={isEdgeHighlighted ? 'url(#arrow-highlighted)' : 'url(#arrow)'}
                  className="transition-all duration-200"
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {nodes.map((node) => {
              const isSelected = selectedTaskId === node.task.id;
              const isInChain = highlightedNodeIds.has(node.task.id);
              const isDimmed = selectedTaskId !== null && !isInChain;
              const color = getStatusColor(node.task);

              return (
                <g
                  key={node.task.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node.task)}
                  className="cursor-pointer group"
                  opacity={isDimmed ? 0.35 : 1}
                  filter="url(#node-shadow)"
                >
                  {/* Node Rectangle */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="8"
                    ry="8"
                    className={`transition-all duration-200 ${
                      isSelected
                        ? 'fill-card stroke-primary stroke-[2.5px]'
                        : isInChain
                        ? 'fill-card stroke-blue-500 stroke-[2px]'
                        : 'fill-card stroke-border/90 group-hover:stroke-primary/60 stroke-[1.2px]'
                    }`}
                  />

                  {/* Status Color Accent Bar */}
                  <rect
                    x="0"
                    y="0"
                    width="4"
                    height={node.height}
                    rx="2"
                    ry="2"
                    fill={color.fill}
                  />

                  {/* Task ID and Status Badge text */}
                  <text
                    x="12"
                    y="18"
                    className="font-mono text-[9px] fill-muted-foreground font-medium"
                  >
                    {node.task.id}
                  </text>

                  {/* Status Indicator Dot */}
                  <circle
                    cx={node.width - 14}
                    cy="14"
                    r="4"
                    fill={color.fill}
                  />

                  {/* Title (Truncated if needed) */}
                  <text
                    x="12"
                    y="36"
                    className="font-sans text-[11px] font-semibold fill-foreground tracking-tight"
                  >
                    {node.task.title.length > 24
                      ? `${node.task.title.slice(0, 24)}…`
                      : node.task.title}
                  </text>

                  {/* Footer status text / dependency count */}
                  <text
                    x="12"
                    y="54"
                    className="font-mono text-[9px] fill-muted-foreground capitalize"
                  >
                    {node.task.status.replace('-', ' ')} • {getTaskDependencies(node.task).length} dep
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Selected Task Details Overlay Card */}
        {selectedTask && (
          <aside className="absolute right-4 top-4 w-72 rounded-xl border border-border bg-card/95 backdrop-blur-md p-4 shadow-xl animate-in fade-in slide-in-from-right duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase text-primary font-semibold flex items-center gap-1">
                <Info size={12} />
                Selected Node
              </span>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded font-semibold">
                  {selectedTask.id}
                </span>
                <Badge variant="outline" className="font-mono text-[9px] uppercase">
                  {selectedTask.status}
                </Badge>
              </div>

              <h4 className="text-xs font-semibold text-foreground leading-snug">
                {selectedTask.title}
              </h4>

              {selectedTask.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                  {selectedTask.description}
                </p>
              )}

              {/* Dependencies Chain Summary */}
              <div className="pt-2 border-t border-border/60 text-[10px] font-mono space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <LinkIcon size={10} />
                  <span>
                    Depends on:{' '}
                    {getTaskDependencies(selectedTask).length
                      ? getTaskDependencies(selectedTask).join(', ')
                      : 'None (Root)'}
                  </span>
                </div>
                {selectedTask.blockers && selectedTask.blockers.length > 0 && (
                  <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <AlertCircle size={10} />
                    <span>Blockers: {selectedTask.blockers.join(', ')}</span>
                  </div>
                )}
                {selectedTask.worktree && (
                  <div className="flex items-center gap-1 text-primary">
                    <GitBranch size={10} />
                    <span>Worktree: {selectedTask.worktree}</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
