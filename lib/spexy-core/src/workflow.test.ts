import { describe, expect, it } from "vitest";
import {
  getTaskAvailability,
  transitionTask,
  validateTaskGraph,
  type TaskDefinition,
} from "./workflow.js";

const task = (
  id: string,
  dependsOn: string[] = [],
): TaskDefinition => ({
  id,
  groupId: "phase-one",
  parentId: null,
  title: `Task ${id}`,
  description: "",
  priority: "medium",
  dependsOn,
  files: [],
  requirementsRef: [],
});

describe("Spexy workflow rules", () => {
  it("rejects dependency cycles before a task graph is accepted", () => {
    expect(() =>
      validateTaskGraph([
        task("design", ["implementation"]),
        task("implementation", ["design"]),
      ]),
    ).toThrow(/cycle/i);
  });

  it("keeps dependent work blocked until every prerequisite is human-approved done", () => {
    const graph = validateTaskGraph([
      task("foundation"),
      task("dashboard", ["foundation"]),
    ]);

    expect(
      getTaskAvailability(graph, {
        foundation: "to-review",
        dashboard: "todo",
      }).get("dashboard"),
    ).toBe("blocked");

    expect(
      getTaskAvailability(graph, {
        foundation: "done",
        dashboard: "todo",
      }).get("dashboard"),
    ).toBe("available");
  });

  it("allows agents to submit work but never approve it as done", () => {
    expect(transitionTask("in-progress", "submit", "agent")).toBe("to-review");
    expect(() => transitionTask("to-review", "approve", "agent")).toThrow(
      /human/i,
    );
    expect(transitionTask("to-review", "approve", "human")).toBe("done");
    expect(transitionTask("to-review", "reject", "human")).toBe("todo");
  });
});
