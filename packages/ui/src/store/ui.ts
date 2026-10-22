import { create } from "zustand";

type DocumentFilter = "all" | "steering" | "specifications" | "requirements" | "design";

type WorkflowUiState = {
  selectedDocumentId: string | null;
  documentFilter: DocumentFilter;
  taskComposerOpen: boolean;
  isInspectorFullWidth: boolean;
  setSelectedDocumentId: (id: string | null) => void;
  setDocumentFilter: (filter: DocumentFilter) => void;
  setTaskComposerOpen: (open: boolean) => void;
  setInspectorFullWidth: (full: boolean) => void;
  toggleInspectorFullWidth: () => void;
};

export const useWorkflowUiStore = create<WorkflowUiState>((set) => ({
  selectedDocumentId: null,
  documentFilter: "all",
  taskComposerOpen: false,
  isInspectorFullWidth: false,
  setSelectedDocumentId: (selectedDocumentId) => set({ selectedDocumentId }),
  setDocumentFilter: (documentFilter) => set({ documentFilter }),
  setTaskComposerOpen: (taskComposerOpen) => set({ taskComposerOpen }),
  setInspectorFullWidth: (isInspectorFullWidth) => set({ isInspectorFullWidth }),
  toggleInspectorFullWidth: () => set((state) => ({ isInspectorFullWidth: !state.isInspectorFullWidth })),
}));
