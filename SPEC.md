# Sandboxer CLI Specification

A CLI utility for managing Deno Sandbox environments with simplified snapshot-based workflows. Designed to be run via `npx` without installation.

## Goals

1. **Simplify snapshot management** - Abstract away volumes; users think only in terms of snapshots (immutable states)
2. **Support environment evolution** - `snapshot A` + `commands` → `snapshot B`
3. **Enable ephemeral evaluation** - Run commands/tests against a snapshot without modifying it
4. **AI-agent friendly** - Support heredoc/stdin for multi-line scripts
5. **Zero install** - Runnable via `npx sandsnap`

## Non-Goals

- Replacing the full `deno sandbox` CLI
- Managing Deno Deploy apps
- Multi-region orchestration (single region per snapshot is fine)

---

## Commands

### `sandsnap evolve <new-snapshot>`

Create a new snapshot by running commands on a base state.

**Options:**
| Option | Description |
|--------|-------------|
| `--from <snapshot>` | Base snapshot to evolve from. If omitted, uses `debian-13` base image |
| `--copy <src>:<dst>` | Copy file/directory from host to sandbox before running commands. Repeatable |
| `--script <file>` | Read commands from a script file |
| `--region <region>` | Region for the snapshot (`ord` or `ams`). Default: `ord` |

**Input modes (mutually exclusive):**
1. **Interactive** - No script provided → opens interactive shell. Exit to finalize snapshot.
2. **Script file** - `--script ./setup.sh`
3. **Stdin** - Pipe or heredoc (auto-detected when stdin is not a TTY)

**Behavior:**
1. Create a writable volume from `--from` snapshot (or base image)
2. Boot sandbox with volume as root
3. Copy any `--copy` files into sandbox
4. Execute commands (interactive shell, script file, or stdin)
5. On successful exit (exit code 0), snapshot the volume as `<new-snapshot>`
6. Clean up volume
7. On failure (non-zero exit), prompt user: save anyway? discard? open shell to debug?

**Examples:**
```bash
# From base image, interactive
sandsnap evolve python-base

# From existing snapshot, with script file
sandsnap evolve python-ml --from python-base --script ./setup-ml.sh

# Heredoc (AI-agent friendly)
sandsnap evolve python-dev --from python-base <<'EOF'
apt-get update
apt-get install -y python3 python3-pip python3-venv
pip install pytest black ruff
EOF

# With file copying
sandsnap evolve my-app-env --from python-base --copy ./requirements.txt:/tmp/ <<'EOF'
pip install -r /tmp/requirements.txt
EOF
```

---

### `sandsnap run <snapshot>`

Run commands in an ephemeral sandbox. No snapshot is created; changes are discarded.

**Options:**
| Option | Description |
|--------|-------------|
| `--copy <src>:<dst>` | Copy file/directory from host to sandbox. Repeatable |
| `--copy-out <src>:<dst>` | Copy file/directory from sandbox to host after execution. Repeatable |
| `--script <file>` | Read commands from a script file |
| `--timeout <duration>` | Sandbox timeout (e.g., `5m`, `30m`). Default: `10m` |

**Input modes:** Same as `evolve` (interactive, script file, stdin)

**Behavior:**
1. Boot ephemeral sandbox from snapshot (read-only root, writes are discarded)
2. Copy any `--copy` files into sandbox
3. Execute commands
4. Copy any `--copy-out` files back to host
5. Sandbox auto-terminates

**Examples:**
```bash
# Interactive shell for exploration
sandsnap run python-ml

# Run evaluation script
sandsnap run python-ml --script ./evaluate.sh

# Full evaluation workflow with file I/O
sandsnap run python-ml \
  --copy ./model:/app/model \
  --copy ./test-data:/app/data \
  --copy-out /app/results:./output \
  <<'EOF'
cd /app
python evaluate.py --model ./model --data ./data --output ./results
EOF

# AI agent running tests
sandsnap run python-dev --copy ./code:/app --copy-out /app/coverage:./coverage <<'EOF'
cd /app
pip install -e .
pytest --cov=. --cov-report=html:coverage
EOF
```

---

### `sandsnap list`

List all snapshots.

**Options:**
| Option | Description |
|--------|-------------|
| `--region <region>` | Filter by region |
| `--json` | Output as JSON |

