import { z } from "zod";

export const DocumentStatusSchema = z.enum([
  "draft",
  "in-review",
  "changes-requested",
  "approved",
]);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const DocumentFrontmatterSchema = z.object({
  status: DocumentStatusSchema.default("draft"),
  updated_at: z.string().datetime().or(z.string()),
  approved_by: z.literal("human").nullable().default(null),
});

export type DocumentFrontmatter = z.infer<typeof DocumentFrontmatterSchema>;

export function parseDocumentFrontmatter(content: string): {
  frontmatter: DocumentFrontmatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: {
        status: "draft",
        updated_at: new Date().toISOString(),
        approved_by: null,
      },
      body: content,
    };
  }

  const rawYaml = match[1];
  const body = match[2];

  const parsedLines: Record<string, unknown> = {};
  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val: unknown = trimmed.slice(colonIdx + 1).trim();
    if (val === "null") val = null;
    else if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (typeof val === "string" && (val.startsWith('"') || val.startsWith("'"))) {
      val = val.slice(1, -1);
    }
    parsedLines[key] = val;
  }

  const safe = DocumentFrontmatterSchema.safeParse(parsedLines);
  return {
    frontmatter: safe.success
      ? safe.data
      : {
          status: "draft",
          updated_at: new Date().toISOString(),
          approved_by: null,
        },
    body,
  };
}

export function serializeDocumentWithFrontmatter(
  frontmatter: DocumentFrontmatter,
  body: string,
): string {
  const approvedByVal = frontmatter.approved_by ? `"${frontmatter.approved_by}"` : "null";
  return `---
status: ${frontmatter.status}
updated_at: ${frontmatter.updated_at}
approved_by: ${approvedByVal}
---

${body.trimStart()}`;
}
