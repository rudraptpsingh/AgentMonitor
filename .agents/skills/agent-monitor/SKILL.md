---
name: agent-monitor
description: >-
  Inspect local AI coding agent health, detect runaway CPU/memory loops,
  reap orphaned zombie child processes, monitor token burn & 5-hour quota countdowns,
  take Merkle checkpoints before destructive bash commands, and audit context file weight.
---

# AgentMonitor — AI Agent Health & Telemetry Skill

This skill allows AI coding agents (Claude Code, Antigravity, Cursor, Codex, OpenCode) to proactively inspect local system resources, detect detached zombie processes, take instant rollback checkpoints, query quota countdowns, and audit context file weight.

--------------------------------------------------------------------------------

## When to Activate This Skill

Activate this skill when:
1. **System Resource Pressure**: The host computer is sluggish, fans are spinning high, or CPU usage is near 100%.
2. **Port or File Lock Contention**: Running a dev server or test produces `EADDRINUSE` or file access lock errors due to dead/stuck background agent processes.
3. **Risky or Destructive Edits**: Before running bulk find-and-replace, multi-file refactoring, database migrations, or destructive terminal commands (`rm`, `git reset --hard`).
4. **Token Burn & Quota Tracking**: Before starting long-running autonomous workflows to verify safe headroom under Anthropic/OpenAI 5-hour rate limits.
5. **Context Window Optimization**: To audit `CLAUDE.md`, `AGENTS.md`, and rule files to calculate token overhead and prevent context window exhaustion.

--------------------------------------------------------------------------------

## Interacting with AgentMonitor (No GUI / No Apple Notarization Required)

AgentMonitor provides three zero-notarization interfaces:
1. **Direct CLI Tool**: Run `node ./bin/agent-monitor.mjs <command>` (or `npx agent-monitor <command>`).
2. **Model Context Protocol (MCP)**: Communicates via stdio JSON-RPC using MCP tools.
3. **Rust Engine Binary**: Native local compilation via `cargo run --manifest-path src-tauri/Cargo.toml`.

None of these interfaces require Apple Notarization or Apple Developer certificates because they run as standard terminal utilities and stdio RPC servers rather than quarantined `.app` bundles.

--------------------------------------------------------------------------------

## CLI Quick Reference for Agents

Command | Description | Example Usage
:--- | :--- | :---
`health` | Scan active agent processes, total CPU%, and memory | `node ./bin/agent-monitor.mjs health`
`zombies` | List detached child processes with dead parents (PPID 1) | `node ./bin/agent-monitor.mjs zombies`
`reap` | Terminate orphaned zombies and free locked ports/files | `node ./bin/agent-monitor.mjs reap --force`
`quota` | Check token burn rate ($/hr) and 5-hr quota countdown | `node ./bin/agent-monitor.mjs quota`
`checkpoint` | Create an isolated workspace snapshot before risky edits | `node ./bin/agent-monitor.mjs checkpoint "before-refactor"`
`rollback` | Revert workspace to snapshot in 15ms | `node ./bin/agent-monitor.mjs rollback`
`context` | Calculate BPE token weight of workspace instruction files | `node ./bin/agent-monitor.mjs context`
`mcp` | Start Model Context Protocol stdio server | `node ./bin/agent-monitor.mjs mcp`
`install-skill` | Install this skill into current project or global directory | `node ./bin/agent-monitor.mjs install-skill`
`install-mcp` | Configure MCP server in Cursor, Claude Desktop, or Antigravity | `node ./bin/agent-monitor.mjs install-mcp`

--------------------------------------------------------------------------------

## MCP Tool Reference (JSON-RPC)

If connected via Model Context Protocol, the following tools are available:
- `get_agent_health`: Returns CPU%, active agent process count, and zombie alerts.
- `check_zombies`: Returns list of orphaned processes.
- `reap_zombies`: Safely kills dead-parent agent processes (`SIGTERM` -> `SIGKILL`).
- `get_quota_status`: Returns remaining time in the 5-hour rate limit window and token burn velocity.
- `create_checkpoint`: Takes a Merkle shadow-tree snapshot of the current workspace (`summary` param).
- `rollback_turn`: Restores workspace files to a snapshot in ~15ms.
- `strip_idle_mcps`: Strips unused tool schemas to save prompt cache tokens.
- `audit_context_files`: Computes token cost of instruction files.

--------------------------------------------------------------------------------

## Standard Operating Procedures for Agents

### 1. Pre-Execution Safety Check
Before running a complex or destructive task:
```bash
node ./bin/agent-monitor.mjs checkpoint "Description of upcoming task"
```
If an edit produces broken code or hallucinated deletions:
```bash
node ./bin/agent-monitor.mjs rollback
```

### 2. Fixing Stuck Ports or Dead Test Servers
When encountering `Error: listen EADDRINUSE :::8080`:
```bash
node ./bin/agent-monitor.mjs reap --force
```
Then retry starting the server or running the test suite.

### 3. Context Budget Management
Before adding large blocks of instructions to `CLAUDE.md` or `AGENTS.md`:
```bash
node ./bin/agent-monitor.mjs context
```
Verify that the total context overhead remains well below 10% of the model's total capacity.

--------------------------------------------------------------------------------

## Agent Self-Improvement & Anti-Bloat Protocol

When an agent on this machine discovers that AgentMonitor is missing a feature, lacks an edge-case process scanner, or needs modification:

### Anti-Bloat Mandates:
1. **Zero Mocks**: Never add hardcoded mock metrics, fake arrays, or synthetic timeouts. Always query live OS APIs (`libproc`, `sysinfo`, `git2`, `tiktoken-rs`).
2. **Zero Bloat**: Keep idle RAM `<14MB`. Do not add heavy external frameworks, telemetry collectors, or cloud dependencies.
3. **Zero Notarization Priority**: Ensure CLI (`agent-monitor`) and MCP stdio (`mcp-server/index.mjs`) remain fully usable without Apple Developer certificates or Gatekeeper notarization.
4. **100% Offline**: Maintain 0 bytes of external network egress.

### Modification & Testing Flow:
1. Source repo path: `/Users/rp/Documents/GitHub/AgentMonitor`
2. Test Rust engine: `cargo test --manifest-path /Users/rp/Documents/GitHub/AgentMonitor/src-tauri/Cargo.toml`
3. Test Frontend build: `npm run build` in the repo root
4. Verify CLI: `agent-monitor health --json` and `agent-monitor zombies`
5. Keep `/Users/rp/.agents/skills/agent-monitor/SKILL.md` synchronized with any changes.

