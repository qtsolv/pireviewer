import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import Handlebars from "handlebars";
import type { PullRequestDetails } from "./github";
import defaultPromptTemplate from "../prompt.md" with { type: "text" };

export interface PromptTemplateContext {
  pr: PullRequestDetails;
  diffExcerpt: string;
  customInstructions?: string;
}

export function buildReviewPrompt(
  pr: PullRequestDetails,
  customInstructions?: string,
  maxDiffLength = 60000,
): string {
  const isTruncated = pr.diff.length > maxDiffLength;
  const diffExcerpt = isTruncated
    ? `${pr.diff.slice(0, maxDiffLength)}\n\n[...diff truncated for length...]`
    : pr.diff;

  // Check for custom prompt template in target repository, otherwise use bundled default
  let templateSource = defaultPromptTemplate;
  const repoCustomPrompt = path.join(process.cwd(), ".github", "prompt.md");

  if (fs.existsSync(repoCustomPrompt)) {
    try {
      templateSource = fs.readFileSync(repoCustomPrompt, "utf-8");
      core.info(
        `[Prompt] Using custom review prompt template from ${repoCustomPrompt}`,
      );
    } catch (err) {
      core.warning(
        `[Prompt] Failed to read custom prompt template at ${repoCustomPrompt}: ${err}`,
      );
    }
  }

  const template = Handlebars.compile(templateSource, { noEscape: true });
  const context: PromptTemplateContext = {
    pr,
    diffExcerpt,
    customInstructions,
  };

  return template(context);
}
