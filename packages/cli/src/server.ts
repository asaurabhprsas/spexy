import { startServer as startServerInternal, type ServerOptions, type ServerInstance } from "./server/index";

export type { ServerOptions, ServerInstance };

export async function startServer(
  projectRootOrOptions?: string | ServerOptions,
  maybeOptions?: ServerOptions,
): Promise<ServerInstance> {
  let opts: ServerOptions = {};
  if (typeof projectRootOrOptions === "string") {
    opts = { projectRoot: projectRootOrOptions, ...maybeOptions };
  } else if (projectRootOrOptions) {
    opts = { ...projectRootOrOptions };
  }
  return startServerInternal(opts);
}
