import * as core from "@actions/core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { InlineComment, ResolvedThreadAction } from "../types";

export function createAddInlineCommentTool(
  inlineComments: InlineComment[],
): ToolDefinition {
  return {
    name: "add_inline_comment",
    label: "add_inline_comment",
    description:
      "Add an inline review comment on a specific line of code in the PR diff.",
    parameters: {
      type: "object",
      required: ["path", "line", "body"],
      properties: {
        path: {
          type: "string",
          description:
            'Relative path of the changed file (e.g. "src/index.ts")',
        },
        line: {
          type: "number",
          description:
            "Line number in the changed file from the PR diff to attach feedback to",
        },
        side: {
          type: "string",
          enum: ["RIGHT", "LEFT"],
          description:
            'Side of diff: "RIGHT" for additions/modifications (default), "LEFT" for deletions',
        },
        body: {
          type: "string",
          description:
            "The review comment or code suggestion for this specific line",
        },
      },
    },
    execute: async (_toolCallId: string, params: any) => {
      const comment: InlineComment = {
        path: String(params.path),
        line: Number(params.line),
        side: params.side === "LEFT" ? "LEFT" : "RIGHT",
        body: String(params.body),
      };
      inlineComments.push(comment);
      core.info(
        `[Pi] Recorded inline comment on ${comment.path}:${comment.line}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Recorded inline comment on ${comment.path}:${comment.line}.`,
          },
        ],
        details: undefined,
      };
    },
  } as unknown as ToolDefinition;
}

export function createResolveThreadTool(
  resolvedThreads: ResolvedThreadAction[],
): ToolDefinition {
  return {
    name: "resolve_review_thread",
    label: "resolve_review_thread",
    description:
      "Mark an unresolved GitHub review thread as resolved when the issue has been addressed by the latest changes.",
    parameters: {
      type: "object",
      required: ["threadId", "reason"],
      properties: {
        threadId: {
          type: "string",
          description:
            'The threadId from the existing unresolved review threads list (e.g. "PRRT_...")',
        },
        reason: {
          type: "string",
          description:
            "Explanation of how the issue was fixed or addressed in the new changes",
        },
      },
    },
    execute: async (_toolCallId: string, params: any) => {
      const action: ResolvedThreadAction = {
        threadId: String(params.threadId),
        reason: String(params.reason),
      };
      resolvedThreads.push(action);
      core.info(
        `[Pi] Marked thread ${action.threadId} for resolution: ${action.reason}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Thread ${action.threadId} recorded for resolution.`,
          },
        ],
        details: undefined,
      };
    },
  } as unknown as ToolDefinition;
}

export function createPiReviewTools(
  inlineComments: InlineComment[],
  resolvedThreads: ResolvedThreadAction[],
): ToolDefinition[] {
  return [
    createAddInlineCommentTool(inlineComments),
    createResolveThreadTool(resolvedThreads),
  ];
}
