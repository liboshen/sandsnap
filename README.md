# sandsnap

A CLI for managing Deno Sandbox environments with simplified snapshot-based workflows. Create, evolve, and run isolated Linux environments without dealing with volumes directly.

## Concept

```
base-image ──[commands]──► snapshot-A ──[commands]──► snapshot-B
                                       ╲
                                        ──[different commands]──► snapshot-C
```

Snapshots are immutable environment states. You **evolve** from one snapshot to create another, or **run** ephemeral commands against a snapshot without modifying it.

## Features

- **Snapshot-based workflow** - Think in terms of environment states, not volumes
- **Evolve environments** - `snapshot A` + `commands` → `snapshot B`
- **Ephemeral execution** - Run commands against a snapshot without modifying it
- **Heredoc support** - Perfect for AI agents and scripting
- **Auto-cleanup** - Smart deletion of snapshots and their backing storage

## Installation

```bash
# Using npm
npm install -g sandsnap

# Or run directly with npx
npx sandsnap <command>
```

Requires Node.js 24+ and a [Deno Deploy](https://console.deno.com/) account.

## Setup

1. Create an account at [console.deno.com](https://console.deno.com/)
2. Go to **Settings → Organization tokens** and create a token
3. Set the token:
   ```bash
   export DENO_DEPLOY_TOKEN=<your-token>
   ```

## Quick Start

```bash
# Create a snapshot with Python installed
sandsnap evolve python-env <<'EOF'
sudo apt-get update
sudo apt-get install -y python3 python3-pip
python3 --version
EOF

# Run commands against it (ephemeral - changes discarded)
sandsnap run python-env <<'EOF'
python3 -c "print('Hello from sandbox!')"
EOF

# Evolve further from existing snapshot
sandsnap evolve python-ml --from python-env <<'EOF'
pip3 install numpy pandas scikit-learn
python3 -c "import numpy; print(numpy.__version__)"
EOF

# Interactive shell
sandsnap run python-ml

# List all snapshots
sandsnap list

# Delete a snapshot (auto-cleans backing storage)
sandsnap delete python-env --force
```

## Commands

### `sandsnap evolve <name>`

Create a new snapshot by running commands on a base state.

```bash
# From base Debian image (default)
sandsnap evolve my-env

# From existing snapshot
sandsnap evolve my-env-v2 --from my-env

# With script file
sandsnap evolve my-env --script setup.sh

# With heredoc
sandsnap evolve my-env <<'EOF'
apt-get update
apt-get install -y curl git
EOF

# Overwrite existing snapshot
sandsnap evolve my-env --overwrite <<'EOF'
# new setup
EOF
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--from <snapshot>` | Base snapshot to evolve from | debian-13 |
| `--timeout <duration>` | Sandbox timeout (e.g., `10m`, `30m`) | `10m` |
| `--capacity <size>` | Volume capacity (e.g., `2GiB`, `10GiB`) | `10GiB` |
| `--memory <size>` | Sandbox memory (e.g., `1GiB`, `2GiB`, `4GiB`) | `1280MiB` |
| `--region <region>` | Region (`ord` or `ams`) | `ord` |
| `--copy <src:dst>` | Copy file/dir from host to sandbox (repeatable) | - |
| `--script <file>` | Read commands from file | - |
| `--overwrite` | Replace existing snapshot | `false` |

### `sandsnap run <snapshot>`

Run commands in an ephemeral sandbox. Changes are discarded after exit.

```bash
# Interactive shell
sandsnap run my-env

# Run commands
sandsnap run my-env <<'EOF'
echo "Hello"
python3 script.py
EOF

# With script file
sandsnap run my-env --script test.sh
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--timeout <duration>` | Sandbox timeout | `session` |
| `--memory <size>` | Sandbox memory (e.g., `1GiB`, `2GiB`, `4GiB`) | `1280MiB` |
| `--region <region>` | Region (`ord` or `ams`) | `ord` |
| `--copy <src:dst>` | Copy file/dir from host to sandbox (repeatable) | - |
| `--copy-out <src:dst>` | Copy file/dir from sandbox to host (repeatable) | - |
| `--script <file>` | Read commands from file | - |

### `sandsnap list`

List all snapshots.

```bash
sandsnap list
sandsnap list --json
sandsnap list --region ord
```

### `sandsnap delete <name>`

Delete a snapshot and clean up its backing storage.

```bash
sandsnap delete my-env
sandsnap delete my-env --force  # Skip confirmation
```

### `sandsnap prune`

Clean up orphaned temporary volumes.

```bash
sandsnap prune --dry-run  # See what would be deleted
sandsnap prune --force    # Delete without confirmation
```

### `sandsnap sandboxes`

Manage running sandboxes (for debugging).

```bash
sandsnap sandboxes list           # List all sandboxes
sandsnap sandboxes kill <id>      # Kill a specific sandbox
sandsnap sandboxes kill-all       # Kill all running sandboxes
```

## Global Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed progress logs |
| `-h, --help` | Show help |
| `--version` | Show version |

## Examples

### Setting up a development environment

```bash
# Create base environment
sandsnap evolve dev-base <<'EOF'
sudo apt-get update
sudo apt-get install -y git curl wget build-essential
EOF

# Add Node.js
sandsnap evolve dev-node --from dev-base <<'EOF'
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
EOF

# Add Python
sandsnap evolve dev-python --from dev-base <<'EOF'
sudo apt-get install -y python3 python3-pip python3-venv
python3 --version
EOF
```

### Running tests in isolation

```bash
# Run tests against a clean environment every time
sandsnap run dev-node <<'EOF'
cd /tmp
git clone https://github.com/user/repo.git
cd repo
npm install
npm test
EOF
```

### File copy workflow

```bash
# Copy files into sandbox, process, copy results out
sandsnap run python-env \
  --copy ./data:/home/app/data \
  --copy ./config.json:/home/app/config.json \
  --copy-out /home/app/results:/tmp/results \
  <<'EOF'
python3 process.py --config /home/app/config.json
EOF

# Check results
ls /tmp/results/
```

### AI agent workflow

```bash
# Agent can use heredocs to run arbitrary commands
RESULT=$(sandsnap run python-env <<'EOF'
python3 -c "
import json
result = {'status': 'ok', 'value': 42}
print(json.dumps(result))
"
EOF
)
echo "$RESULT"
```

## Notes

- Commands run as `app` user; use `sudo` for system operations
- Snapshots are region-specific (`ord` = Chicago, `ams` = Amsterdam)
- Default timeout is `session` for `run` (dies when CLI exits) and `10m` for `evolve`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DENO_DEPLOY_TOKEN` | Required. Your Deno Deploy organization token |

## License

MIT