**Output:**
```
NAME                  REGION   SIZE        CREATED
python-base           ord      245 MiB     2024-01-15 10:30
python-ml             ord      1.2 GiB     2024-01-15 11:45
node-base             ord      312 MiB     2024-01-14 09:00
```

---

### `sandsnap delete <snapshot>`

Delete a snapshot.

**Options:**
| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |

**Behavior:**
- Prompts for confirmation unless `--force`
- Warns if other snapshots might depend on it (if we track lineage)

---

### `sandsnap info <snapshot>`

Show detailed information about a snapshot.

**Output:**
```
Name:       python-ml
Region:     ord
Size:       1.2 GiB
Created:    2024-01-15 11:45:22 UTC
From:       python-base
Bootable:   true
```

---

## Technical Implementation

### Technology Stack
- **Runtime:** Node.js (for npx compatibility)
- **Language:** TypeScript
- **SDK:** `@deno/sandbox` (npm package)
- **CLI framework:** Consider `commander` or `yargs`

### Volume Management (Hidden from User)

The CLI manages temporary volumes internally:

```
evolve python-ml --from python-base:

1. client.volumes.create({
     slug: "sandsnap-tmp-{uuid}",
     region: "ord",
     capacity: "10GiB",
     from: "python-base"  // snapshot
   })

2. client.sandboxes.create({
     region: "ord", 
     root: "sandsnap-tmp-{uuid}"  // volume (writable)
   })

3. [run commands]

4. client.volumes.snapshot(volume.id, {
     slug: "python-ml"
   })

5. client.volumes.delete("sandsnap-tmp-{uuid}")
```

### Stdin Detection

```typescript
const isInteractive = process.stdin.isTTY;
if (!isInteractive) {
  // Read script from stdin
  const script = await readStdin();
}
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Snapshot already exists | Error: "Snapshot 'X' already exists. Use a different name or delete it first." |
| Source snapshot not found | Error: "Snapshot 'X' not found. Run 'sandsnap list' to see available snapshots." |
| Command fails (non-zero exit) in `evolve` | Prompt: "Command failed (exit 1). [s]ave anyway, [d]iscard, [o]pen shell?" |
| Command fails in `run` | Just exit with same code, still do `--copy-out` |
| Network error | Retry with backoff, then fail with clear message |
| `--copy` source not found | Error before starting sandbox |
| `--copy-out` source not found | Warning, continue with other files |

### Configuration

Config file at `~/.config/sandsnap/config.json`:
```json
{
  "defaultRegion": "ord",
  "defaultTimeout": "10m"
}
```

Environment variables:
- `DENO_DEPLOY_TOKEN` - Required for API access (passed through to SDK)
- `SANDBOXER_REGION` - Override default region

---

## Package Structure

```
sandsnap/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # CLI entry point
│   ├── commands/
│   │   ├── evolve.ts
│   │   ├── run.ts
│   │   ├── list.ts
│   │   ├── delete.ts
│   │   └── info.ts
│   ├── lib/
│   │   ├── sandbox.ts    # Wrapper around @deno/sandbox
│   │   ├── volume.ts     # Volume management helpers
│   │   ├── copy.ts       # File copy utilities
│   │   └── stdin.ts      # Stdin reading
│   └── utils/
│       ├── config.ts
│       └── output.ts     # Pretty printing
├── README.md
└── SPEC.md
```

### package.json (key fields)

```json
{
  "name": "sandsnap",
  "version": "0.1.0",
  "bin": {
    "sandsnap": "./dist/index.js"
  },
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "dependencies": {
    "@deno/sandbox": "^latest",
    "commander": "^12.0.0"
  }
}
```

---

## Future Considerations (Out of Scope for v1)

- **Snapshot lineage tracking** - Track parent relationships for visualization
- **Snapshot tagging** - Add metadata/labels to snapshots
- **Snapshot export/import** - Backup snapshots locally
- **Parallel execution** - Run same script on multiple snapshots
- **Cost estimation** - Show estimated cost before operations
- **Snapshot diffing** - Show what changed between snapshots

---

## Open Questions

1. **Snapshot naming conflicts:** Should we support `--overwrite` flag for `evolve`?
2. **Cleanup on Ctrl+C:** During `evolve`, if user Ctrl+C, should we:
   - Discard everything (current plan)
   - Prompt to save partial work
3. **Default timeout for `evolve`:** Interactive sessions might need longer. `30m`?
4. **Volume capacity:** Fixed at 10GiB or configurable?
