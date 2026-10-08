import * as core from "@actions/core";
import {
  createGitHubClient,
  fetchPullRequestDetails,
  postPullRequestReview,
  resolveGitHubReviewThread,
} from "./github";
import { createReviewAgent } from "./agents";

export interface GhaExecInfo {
  repo: string;
  pr: number;
  sha: string;
  token: string;
  model?: string;
  agent?: string;
  prompt?: string;
}

export default async function main({
  repo,
  pr: prNumber,
  sha,
  token,
  model,
  agent = "pi",
  prompt: customInstructions,
}: GhaExecInfo): Promise<void> {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(
      `Invalid repository format: "${repo}". Expected "owner/repo".`,
    );
  }

  if (typeof prNumber !== "number" || isNaN(prNumber)) {
    throw new Error(`Invalid pull request number: "${prNumber}".`);
  }

  // 1. Fetch pull request metadata, changed files, unified diff, and unresolved threads
  const octokit = createGitHubClient(token);
  const prDetails = await fetchPullRequestDetails(
    octokit,
    owner,
    repoName,
    prNumber,
  );

  // 2. Instantiate review agent backend (e.g. pi)
  const reviewAgent = createReviewAgent(agent);
  core.info(`Executing review using agent backend: ${reviewAgent.name}`);

  const { summary, inlineComments, resolvedThreads } = await reviewAgent.review(
    prDetails,
    {
      model,
      customInstructions,
    },
  );

  core.setOutput("review", summary);

  // 3. Resolve review threads that were addressed in the latest changes
  for (const thread of resolvedThreads) {
    await resolveGitHubReviewThread(
      octokit,
      thread.threadId,
      thread.reason,
      reviewAgent.name,
    );
  }

  // 4. Post review and inline comments to GitHub PR
  await postPullRequestReview(
    octokit,
    owner,
    repoName,
    prNumber,
    sha,
    summary,
    inlineComments,
    reviewAgent.name,
  );
}
