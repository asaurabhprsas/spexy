import { Router, type IRouter } from "express";
import {
  ClaimTaskBody,
  ClaimTaskParams,
  ClaimTaskResponse,
  CreateFeatureBody,
  CreateFeatureResponse,
  CreateTaskBody,
  CreateTaskParams,
  CreateTaskResponse,
  ListFeaturesResponse,
  ListTasksParams,
  ListTasksResponse,
  ReviewTaskBody,
  ReviewTaskParams,
  ReviewTaskResponse,
  SubmitTaskBody,
  SubmitTaskParams,
  SubmitTaskResponse,
} from "@workspace/api-zod";
import {
  claimFeatureTask,
  createFeature,
  createFeatureTask,
  listFeatureTasks,
  listFeatures,
  reviewFeatureTask,
  submitFeatureTask,
} from "../lib/spexy";

const router: IRouter = Router();

router.get("/features", async (_req, res): Promise<void> => {
  res.json(ListFeaturesResponse.parse(await listFeatures()));
});

router.post("/features", async (req, res): Promise<void> => {
  const body = CreateFeatureBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
      code: "INVALID_FEATURE",
    });
    return;
  }
  const feature = await createFeature(body.data);
  res.status(201).json(CreateFeatureResponse.parse(feature));
});

router.get("/features/:featureId/tasks", async (req, res): Promise<void> => {
  const params = ListTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
      code: "INVALID_FEATURE_ID",
    });
    return;
  }
  const tasks = await listFeatureTasks(params.data.featureId);
  if (!tasks) {
    res.status(404).json({
      error: "Feature not found.",
      code: "FEATURE_NOT_FOUND",
    });
    return;
  }
  res.json(ListTasksResponse.parse(tasks));
});

router.post("/features/:featureId/tasks", async (req, res): Promise<void> => {
  const params = CreateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
      code: "INVALID_FEATURE_ID",
    });
    return;
  }
  const body = CreateTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
      code: "INVALID_TASK",
    });
    return;
  }
  const task = await createFeatureTask(params.data.featureId, body.data);
  if (!task) {
    res.status(404).json({
      error: "Feature not found.",
      code: "FEATURE_NOT_FOUND",
    });
    return;
  }
  res.status(201).json(CreateTaskResponse.parse(task));
});

router.post(
  "/features/:featureId/tasks/:taskId/claim",
  async (req, res): Promise<void> => {
    const params = ClaimTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: params.error.message,
        code: "INVALID_TASK_ID",
      });
      return;
    }
    const body = ClaimTaskBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
        code: "INVALID_TASK_CLAIM",
      });
      return;
    }
    const task = await claimFeatureTask(
      params.data.featureId,
      params.data.taskId,
      body.data,
    );
    if (!task) {
      res.status(404).json({
        error: "Task not found.",
        code: "TASK_NOT_FOUND",
      });
      return;
    }
    res.json(ClaimTaskResponse.parse(task));
  },
);

router.post(
  "/features/:featureId/tasks/:taskId/submit",
  async (req, res): Promise<void> => {
    const params = SubmitTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: params.error.message,
        code: "INVALID_TASK_ID",
      });
      return;
    }
    const body = SubmitTaskBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
        code: "INVALID_TASK_SUBMISSION",
      });
      return;
    }
    const task = await submitFeatureTask(
      params.data.featureId,
      params.data.taskId,
      body.data.note,
    );
    if (!task) {
      res.status(404).json({
        error: "Task not found.",
        code: "TASK_NOT_FOUND",
      });
      return;
    }
    res.json(SubmitTaskResponse.parse(task));
  },
);

router.post(
  "/features/:featureId/tasks/:taskId/review",
  async (req, res): Promise<void> => {
    const params = ReviewTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: params.error.message,
        code: "INVALID_TASK_ID",
      });
      return;
    }
    const body = ReviewTaskBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
        code: "INVALID_TASK_REVIEW",
      });
      return;
    }
    const task = await reviewFeatureTask(
      params.data.featureId,
      params.data.taskId,
      body.data,
    );
    if (!task) {
      res.status(404).json({
        error: "Task not found.",
        code: "TASK_NOT_FOUND",
      });
      return;
    }
    res.json(ReviewTaskResponse.parse(task));
  },
);

export default router;
