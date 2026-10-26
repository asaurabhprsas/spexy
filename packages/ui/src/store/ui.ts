import { create } from "zustand";
import { persist } from "zustand/middleware";

type DocumentFilter = "all" | "steering" | "specifications" | "requirements" | "design";
export type EditorViewMode = "split" | "rendered" | "source";
export type ColorMode = "dark" | "light" | "system";
export type StorageTarget = "repo" | "browser";

export interface UserPreferences {
  compactMode: boolean;
  isInspectorFullWidth: boolean;
  editorViewMode: EditorViewMode;
  themeId: string;
  fontId: string;
  colorMode: ColorMode;
  storageTarget: StorageTarget;
}

async function syncPreferencesToBackend(prefs: Partial<UserPreferences>, explicitTarget?: StorageTarget) {
  if (typeof window === "undefined") return;
  const currentTarget = explicitTarget ?? useWorkflowUiStore.getState().storageTarget;
  if (currentTarget !== "repo") return;
  try {
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
  } catch {}
}

export type WorkflowUiState = {
  selectedDocumentId: string | null;
  documentFilter: DocumentFilter;
  taskComposerOpen: boolean;
  isDocumentDirty: boolean;

  // Persisted user preferences
  isInspectorFullWidth: boolean;
  compactMode: boolean;
  editorViewMode: EditorViewMode;
  themeId: string;
  fontId: string;
  colorMode: ColorMode;
  storageTarget: StorageTarget;
  lastSyncedAt: string | null;

  setSelectedDocumentId: (id: string | null) => void;
  setDocumentFilter: (filter: DocumentFilter) => void;
  setTaskComposerOpen: (open: boolean) => void;
  setIsDocumentDirty: (dirty: boolean) => void;
  setInspectorFullWidth: (full: boolean) => void;
  toggleInspectorFullWidth: () => void;
  setCompactMode: (compact: boolean) => void;
  setEditorViewMode: (mode: EditorViewMode) => void;
  setThemeId: (themeId: string) => void;
  setFontId: (fontId: string) => void;
  setColorMode: (colorMode: ColorMode) => void;
  setStorageTarget: (target: StorageTarget) => void;
  setLastSyncedAt: (timestamp: string | null) => void;
  updatePreferences: (prefs: Partial<UserPreferences>, options?: { skipBackendSync?: boolean }) => void;
  syncToProjectRepo: () => Promise<{ success: boolean; error?: string }>;
  syncFromProjectRepo: () => Promise<{ success: boolean; data?: any; error?: string }>;
};

export const useWorkflowUiStore = create<WorkflowUiState>()(
  persist(
    (set, get) => ({
      selectedDocumentId: null,
      documentFilter: "all",
      taskComposerOpen: false,
      isDocumentDirty: false,

      // Default preferences
      isInspectorFullWidth: false,
      compactMode: false,
      editorViewMode: "split",
      themeId: "default",
      fontId: "default",
      colorMode: "dark",
      storageTarget: "browser",
      lastSyncedAt: null,

      setSelectedDocumentId: (selectedDocumentId) => set({ selectedDocumentId }),
      setDocumentFilter: (documentFilter) => set({ documentFilter }),
      setTaskComposerOpen: (taskComposerOpen) => set({ taskComposerOpen }),
      setIsDocumentDirty: (isDocumentDirty) => set({ isDocumentDirty }),

      setInspectorFullWidth: (isInspectorFullWidth) => {
        set({ isInspectorFullWidth });
        void syncPreferencesToBackend({ isInspectorFullWidth });
      },

      toggleInspectorFullWidth: () =>
        set((state) => {
          const next = !state.isInspectorFullWidth;
          void syncPreferencesToBackend({ isInspectorFullWidth: next });
          return { isInspectorFullWidth: next };
        }),

      setCompactMode: (compactMode) => {
        set({ compactMode });
        void syncPreferencesToBackend({ compactMode });
      },

      setEditorViewMode: (editorViewMode) => {
        set({ editorViewMode });
        void syncPreferencesToBackend({ editorViewMode });
      },

      setThemeId: (themeId) => {
        set({ themeId });
        void syncPreferencesToBackend({ themeId });
      },

      setFontId: (fontId) => {
        set({ fontId });
        void syncPreferencesToBackend({ fontId });
      },

      setColorMode: (colorMode) => {
        set({ colorMode });
        void syncPreferencesToBackend({ colorMode });
      },

      setStorageTarget: (storageTarget) => {
        set({ storageTarget });
        if (storageTarget === "repo") {
          void syncPreferencesToBackend({ storageTarget }, "repo");
        }
      },

      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),

      updatePreferences: (prefs, options) => {
        set((state) => ({ ...state, ...prefs }));
        if (!options?.skipBackendSync) {
          void syncPreferencesToBackend(prefs);
        }
      },

      syncToProjectRepo: async () => {
        if (typeof window === "undefined") return { success: false, error: "Browser window not available" };
        const state = get();
        const payload = {
          compactMode: state.compactMode,
          isInspectorFullWidth: state.isInspectorFullWidth,
          editorViewMode: state.editorViewMode,
          themeId: state.themeId,
          fontId: state.fontId,
          colorMode: state.colorMode,
          storageTarget: state.storageTarget,
        };
        try {
          const res = await fetch("/api/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const now = new Date().toISOString();
            set({ lastSyncedAt: now });
            return { success: true };
          }
          const err = await res.json().catch(() => ({}));
          return { success: false, error: err?.error || "Failed to persist configuration to repository." };
        } catch (err: any) {
          return { success: false, error: err?.message || "Network error while saving configuration." };
        }
      },

      syncFromProjectRepo: async () => {
        if (typeof window === "undefined") return { success: false, error: "Browser window not available" };
        try {
          const res = await fetch("/api/preferences");
          if (!res.ok) {
            return { success: false, error: "Failed to fetch configuration from repository." };
          }
          const data = await res.json();
          const prefs = data?.preferences ?? data;
          if (prefs && typeof prefs === "object") {
            set((prev) => ({
              ...prev,
              ...prefs,
              lastSyncedAt: new Date().toISOString(),
            }));
            return { success: true, data: prefs };
          }
          return { success: false, error: "Empty configuration returned from repository." };
        } catch (err: any) {
          return { success: false, error: err?.message || "Network error while fetching configuration." };
        }
      },
    }),
    {
      name: "spexy-preferences",
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          return {
            ...persistedState,
            storageTarget: "browser",
          };
        }
        return persistedState;
      },
      partialize: (state) => ({
        isInspectorFullWidth: state.isInspectorFullWidth,
        compactMode: state.compactMode,
        editorViewMode: state.editorViewMode,
        themeId: state.themeId,
        fontId: state.fontId,
        colorMode: state.colorMode,
        storageTarget: state.storageTarget,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
