import { z } from "zod";

export const ConfigSchema = z.object({
  version: z.string().default("1.0"),
  project: z.object({
    name: z.string().min(1).default("Spexy Project"),
    primary_branch: z.string().default("main"),
  }),
  gates: z.object({
    enforce_steering_approval: z.boolean().default(true),
    require_human_task_completion: z.boolean().default(true),
  }),
  checkpoints: z.object({
    enabled: z.boolean().default(true),
    max_snapshots_per_file: z.number().int().min(1).default(20),
  }),
  server: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().default(4200),
    open_browser: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  version: "1.0",
  project: {
    name: "My Project",
    primary_branch: "main",
  },
  gates: {
    enforce_steering_approval: true,
    require_human_task_completion: true,
  },
  checkpoints: {
    enabled: true,
    max_snapshots_per_file: 20,
  },
  server: {
    host: "127.0.0.1",
    port: 4200,
    open_browser: true,
  },
};
