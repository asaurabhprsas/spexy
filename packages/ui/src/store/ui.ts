import { create } from "zustand";
import { persist } from "zustand/middleware";

type DocumentFilter = "all" | "steering" | "specifications" | "requirements" | "design";
export type EditorViewMode = "split" | "rendered" | "source";
export type ColorMode = "dark" | "light" | "system";

export interface UserPreferences {
  compactMode: boolean;
  isInspectorFullWidth: boolean;
  editorViewMode: EditorViewMode;
  themeId: string;
  fontId: string;
  colorMode: ColorMode;
}

async function syncPreferencesToBackend(prefs: Partial<UserPreferences>) {
  if (typeof window === "undefined") return;
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
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
};

export const useWorkflowUiStore = create<WorkflowUiState>()(
  persist(
    (set) => ({
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

      updatePreferences: (prefs) => {
        set((state) => ({ ...state, ...prefs }));
        void syncPreferencesToBackend(prefs);
      },
    }),
    {
      name: "specflow-preferences",
      partialize: (state) => ({
        isInspectorFullWidth: state.isInspectorFullWidth,
        compactMode: state.compactMode,
        editorViewMode: state.editorViewMode,
        themeId: state.themeId,
        fontId: state.fontId,
        colorMode: state.colorMode,
      }),
    }
  )
);
