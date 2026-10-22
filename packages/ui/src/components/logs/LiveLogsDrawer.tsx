import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  X,
  Trash2,
  ArrowDownCircle,
  Filter,
  Activity,
  Layers,
  FileText,
  MessageSquare,
  Cpu,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebSocketSync, type WebSocketMessage } from '@/hooks/useWebSocketSync';

export type LogCategory = 'TASK' | 'DOC' | 'COMMENT' | 'SYSTEM';

export interface LogEvent {
  id: string;
  timestamp: string;
  category: LogCategory;
  actor: string;
  message: string;
  details?: {
    taskId?: string;
    taskTitle?: string;
    [key: string]: any;
  };
}

interface LiveLogsDrawerProps {
  open: boolean;
  onClose: () => void;
  onLogsCountChange?: (count: number) => void;
}

export function LiveLogsDrawer({ open, onClose, onLogsCountChange }: LiveLogsDrawerProps) {
  const { isConnected, lastMessage } = useWebSocketSync();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [drawerHeight, setDrawerHeight] = useState<number>(320);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastProcessedMsgRef = useRef<WebSocketMessage | null>(null);

  // Top draggable resize handler
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 180;
      const maxHeight = window.innerHeight * 0.8; // 80vh
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setDrawerHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Initial fetch from /api/logs
  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && !cancelled) {
            setLogs(data);
          }
        }
      } catch {
        // Fallback or offline
      }
    }
    void fetchLogs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen to WebSocket messages
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessedMsgRef.current) return;
    lastProcessedMsgRef.current = lastMessage;

    if (lastMessage.type === 'LOG_EVENT' && lastMessage.payload) {
      const newLog: LogEvent = {
        id: lastMessage.payload.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: lastMessage.payload.timestamp || new Date().toISOString(),
        category: (lastMessage.payload.category as LogCategory) || 'SYSTEM',
        actor: lastMessage.payload.actor || 'System',
        message: lastMessage.payload.message || 'Activity event',
        details: lastMessage.payload.details || (lastMessage.payload.taskTitle ? {
          taskId: lastMessage.payload.taskId,
          taskTitle: lastMessage.payload.taskTitle,
        } : undefined),
      };
      setLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)]);
    } else if (lastMessage.type === 'TASK_UPDATED') {
      const taskId = lastMessage.taskId || lastMessage.payload?.taskId || lastMessage.payload?.specId;
      const taskTitle = lastMessage.payload?.taskTitle || lastMessage.payload?.title;
      const newLog: LogEvent = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        category: 'TASK',
        actor: 'Agent/Human',
        message: `Task updated: ${taskId || 'workflow task'}`,
        details: taskTitle || taskId ? { taskId, taskTitle } : undefined,
      };
      setLogs((prev) => [newLog, ...prev]);
    } else if (lastMessage.type === 'DOC_UPDATED') {
      const newLog: LogEvent = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        category: 'DOC',
        actor: 'Workspace',
        message: `Specification updated: ${lastMessage.documentId || lastMessage.payload?.file || 'document'}`,
      };
      setLogs((prev) => [newLog, ...prev]);
    } else if (lastMessage.type === 'COMMENTS_UPDATED') {
      const newLog: LogEvent = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        category: 'COMMENT',
        actor: 'Reviewer',
        message: `Review comments synchronized`,
      };
      setLogs((prev) => [newLog, ...prev]);
    }
  }, [lastMessage]);

  // Notify parent of total log count
  useEffect(() => {
    onLogsCountChange?.(logs.length);
  }, [logs.length, onLogsCountChange]);

  // Auto-scroll to top/bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    if (categoryFilter === 'ALL') return logs;
    return logs.filter((l) => l.category.toUpperCase() === categoryFilter.toUpperCase());
  }, [logs, categoryFilter]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getCategoryBadge = (category: LogCategory) => {
    switch (category) {
      case 'TASK':
        return (
          <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[9px] uppercase">
            <Layers size={10} />
            TASK
          </Badge>
        );
      case 'DOC':
        return (
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] uppercase">
            <FileText size={10} />
            DOC
          </Badge>
        );
      case 'COMMENT':
        return (
          <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[9px] uppercase">
            <MessageSquare size={10} />
            COMMENT
          </Badge>
        );
      case 'SYSTEM':
      default:
        return (
          <Badge variant="outline" className="gap-1 border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono text-[9px] uppercase">
            <Cpu size={10} />
            SYSTEM
          </Badge>
        );
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 sm:px-6 pointer-events-none">
      <div
        style={{ height: isExpanded ? '85vh' : `${drawerHeight}px` }}
        className={`pointer-events-auto flex flex-col w-full max-w-5xl rounded-t-2xl border border-border/90 bg-card/95 shadow-2xl backdrop-blur-xl ${
          isResizing ? 'select-none transition-none' : 'transition-[height] duration-200'
        }`}
      >
        {/* Top Draggable Resize Bar */}
        <div
          onMouseDown={handleMouseDownResize}
          className="w-full h-3 cursor-ns-resize flex items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors group select-none shrink-0 rounded-t-2xl"
          title="Drag up or down to resize height"
        >
          <div className="w-12 h-1 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
        </div>

        {/* Drawer Header */}
        <header className="flex items-center justify-between border-b border-border/80 px-4 py-2.5 bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Terminal size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm font-semibold tracking-tight">Live Activity Logs</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px]">
                  <span
                    className={`size-1.5 rounded-full ${
                      isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {isConnected ? 'LIVE WS' : 'OFFLINE'}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5">
                  {filteredLogs.length} events
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                Real-time human-agent orchestration stream
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Filter Pill Selector */}
            <div className="hidden sm:flex items-center gap-1 mr-2 bg-background/60 p-0.5 rounded-lg border border-border/60">
              {['ALL', 'TASK', 'DOC', 'COMMENT', 'SYSTEM'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                    categoryFilter === cat
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Auto scroll toggle */}
            <Button
              size="sm"
              variant={autoScroll ? 'secondary' : 'ghost'}
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-7 px-2 text-[11px] gap-1"
              title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll paused'}
            >
              <ArrowDownCircle size={13} className={autoScroll ? 'text-primary' : 'text-muted-foreground'} />
              <span className="hidden md:inline">Auto-scroll</span>
            </Button>

            {/* Clear logs */}
            <Button
              size="sm"
              variant="ghost"
              onClick={clearLogs}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1"
              title="Clear log history"
            >
              <Trash2 size={13} />
              <span className="hidden md:inline">Clear</span>
            </Button>

            {/* Expand / Collapse */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7 p-0"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </Button>

            {/* Close */}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-7 w-7 p-0 hover:bg-muted"
              title="Close Logs"
            >
              <X size={14} />
            </Button>
          </div>
        </header>

        {/* Mobile filter bar */}
        <div className="flex sm:hidden items-center gap-1 px-3 py-1.5 border-b border-border/60 bg-muted/20 overflow-x-auto">
          {['ALL', 'TASK', 'DOC', 'COMMENT', 'SYSTEM'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Logs Stream Container */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto divide-y divide-border/40 p-2 font-mono text-xs bg-background/50"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Activity size={24} className="mb-2 opacity-40 animate-pulse" />
              <p className="text-xs">No activity logged yet.</p>
              <p className="text-[11px] text-muted-foreground/70">
                Workspace events, task state transitions, and review annotations will stream here.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap sm:flex-nowrap items-start gap-2.5 py-2 px-3 hover:bg-muted/30 rounded-md transition-colors animate-in fade-in duration-150"
              >
                <time className="text-[10px] text-muted-foreground shrink-0 pt-0.5 w-20">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>

                <div className="shrink-0">{getCategoryBadge(log.category)}</div>

                <span className="shrink-0 font-medium text-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
                  {log.actor}
                </span>

                <div className="flex-1 min-w-0">
                  {log.details?.taskTitle && (
                    <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
                      <Layers size={11} />
                      <span>Task: &ldquo;{log.details.taskTitle}&rdquo;</span>
                      {log.details.taskId && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({log.details.taskId})
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-foreground break-words leading-relaxed text-[11px]">
                    {log.message}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
