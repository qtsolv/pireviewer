import * as core from "@actions/core";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { PullRequestDetails } from "../../github";
import { buildReviewPrompt } from "../../prompt";
import type {
  AgentReviewOptions,
  AgentReviewResult,
  InlineComment,
  ResolvedThreadAction,
  ReviewAgent,
} from "../types";
import { createPiReviewTools } from "./tools";

export class PiReviewAgent implements ReviewAgent {
  readonly name = "pi";

  async review(
    pr: PullRequestDetails,
    options: AgentReviewOptions = {},
  ): Promise<AgentReviewResult> {
    core.info("[Pi] Initializing coding agent session in-process...");

    const inlineComments: InlineComment[] = [];
    const resolvedThreads: ResolvedThreadAction[] = [];
    const customTools = createPiReviewTools(inlineComments, resolvedThreads);

    let modelObj;
    if (options.model) {
      try {
        const modelRuntime = await ModelRuntime.create();
        const parts = options.model.split("/");
        const provider = parts[0];
        const modelId = parts[1];
        if (provider && modelId) {
          modelObj = modelRuntime.getModel(provider, modelId);
        } else {
          modelObj = modelRuntime
            .getAllModels()
            .find(
              (m) =>
                m.id === options.model ||
                `${m.provider}/${m.id}` === options.model,
            );
        }

        if (modelObj) {
          core.info(`[Pi] Using model: ${modelObj.provider}/${modelObj.id}`);
        } else {
          core.warning(
            `[Pi] Model "${options.model}" not found in registry. Using default configured model.`,
          );
        }
      } catch (err) {
        core.warning(`[Pi] Failed to resolve model "${options.model}": ${err}`);
      }
    }

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      customTools,
      ...(modelObj ? { model: modelObj as any } : {}),
    });

    try {
      session.subscribe((event) => {
        if (event.type === "tool_execution_start") {
          core.info(`[Pi] Executing: ${(event as any).toolName || "tool"}`);
        }
      });

      const prompt = buildReviewPrompt(pr, options.customInstructions);
      core.info("[Pi] Prompting coding agent for PR review...");
      await session.prompt(prompt);

      const summary = session.getLastAssistantText()?.trim();
      if (!summary) {
        throw new Error(
          "Coding agent completed without generating review feedback.",
        );
      }

      return {
        summary,
        inlineComments,
        resolvedThreads,
      };
    } finally {
      session.dispose();
    }
  }
}
