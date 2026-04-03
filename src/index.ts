#!/usr/bin/env node

import { program } from "commander";
import { evolve } from "./commands/evolve.js";
import { run } from "./commands/run.js";
import { list } from "./commands/list.js";
import { deleteSnapshot } from "./commands/delete.js";
import { prune } from "./commands/prune.js";
import { listSandboxes, killSandbox, killAllSandboxes } from "./commands/sandboxes.js";
import { setVerbose } from "./lib/output.js";

program
  .name("sandsnap")
  .description("CLI for managing Deno Sandbox environments with snapshot-based workflows")
  .version("0.1.0")
  .option("-v, --verbose", "Show detailed progress logs")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

program
  .command("evolve <name>")
  .description("Create a new snapshot by running commands on a base state")
  .option("--from <snapshot>", "Base snapshot to evolve from (default: debian-13 base image)")
  .option("--timeout <duration>", "Sandbox timeout (e.g., 10m, 30m)", "10m")
  .option("--capacity <size>", "Volume capacity (e.g., 2GiB, 10GiB)", "10GiB")
  .option("--region <region>", "Region (ord or ams)", "ord")
  .option("--script <file>", "Read commands from script file")
  .option("--overwrite", "Overwrite existing snapshot with same name")
  .action(evolve);

program
  .command("run <snapshot>")
  .description("Run commands in an ephemeral sandbox (changes discarded)")
  .option("--timeout <duration>", "Sandbox timeout (e.g., 5m, 10m, session)", "session")
  .option("--region <region>", "Region (ord or ams)", "ord")
  .option("--script <file>", "Read commands from script file")
  .action(run);

program
  .command("list")
  .description("List all snapshots")
  .option("--region <region>", "Filter by region")
  .option("--json", "Output as JSON")
  .action(list);

program
  .command("delete <name>")
  .description("Delete a snapshot")
  .option("--force", "Skip confirmation prompt")
  .action(deleteSnapshot);

program
  .command("prune")
  .description("Clean up orphaned temporary volumes")
  .option("--force", "Skip confirmation prompt")
  .option("--dry-run", "Show what would be deleted without deleting")
  .action(prune);

// Sandbox management (for debugging/cleanup)
const sandboxesCmd = program
  .command("sandboxes")
  .description("Manage running sandboxes");

sandboxesCmd
  .command("list")
  .description("List running sandboxes")
  .option("--json", "Output as JSON")
  .action(listSandboxes);

sandboxesCmd
  .command("kill <id>")
  .description("Kill a running sandbox")
  .action(killSandbox);

sandboxesCmd
  .command("kill-all")
  .description("Kill all running sandboxes")
  .action(killAllSandboxes);

program.parse();
