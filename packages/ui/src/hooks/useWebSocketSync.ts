import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey,
  getListDocumentsQueryKey,
  getGetDocumentQueryKey,
  getListFeaturesQueryKey,
  getListTasksQueryKey,
  getListCommentsQueryKey,
} from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';

export type WebSocketMessageType =
  | 'TASK_UPDATED'
  | 'DOC_UPDATED'
  | 'COMMENTS_UPDATED'
  | 'FILE_CORRUPTED'
  | string;

export interface WebSocketMessage {
  type: WebSocketMessageType;
  featureId?: string;
  taskId?: string;
  documentId?: string;
  path?: string;
  error?: string;
  message?: string;
  payload?: any;
  timestamp?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:4200/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || '127.0.0.1:4200';
  return `${protocol}//${host}/ws`;
}

export function useWebSocketSync() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = getWsUrl();
    try {
      setStatus('connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setStatus('connected');
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(data);

          switch (data.type) {
            case 'TASK_UPDATED': {
              void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
              void queryClient.invalidateQueries({ queryKey: getListFeaturesQueryKey() });
              if (data.featureId) {
                void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(data.featureId) });
              } else {
                void queryClient.invalidateQueries({
                  predicate: (query) =>
                    typeof query.queryKey[0] === 'string' && query.queryKey[0].includes('/tasks'),
                });
              }
              break;
            }

            case 'DOC_UPDATED': {
              void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
              void queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
              if (data.documentId) {
                void queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(data.documentId) });
              } else {
                void queryClient.invalidateQueries({
                  predicate: (query) =>
                    typeof query.queryKey[0] === 'string' && query.queryKey[0].includes('/documents'),
                });
              }
              break;
            }

            case 'COMMENTS_UPDATED': {
              void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
              void queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey() });
              if (data.documentId) {
                void queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(data.documentId) });
              }
              break;
            }

            case 'SPEC_FILES_UPDATED': {
              const specId = data.payload?.specId || data.featureId;
              if (specId) {
                void queryClient.invalidateQueries({ queryKey: ['spec-files', specId] });
              } else {
                void queryClient.invalidateQueries({ queryKey: ['spec-files'] });
              }
              void queryClient.invalidateQueries({ queryKey: ['spec-file-content'] });
              void queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
              break;
            }

            case 'FILE_CORRUPTED': {
              toast({
                title: 'File Corrupted Warning',
                description: data.path
                  ? `Corrupted file detected: ${data.path}`
                  : (data.message || data.error || 'A corrupted file was detected in the workspace.'),
                variant: 'destructive',
              });
              break;
            }

            default:
              break;
          }
        } catch {
          // If message isn't valid JSON, ignore
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setStatus('error');
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setStatus('disconnected');
        wsRef.current = null;
        // Exponential backoff reconnect: 1s, 2s, 4s, up to 10s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch {
      setStatus('error');
    }
  }, [queryClient]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected: status === 'connected',
    status,
    lastMessage,
    reconnect: connect,
  };
}
