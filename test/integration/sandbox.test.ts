/**
 * Integration tests for sandsnap
 * 
 * These tests require DENO_DEPLOY_TOKEN environment variable to be set.
 * They create real sandboxes and snapshots, so they're slower and cost money.
 * 
 * Run with: npm run test:integration
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync, exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const CLI = "node dist/index.js";
const TEST_PREFIX = `test-${Date.now()}`;

interface ExecResult {
  stdout: string;
  exitCode: number;
}

function run(cmd: string): ExecResult {
  try {
    // Redirect stderr to stdout to capture all output
    const stdout = execSync(`${CLI} ${cmd} 2>&1`, {
      encoding: "utf8",
      timeout: 180000, // 3 minutes
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err && "status" in err) {
      const e = err as { stdout: string; status: number };
      return { stdout: e.stdout || "", exitCode: e.status || 1 };
    }
    throw err;
  }
}

function runWithStdin(cmd: string, stdin: string): ExecResult {
  try {
    // Redirect stderr to stdout to capture all output
    const stdout = execSync(`${CLI} ${cmd} 2>&1`, {
      input: stdin,
      encoding: "utf8",
      timeout: 180000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err && "status" in err) {
      const e = err as { stdout: string; status: number };
      return { stdout: e.stdout || "", exitCode: e.status || 1 };
    }
    throw err;
  }
}

// Check if token is available
const hasToken = !!process.env.DENO_DEPLOY_TOKEN;

describe("Integration Tests", { skip: !hasToken }, () => {
  const snapshotName = `${TEST_PREFIX}-snap`;
  const evolvedSnapshotName = `${TEST_PREFIX}-evolved`;
  
  // Cleanup old test snapshots before running
  before(async () => {
    console.log("Cleaning up old test snapshots...");
    try {
      const { stdout } = run("list --json");
      const snapshots = JSON.parse(stdout) as { slug: string }[];
      for (const snap of snapshots) {
        // Clean up any snapshot starting with "test-" followed by digits (timestamps)
        if (/^test-\d+/.test(snap.slug)) {
          console.log(`  Deleting old test snapshot: ${snap.slug}`);
          try {
            execSync(`${CLI} delete ${snap.slug} --force 2>&1`, { stdio: "pipe" });
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  });
  
  // Cleanup after all tests
  after(async () => {
    console.log("Cleaning up test snapshots...");
    // Delete in reverse order of creation (evolved depends on base)
    for (const snap of [`${TEST_PREFIX}-temp`, evolvedSnapshotName, snapshotName]) {
      try {
        execSync(`${CLI} delete ${snap} --force 2>&1`, { stdio: "pipe", timeout: 60000 });
        console.log(`  Deleted ${snap}`);
      } catch { /* ignore */ }
    }
  });

  describe("sandsnap list", () => {
    it("lists snapshots", () => {
      const { stdout } = run("list");
      // Should have header or no snapshots message
      assert.ok(stdout.includes("NAME") || stdout.includes("No snapshots"));
    });

    it("lists snapshots as JSON", () => {
      const { stdout } = run("list --json");
      const data = JSON.parse(stdout);
      assert.ok(Array.isArray(data));
    });
  });

  describe("sandsnap evolve", () => {
    it("creates a snapshot from base image", () => {
      const script = `
echo "test-marker-${TEST_PREFIX}" | sudo tee /etc/test-marker
cat /etc/test-marker
`;
      const { stdout } = runWithStdin(`evolve ${snapshotName}`, script);
      assert.ok(stdout.includes("test-marker-" + TEST_PREFIX), `Output should contain marker: ${stdout}`);
      assert.ok(stdout.includes(`Snapshot '${snapshotName}' created!`), `Output should contain success message: ${stdout}`);
    });

    it("creates a snapshot from existing snapshot", () => {
      const script = `
cat /etc/test-marker
echo "evolved-marker" | sudo tee /etc/evolved-marker
`;
      const { stdout } = runWithStdin(`evolve ${evolvedSnapshotName} --from ${snapshotName}`, script);
      assert.ok(stdout.includes("test-marker-" + TEST_PREFIX), `Output should contain marker: ${stdout}`);
      assert.ok(stdout.includes(`Snapshot '${evolvedSnapshotName}' created!`), `Output should contain success message: ${stdout}`);
    });

    it("fails if snapshot already exists without --overwrite", () => {
      const { stdout } = runWithStdin(`evolve ${snapshotName}`, "echo test");
      assert.ok(stdout.includes("already exists"), `Should fail with 'already exists': ${stdout}`);
    });
  });

  describe("sandsnap run", () => {
    it("runs commands in ephemeral sandbox", () => {
      const { stdout } = runWithStdin(`run ${snapshotName}`, `
cat /etc/test-marker
echo "ephemeral-test" > /tmp/ephemeral.txt
cat /tmp/ephemeral.txt
`);
      assert.ok(stdout.includes("test-marker-" + TEST_PREFIX));
      assert.ok(stdout.includes("ephemeral-test"));
    });

    it("does not persist changes", () => {
      // First run creates a file
      runWithStdin(`run ${snapshotName}`, `echo "should-not-persist" > /tmp/persist-test.txt`);
      
      // Second run should not see the file
      const { stdout } = runWithStdin(`run ${snapshotName}`, `
cat /tmp/persist-test.txt 2>&1 || echo "FILE_NOT_FOUND"
`);
      assert.ok(stdout.includes("FILE_NOT_FOUND"));
    });

    it("verifies evolved snapshot has both markers", () => {
      const { stdout } = runWithStdin(`run ${evolvedSnapshotName}`, `
cat /etc/test-marker
cat /etc/evolved-marker
`);
      assert.ok(stdout.includes("test-marker-" + TEST_PREFIX));
      assert.ok(stdout.includes("evolved-marker"));
    });
  });

  describe("sandsnap run --copy", () => {
    const tempDir = `/tmp/sandsnap-test-${TEST_PREFIX}`;
    
    before(() => {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, "input.txt"), "hello from host\n");
    });
    
    after(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("copies file into sandbox", () => {
      const { stdout } = runWithStdin(
        `run ${snapshotName} --copy ${tempDir}/input.txt:/tmp/input.txt`,
        `cat /tmp/input.txt`
      );
      assert.ok(stdout.includes("hello from host"));
    });

    it("copies file out of sandbox", () => {
      const outputFile = path.join(tempDir, "output.txt");
      runWithStdin(
        `run ${snapshotName} --copy-out /etc/test-marker:${outputFile}`,
        `cat /etc/test-marker`
      );
      
      const content = fs.readFileSync(outputFile, "utf8");
      assert.ok(content.includes("test-marker-" + TEST_PREFIX));
    });
  });

  describe("sandsnap delete", () => {
    it("deletes a snapshot", () => {
      // Create a temporary snapshot to delete
      const tempSnap = `${TEST_PREFIX}-temp`;
      runWithStdin(`evolve ${tempSnap}`, `echo "temp"`);
      
      // Delete it
      const { stdout } = run(`delete ${tempSnap} --force`);
      assert.ok(stdout.includes(`Deleted snapshot '${tempSnap}'`), `Should show deleted message: ${stdout}`);
      
      // Verify it's gone
      const listResult = run("list --json");
      const snapshots = JSON.parse(listResult.stdout);
      assert.ok(!snapshots.some((s: { slug: string }) => s.slug === tempSnap));
    });
  });
});
