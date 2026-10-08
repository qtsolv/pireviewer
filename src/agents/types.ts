import type { PullRequestDetails } from "../github";

export interface InlineComment {
  path: string;
  line: number;
  side?: "RIGHT" | "LEFT";
  body: string;
}

export interface ResolvedThreadAction {
  threadId: string;
  reason: string;
}

export interface AgentReviewResult {
  summary: string;
  inlineComments: InlineComment[];
  resolvedThreads: ResolvedThreadAction[];
}

export interface AgentReviewOptions {
  model?: string;
  customInstructions?: string;
}

export interface ReviewAgent {
  readonly name: string;
  review(
    pr: PullRequestDetails,
    options?: AgentReviewOptions,
  ): Promise<AgentReviewResult>;
}
