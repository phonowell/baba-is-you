#!/usr/bin/env node
import {
  ensureClean,
  ensureNoInProgressState,
  requireWorktreeBranch,
  runGitFast,
} from "./git-utils.js";

const parseArgs = (argv) => {
  const options = { base: "main" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      const scriptPath = process.argv[1] ?? "rebase-worktree.js";
      console.log(`Usage: node ${scriptPath} [--base <branch>]`);
      process.exit(0);
    }
    if (arg === "--base") {
      const value = argv[i + 1];
      if (!value) exitWith("missing value for --base");
      options.base = value;
      i += 1;
      continue;
    }
    exitWith(`unknown arg: ${arg}`);
  }
  return options;
};

const { base } = parseArgs(process.argv.slice(2));
const currentBranch = requireWorktreeBranch(base);

ensureNoInProgressState();
ensureClean(process.cwd(), currentBranch);

runGitFast({
  args: ["fetch", "--prune"],
  context: `fetch origin (${currentBranch})`,
  tag: "rebase",
});
runGitFast({
  args: ["rebase", base],
  context: `rebase ${base} (${currentBranch})`,
  tag: "rebase",
});
