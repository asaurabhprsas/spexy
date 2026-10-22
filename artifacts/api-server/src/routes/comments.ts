import { Router, type IRouter } from "express";
import {
  CreateCommentBody,
  CreateCommentResponse,
  ListCommentsResponse,
  ResolveCommentParams,
  ResolveCommentResponse,
} from "@workspace/api-zod";
import {
  createReviewComment,
  listReviewComments,
  resolveReviewComment,
} from "../lib/spexy";

const router: IRouter = Router();

router.get("/comments", async (_req, res): Promise<void> => {
  res.json(ListCommentsResponse.parse(await listReviewComments()));
});

router.post("/comments", async (req, res): Promise<void> => {
  const body = CreateCommentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
      code: "INVALID_COMMENT",
    });
    return;
  }
  const comment = await createReviewComment(body.data);
  if (!comment) {
    res.status(404).json({
      error: "Document not found.",
      code: "DOCUMENT_NOT_FOUND",
    });
    return;
  }
  res.status(201).json(CreateCommentResponse.parse(comment));
});

router.post(
  "/comments/:commentId/resolve",
  async (req, res): Promise<void> => {
    const params = ResolveCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: params.error.message,
        code: "INVALID_COMMENT_ID",
      });
      return;
    }
    const comment = await resolveReviewComment(params.data.commentId);
    if (!comment) {
      res.status(404).json({
        error: "Comment not found.",
        code: "COMMENT_NOT_FOUND",
      });
      return;
    }
    res.json(ResolveCommentResponse.parse(comment));
  },
);

export default router;
