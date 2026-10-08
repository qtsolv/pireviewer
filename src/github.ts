import * as core from "@actions/core";
import * as github from "@actions/github";

export type OctokitClient = ReturnType<typeof github.getOctokit>;

export interface ReviewThreadComment {
  author: string;
  body: string;
}

export interface UnresolvedReviewThread {
  threadId: string;
  path: string;
  line: number | null;
  comments: ReviewThreadComment[];
}

export interface PullRequestDetails {
  title: string;
  body: string;
  author: string;
  files: Array<{
    filename: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  diff: string;
  unresolvedThreads: UnresolvedReviewThread[];
}

import type { InlineComment } from "./agents";

export type { InlineComment };

const COMMENT_TAG = "<!-- previewer-bot-review -->";

export function createGitHubClient(token: string): OctokitClient {
  return github.getOctokit(token);
}

export async function fetchPullRequestDetails(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetails> {
  core.info(`Fetching details for PR #${prNumber} in ${owner}/${repo}...`);

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  let diff = "";
  try {
    const diffResponse = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: "diff",
      },
    });
    diff = typeof diffResponse.data === "string" ? diffResponse.data : "";
  } catch (diffErr) {
    core.warning(`Unable to fetch PR raw diff: ${diffErr}`);
  }

  // Fetch unresolved review threads via GitHub GraphQL API
  let unresolvedThreads: UnresolvedReviewThread[] = [];
  try {
    core.info(`Fetching review threads for PR #${prNumber}...`);
    const result: any = await octokit.graphql(
      `
            query GetReviewThreads($owner: String!, $repo: String!, $prNumber: Int!) {
                repository(owner: $owner, name: $repo) {
                    pullRequest(number: $prNumber) {
                        reviewThreads(first: 50) {
                            nodes {
                                id
                                isResolved
                                path
                                line
                                comments(first: 5) {
                                    nodes {
                                        author { login }
                                        body
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
      { owner, repo, prNumber },
    );

    const threadNodes =
      result?.repository?.pullRequest?.reviewThreads?.nodes || [];
    unresolvedThreads = threadNodes
      .filter((t: any) => !t.isResolved)
      .map((t: any) => ({
        threadId: t.id,
        path: t.path,
        line: t.line ?? null,
        comments: (t.comments?.nodes || []).map((c: any) => ({
          author: c.author?.login || "unknown",
          body: c.body || "",
        })),
      }));

    core.info(`Found ${unresolvedThreads.length} unresolved review thread(s).`);
  } catch (gqlErr) {
    core.warning(`Unable to fetch review threads via GraphQL: ${gqlErr}`);
  }

  return {
    title: pullRequest.title,
    body: pullRequest.body || "",
    author: pullRequest.user?.login || "unknown",
    files: files.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
    })),
    diff,
    unresolvedThreads,
  };
}

function formatAgentTitle(agentName?: string): string {
  if (!agentName) return "AI Agent";
  return agentName.charAt(0).toUpperCase() + agentName.slice(1) + " Agent";
}

export async function resolveGitHubReviewThread(
  octokit: OctokitClient,
  threadId: string,
  reason?: string,
  agentName?: string,
): Promise<boolean> {
  const agentTitle = formatAgentTitle(agentName);
  try {
    if (reason) {
      try {
        await octokit.graphql(
          `
                    mutation AddReply($threadId: ID!, $body: String!) {
                        addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
                            comment { id }
                        }
                    }
                `,
          { threadId, body: `🤖 **${agentTitle} Resolution**: ${reason}` },
        );
      } catch (replyErr) {
        core.warning(`Could not add reply to thread ${threadId}: ${replyErr}`);
      }
    }

    await octokit.graphql(
      `
            mutation ResolveThread($threadId: ID!) {
                resolveReviewThread(input: { threadId: $threadId }) {
                    thread { id isResolved }
                }
            }
        `,
      { threadId },
    );

    core.info(`Successfully resolved thread ${threadId}.`);
    return true;
  } catch (err) {
    core.warning(`Failed to resolve thread ${threadId}: ${err}`);
    return false;
  }
}

export async function postPullRequestReview(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  reviewContent: string,
  inlineComments: InlineComment[] = [],
  agentName?: string,
): Promise<void> {
  const shortSha = commitSha.slice(0, 7);
  const agentTitle = formatAgentTitle(agentName);

  // 1. If inline comments were recorded, attempt submitting them through GitHub's Review API
  let inlinePosted = false;
  if (inlineComments.length > 0) {
    try {
      core.info(
        `Posting formal review with ${inlineComments.length} inline comment(s)...`,
      );
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        body: `## 🤖 ${agentTitle} Automated Review\n\n${reviewContent}\n\n---\n*Reviewed commit \`${shortSha}\` with ${agentTitle}*`,
        event: "COMMENT",
        comments: inlineComments.map((c) => ({
          path: c.path,
          line: c.line,
          side: c.side || "RIGHT",
          body: c.body,
        })),
      });
      inlinePosted = true;
      core.info(
        `Successfully posted review with inline comments on PR #${prNumber}.`,
      );
    } catch (reviewErr) {
      core.warning(
        `Failed to create formal review with inline comments (${reviewErr}). Falling back to embedding inline comments in summary...`,
      );
    }
  }

  // 2. Prepare the summary comment (embed inline comments if they couldn't be attached to the diff)
  let formattedBody = reviewContent;
  if (!inlinePosted && inlineComments.length > 0) {
    const inlineList = inlineComments
      .map((c) => `- **\`${c.path}:${c.line}\`**: ${c.body}`)
      .join("\n\n");
    formattedBody = `${reviewContent}\n\n### 📝 Line-Specific Feedback\n\n${inlineList}`;
  }

  const reviewBody = `${COMMENT_TAG}\n## 🤖 ${agentTitle} Automated Review\n\n${formattedBody}\n\n---\n*Last updated for commit \`${shortSha}\` with ${agentTitle}*`;

  // 3. Update or create the main conversation thread comment
  core.info(`Checking for existing review comment on PR #${prNumber}...`);
  let existingCommentId: number | undefined;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const found = comments.find((c) => c.body && c.body.includes(COMMENT_TAG));
    if (found) {
      existingCommentId = found.id;
    }
  } catch (listErr) {
    core.warning(`Failed to list existing comments: ${listErr}`);
  }

  if (existingCommentId) {
    core.info(`Updating existing review comment #${existingCommentId}...`);
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingCommentId,
      body: reviewBody,
    });
    core.info(`Successfully updated review comment on PR #${prNumber}.`);
  } else if (!inlinePosted) {
    core.info(
      `No prior bot review comment found. Creating new conversation comment...`,
    );
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: reviewBody,
    });
    core.info(`Successfully posted review comment on PR #${prNumber}.`);
  }
}
