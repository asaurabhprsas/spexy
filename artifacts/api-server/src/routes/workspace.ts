import { Router, type IRouter } from "express";
import {
  ApproveDocumentParams,
  ApproveDocumentResponse,
  GetDashboardResponse,
  GetDocumentParams,
  GetDocumentResponse,
  ListDocumentsResponse,
  UpdateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentResponse,
} from "@workspace/api-zod";
import {
  approveWorkspaceDocument,
  getDashboardData,
  getWorkspaceDocument,
  listWorkspaceDocuments,
  updateWorkspaceDocument,
} from "../lib/spexy";
import { SpexyError } from "../lib/spexy-errors";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  res.json(GetDashboardResponse.parse(await getDashboardData()));
});

router.get("/documents", async (_req, res): Promise<void> => {
  res.json(ListDocumentsResponse.parse(await listWorkspaceDocuments()));
});

router.get("/documents/:documentId", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
      code: "INVALID_DOCUMENT_ID",
    });
    return;
  }
  const document = await getWorkspaceDocument(params.data.documentId);
  if (!document) {
    res.status(404).json({
      error: "Document not found.",
      code: "DOCUMENT_NOT_FOUND",
    });
    return;
  }
  res.json(GetDocumentResponse.parse(document));
});

router.put("/documents/:documentId", async (req, res): Promise<void> => {
  const params = UpdateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
      code: "INVALID_DOCUMENT_ID",
    });
    return;
  }
  const body = UpdateDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
      code: "INVALID_DOCUMENT_UPDATE",
    });
    return;
  }
  const document = await updateWorkspaceDocument(
    params.data.documentId,
    body.data.content,
    body.data.expectedRevision,
  );
  if (!document) {
    res.status(404).json({
      error: "Document not found.",
      code: "DOCUMENT_NOT_FOUND",
    });
    return;
  }
  res.json(UpdateDocumentResponse.parse(document));
});

router.post(
  "/documents/:documentId/approve",
  async (req, res): Promise<void> => {
    const params = ApproveDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: params.error.message,
        code: "INVALID_DOCUMENT_ID",
      });
      return;
    }
    const document = await approveWorkspaceDocument(params.data.documentId);
    if (!document) {
      res.status(404).json({
        error: "Document not found.",
        code: "DOCUMENT_NOT_FOUND",
      });
      return;
    }
    res.json(ApproveDocumentResponse.parse(document));
  },
);

router.use(
  (
    error: unknown,
    _req: unknown,
    res: {
      status: (code: number) => {
        json: (body: { error: string; code: string }) => void;
      };
    },
    next: (error?: unknown) => void,
  ) => {
    if (!(error instanceof SpexyError)) {
      next(error);
      return;
    }
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
  },
);

export default router;
