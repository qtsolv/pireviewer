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
        const modelId = parts.slice(1).join("/");
        if (provider && modelId) {
          modelObj = modelRuntime.getModel(provider, modelId);
        }
        if (!modelObj) {
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
      let lastErrorMessage: string | undefined;

      session.subscribe((event: any) => {
        if (event.type === "tool_execution_start") {
          core.info(`[Pi] Executing: ${event.toolName || "tool"}`);
        } else if (event.type === "tool_execution_end" && event.isError) {
          core.warning(`[Pi] Tool ${event.toolName || "tool"} execution failed.`);
        } else if (event.type === "auto_retry_start") {
          core.warning(
            `[Pi] Retrying request (attempt ${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
          );
        } else if (event.type === "auto_retry_end" && !event.success) {
          lastErrorMessage = event.finalError || lastErrorMessage;
          core.error(`[Pi] Retry failed: ${event.finalError}`);
        } else if (
          event.type === "message_end" &&
          event.message?.role === "assistant"
        ) {
          if (
            event.message.errorMessage ||
            event.message.stopReason === "error"
          ) {
            lastErrorMessage = event.message.errorMessage || lastErrorMessage;
            core.error(`[Pi] Assistant error: ${lastErrorMessage}`);
          }
        }
      });

      const prompt = buildReviewPrompt(pr, options.customInstructions);
      core.info("[Pi] Prompting coding agent for PR review...");
      await session.prompt(prompt);

      const summary = session.getLastAssistantText()?.trim();
      if (!summary) {
        const failedAssistant = session.messages
          .slice()
          .reverse()
          .find(
            (m: any) =>
              m.role === "assistant" &&
              (m.errorMessage || m.stopReason === "error"),
          ) as any;
        const err = lastErrorMessage || failedAssistant?.errorMessage;
        if (err) {
          throw new Error(`Coding agent failed: ${err}`);
        }
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
