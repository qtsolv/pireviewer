import * as core from "@actions/core";
import * as github from "@actions/github";
import main from "./main";

const token = core.getInput("token") || process.env.GITHUB_TOKEN || "";
const model = core.getInput("model") || undefined;
const agent = core.getInput("agent") || undefined;
const prompt = core.getInput("prompt") || undefined;

const {
  payload: { repository, pull_request },
  sha,
} = github.context;

if (
  !repository ||
  !repository.full_name ||
  !token ||
  !pull_request ||
  !pull_request.number
) {
  throw new Error(
    "Required GitHub context variables (repository, pull_request, or GITHUB_TOKEN) are missing.",
  );
}

const commitSha =
  pull_request.head && pull_request.head.sha ? pull_request.head.sha : sha;

main({
  repo: repository.full_name,
  pr: pull_request.number,
  sha: commitSha,
  token,
  model,
  agent,
  prompt,
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
  process.exit(1);
});
