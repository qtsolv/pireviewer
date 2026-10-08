# PReviewer

A custom GitHub Action to automate Pull Request reviews using the programmatic [Pi Coding Agent SDK](https://pi.dev) (`@earendil-works/pi-coding-agent`).

## Features

- **Pluggable Agent Backends**: Modular backend interface (`ReviewAgent`) making it effortless to switch between different agent engines (default: `pi`).
- **Programmatic In-Process Integration**: Runs the AI coding agent directly in TypeScript without external CLI overhead.
- **Octokit Integration**: Fetches PR metadata, changed file list, unified diff, and unresolved review threads.
- **Schema-Enforced Inline Code Comments**: Uses custom agent tools (`add_inline_comment`) allowing the agent to post targeted inline comments and suggestions directly to specific lines in the PR diff.
- **Auto-Resolve Addressed Threads**: Inspects existing unresolved review threads and uses `resolve_review_thread` to mark threads as resolved once addressed in subsequent commits.
- **Automatic In-Place Comment Updates**: Reuses and edits its existing review comment on subsequent pushes instead of cluttering the PR conversation with duplicate messages.

## Example Workflow

Create `.github/workflows/review.yml` in your repository:

```yaml
name: Pi PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: previewer-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run PReviewer Action
        uses: qtsolv/previewer@v1
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          model: "anthropic/claude-sonnet-4-5" # optional
```

## Development & Building

1. Install dependencies:

   ```bash
   bun install
   ```

2. Build the action bundle (Node.js target):
   ```bash
   bun run build
   ```
