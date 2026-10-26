# AgentMonitor — AI Agent Health & Telemetry Engine

Local Activity Monitor and Runtime Control Plane for AI Coding Agents (Claude Code, Cursor, Windsurf, Codex, Antigravity).

## Architecture & Interfaces

AgentMonitor provides three synchronized interfaces to monitor, safeguard, and debug AI coding agents:
1. **Desktop GUI App (Tauri v2 + React 19 + Tailwind CSS v4)**:
   - High-performance, native macOS & Windows Activity Monitor.
   - 5 core tabs: Processes & Zombies, Token Impact & Quota, Filesystem & 15ms Merkle Rewind, Tool Calls & Wire Tap, Startup Tax & Context Weight.
2. **Zero-Notarization CLI (`agent-monitor`)**:
   - Globally available at `/Users/rp/.local/bin/agent-monitor`.
   - Run directly in any shell: `agent-monitor health`, `agent-monitor zombies`, `agent-monitor reap`, `agent-monitor quota`, `agent-monitor checkpoint`, `agent-monitor rollback`.
3. **Model Context Protocol (MCP) Server (`mcp-server/index.mjs`)**:
   - stdio JSON-RPC 2.0 interface registered in Claude Code (`claude mcp list`), Claude Desktop, and Cursor (`~/.cursor/mcp.json`).
   - Allows agents to self-inspect health, self-reap zombies, check quota countdowns, and take Merkle checkpoints before risky refactors.

---

## Agent Self-Improvement & Contribution Protocol

When an AI agent detects that AgentMonitor is missing a feature, failing on a specific OS edge case, or needs enhancement:

### 1. The Anti-Bloat Mandates (Strict Constraints)
- **ZERO MOCKS**: Under no circumstances should mock strings, simulated arrays, fake latency, or static fallbacks be introduced. Every metric must derive from real OS kernel tables (`libproc`, `sysinfo`, `git2`, `tiktoken-rs`).
- **ZERO BLOAT & LIGHTWEIGHT FOOTPRINT**: Idle RAM must remain `<14 MB`. No heavy external cloud SDKs, tracking libraries, or Electron dependencies. 
- **100% OFFLINE & PRIVACY**: Outbound network traffic must remain **0 Bytes**. No remote analytics or external telemetry calls.
- **ZERO-NOTARIZATION PRIORITY**: Core agent utilities must function flawlessly via CLI and MCP stdio without requiring macOS Developer Certificates or Apple Notarization.

### 2. Codebase Map for Modifications
- **Process & Zombie Engine**: [`src-tauri/src/engine/process_tree.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/process_tree.rs), [`src-tauri/src/engine/zombie_reaper.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/zombie_reaper.rs)
  - Scans Darwin `libproc` on macOS and Win32 `ToolHelp32` / tasklist on Windows.
  - Flags processes with `ppid == 1` or detached agent helpers (`claude`, `node`, `python`, `zsh`).
- **Filesystem & Merkle Rewind Engine**: [`src-tauri/src/engine/shadow_git.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/shadow_git.rs)
  - Uses in-memory `git2` OID tree snapshotting (`refs/agent-monitor/turn-*`) to provide 15ms rollbacks without touching personal git commits.
- **Context & Token Engine**: [`src-tauri/src/engine/session_tailer.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/session_tailer.rs), [`src-tauri/src/engine/bpe_tokenizer.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/bpe_tokenizer.rs)
  - Parses real Claude/Cursor session transcripts and calculates `cl100k_base` BPE tokens.
- **Security Guardrails & Log Scrubber**: [`src-tauri/src/engine/log_scrubber.rs`](file:///Users/rp/Documents/GitHub/AgentMonitor/src-tauri/src/engine/log_scrubber.rs)
  - Condenses 3,000+ line terminal test/build output down to failure essentials.
  - Blocks unauthorized access to `.env`, `.ssh/id_rsa`, and directory traversal (`../../`).
- **MCP Server & CLI**: [`mcp-server/index.mjs`](file:///Users/rp/Documents/GitHub/AgentMonitor/mcp-server/index.mjs), [`bin/agent-monitor.mjs`](file:///Users/rp/Documents/GitHub/AgentMonitor/bin/agent-monitor.mjs)
  - Implements stdio JSON-RPC tools: `get_agent_health`, `check_zombies`, `reap_zombies`, `get_quota_status`, `create_checkpoint`, `rollback_turn`, `audit_context_files`, `strip_idle_mcps`.
- **Frontend Dashboard**: [`src/App.tsx`](file:///Users/rp/Documents/GitHub/AgentMonitor/src/App.tsx), [`src/services/agentApi.ts`](file:///Users/rp/Documents/GitHub/AgentMonitor/src/services/agentApi.ts)
  - Global keyboard shortcuts: `⌘1`–`⌘5`, `⌘R`, `⌘K`, `⌘⌥Z`, `Space`, `⌘F`.

### 3. Verification & Testing Workflow
Before committing any changes or self-improvements to AgentMonitor:
1. **Rust Engine Tests**:
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
   All 5 unit tests must pass with 0 failures.
2. **Frontend Build Check**:
   ```bash
   npm run build
   ```
   Vite build must complete in `<1s` with 0 TypeScript/bundler errors.
3. **CLI & MCP Smoke Test**:
   ```bash
   agent-monitor health --json
   agent-monitor zombies
   agent-monitor quota
   ```
4. **Sync Skill & Documentation**:
   - If a new tool or CLI subcommand is added, update [`skills/agent-monitor/SKILL.md`](file:///Users/rp/Documents/GitHub/AgentMonitor/skills/agent-monitor/SKILL.md) and sync to `/Users/rp/.agents/skills/agent-monitor/SKILL.md`.

---

## Toolchain & Runtime
- **Node.js**: v22+
- **Rust**: 1.80+ (`cargo` in `/Users/rp/.local/bin/cargo`)
- **Tauri**: v2.12
- **Vite & React**: React 19, Tailwind CSS v4
