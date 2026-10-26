#!/usr/bin/env node

/**
 * AgentMonitor CLI
 * Command-line interface and automation tool for local AI coding agents.
 * 
 * Zero-Notarization Architecture:
 * - Can be run by any developer or AI agent without requiring macOS Developer Certificates or Gatekeeper Notarization.
 * - Usable via CLI directly in terminal (`npx agent-monitor <cmd>` or `node bin/agent-monitor.mjs <cmd>`).
 * - Usable via Model Context Protocol (MCP) by Claude Code, Cursor, Windsurf, Codex, etc.
 * - Usable via Antigravity / Claude Code Skills (`skills/agent-monitor/SKILL.md`).
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { TOOLS, handleToolCall, scanLiveProcesses, startMcpServer } from '../mcp-server/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter(a => a.startsWith('-')));
const positional = rawArgs.filter(a => !a.startsWith('-'));
const command = flags.has('-h') || flags.has('--help') || positional[0] === 'help'
  ? 'help'
  : (positional[0] || 'health');
const isJson = flags.has('--json') || flags.has('-j');

// ANSI terminal color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function printBanner() {
  console.log(`${c.bold}${c.cyan}AgentMonitor CLI v0.2.0${c.reset} ${c.dim}— AI Agent Health & Telemetry Tool${c.reset}\n`);
}

function printHelp() {
  printBanner();
  console.log(`${c.bold}USAGE:${c.reset}`);
  console.log(`  agent-monitor <command> [options]\n`);
  console.log(`${c.bold}COMMANDS:${c.reset}`);
  console.log(`  ${c.cyan}health${c.reset}               Inspect live resource consumption across coding agents`);
  console.log(`  ${c.cyan}zombies${c.reset}              Scan OS process table for orphaned agent child processes`);
  console.log(`  ${c.cyan}reap [--force]${c.reset}       Terminate detached zombies to release locked ports & files`);
  console.log(`  ${c.cyan}quota${c.reset}                Display 5-hour rate limit countdown & token burn velocity`);
  console.log(`  ${c.cyan}checkpoint [msg]${c.reset}     Take an isolated Merkle shadow snapshot before risky edits`);
  console.log(`  ${c.cyan}rollback [snapId]${c.reset}    Revert workspace to snapshot in 15ms`);
  console.log(`  ${c.cyan}revert <file> [snapId]${c.reset}  Surgically revert single file without touching other files`);
  console.log(`  ${c.cyan}context${c.reset}              Audit static token weight of CLAUDE.md, AGENTS.md, rules`);
  console.log(`  ${c.cyan}mcp${c.reset}                  Start Model Context Protocol (MCP) stdio server for agents`);
  console.log(`  ${c.cyan}install-skill${c.reset}        Install AgentMonitor skill into .agents/skills/ in workspace`);
  console.log(`  ${c.cyan}install-mcp${c.reset}          Configure MCP in Cursor, Claude Desktop, or Antigravity\n`);
  console.log(`${c.bold}OPTIONS:${c.reset}`);
  console.log(`  --json               Output raw JSON instead of formatted text`);
  console.log(`  -h, --help           Show this help message\n`);
}

async function run() {
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    case 'health':
    case 'status': {
      const res = await handleToolCall('get_agent_health', {});
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.bold}Active Agent Processes:${c.reset} ${c.green}${res.activeAgentProcesses}${c.reset}`);
      console.log(`${c.bold}Total Agent CPU:${c.reset}        ${res.totalAgentCpuPercent > 80 ? c.red : c.green}${res.totalAgentCpuPercent}%${c.reset}`);
      console.log(`${c.bold}Orphaned Zombies:${c.reset}       ${res.orphanedZombieCount > 0 ? c.yellow : c.green}${res.orphanedZombieCount}${c.reset}`);
      console.log(`\n${c.dim}Status:${c.reset} ${res.recommendation}\n`);
      break;
    }

    case 'zombies': {
      const res = await handleToolCall('check_zombies', {});
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.bold}Zombie Child Processes:${c.reset} ${res.zombieCount > 0 ? c.yellow : c.green}${res.zombieCount}${c.reset}`);
      console.log(`${c.bold}Lock Contention Risk:${c.reset}   ${res.risk}\n`);
      if (res.orphanedProcesses.length > 0) {
        console.log(`${c.dim}PID\tCommand${c.reset}`);
        for (const p of res.orphanedProcesses) {
          console.log(`${p.pid}\t${p.comm}`);
        }
        console.log(`\n${c.yellow}Run 'agent-monitor reap' to kill orphaned processes.${c.reset}`);
      } else {
        console.log(`${c.green}No detached zombie processes detected.${c.reset}\n`);
      }
      break;
    }

    case 'reap': {
      const force = flags.has('--force') || flags.has('-f');
      const res = await handleToolCall('reap_zombies', { force });
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.green}✓ ${res.message}${c.reset}`);
      console.log(`${c.dim}Freed Memory:${c.reset} ~${res.freedEstimatedMemoryMb} MB\n`);
      break;
    }

    case 'quota': {
      const res = await handleToolCall('get_quota_status', {});
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.bold}Providers:${c.reset}            ${res.provider}`);
      console.log(`${c.bold}Rate Limit Countdown:${c.reset} ${c.cyan}${res.rateLimitCountdownRemaining}${c.reset} until 5-hr window reset`);
      console.log(`${c.bold}Safe Headroom:${c.reset}        ${c.green}${res.safeHeadroomPct}%${c.reset} (${res.tpmRiskTier})`);
      console.log(`${c.bold}Burn Velocity:${c.reset}        ${res.burnVelocityTokensMin} tokens/min (~$${res.burnCostHourlyUsd}/hr)`);
      console.log(`\n${c.dim}Recommendation:${c.reset} ${res.recommendation}\n`);
      break;
    }

    case 'checkpoint': {
      const summary = positional.slice(1).join(' ') || 'Manual checkpoint via CLI';
      const res = await handleToolCall('create_checkpoint', { summary });
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.green}✓ ${res.message}${c.reset}`);
      console.log(`${c.bold}Snapshot ID:${c.reset}   ${c.cyan}${res.snapshotId}${c.reset}`);
      console.log(`${c.bold}Summary:${c.reset}       ${res.summary}`);
      console.log(`${c.bold}Rollback SLA:${c.reset}  ${res.rollbackLatencyMs}ms\n`);
      break;
    }

    case 'rollback': {
      const snapshotId = positional[1] || 'snap_live';
      const res = await handleToolCall('rollback_turn', { snapshotId });
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.green}✓ ${res.message}${c.reset}`);
      console.log(`${c.bold}Restored Snapshot:${c.reset} ${c.cyan}${res.restoredSnapshotId}${c.reset}`);
      console.log(`${c.bold}Latency:${c.reset}           ${res.elapsedMs}ms\n`);
      break;
    }

    case 'revert': {
      const file = positional[1];
      if (!file) {
        console.error(`${c.red}Error: Please specify the file path to revert (e.g. agent-monitor revert src/App.tsx)${c.reset}`);
        process.exit(1);
      }
      const snapId = positional[2] || 'snap_live';
      const res = await handleToolCall('revert_file', { filePath: file, snapshotId: snapId });
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      if (res.success) {
        console.log(`${c.green}✓ ${res.message}${c.reset} ${c.dim}(${res.elapsedMs}ms)${c.reset}\n`);
      } else {
        console.log(`${c.red}✖ ${res.message}${c.reset}\n`);
      }
      break;
    }

    case 'context': {
      const res = await handleToolCall('audit_context_files', {});
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      printBanner();
      console.log(`${c.bold}Total Static Context Tokens:${c.reset} ${c.cyan}${res.totalContextTokens}${c.reset} / ${res.contextWindowCapacity}`);
      console.log(`${c.bold}Headroom Remaining:${c.reset}          ${c.green}${res.headroomRemainingTokens} tokens${c.reset}\n`);
      console.log(`${c.dim}File\t\t\tTokens\tBytes${c.reset}`);
      for (const f of res.auditedFiles) {
        console.log(`${f.file.padEnd(20)}\t${f.estimatedTokens}\t${f.bytes}`);
      }
      console.log();
      break;
    }

    case 'mcp': {
      // Start MCP server over stdio
      startMcpServer();
      break;
    }

    case 'install-skill': {
      printBanner();
      const targetDir = positional[1] || join(process.cwd(), '.agents', 'skills', 'agent-monitor');
      const sourceSkill = join(REPO_ROOT, 'skills', 'agent-monitor', 'SKILL.md');

      if (!existsSync(sourceSkill)) {
        console.error(`${c.red}Error:${c.reset} Source skill not found at ${sourceSkill}`);
        process.exit(1);
      }

      mkdirSync(targetDir, { recursive: true });
      const destFile = join(targetDir, 'SKILL.md');
      copyFileSync(sourceSkill, destFile);

      console.log(`${c.green}✓ AgentMonitor skill installed successfully!${c.reset}`);
      console.log(`${c.dim}Destination:${c.reset} ${destFile}`);
      console.log(`\nAI coding agents (Antigravity, Claude Code, Cursor) can now discover and run this skill.\n`);
      break;
    }

    case 'install-mcp': {
      printBanner();
      const client = positional[1] || 'all';
      const mcpScript = resolve(REPO_ROOT, 'mcp-server', 'index.mjs');
      const mcpEntry = {
        command: 'node',
        args: [mcpScript],
      };

      let installedIn = [];

      // 1. Cursor MCP (.cursor/mcp.json)
      if (client === 'all' || client === 'cursor') {
        const cursorDir = join(process.cwd(), '.cursor');
        const cursorFile = join(cursorDir, 'mcp.json');
        try {
          mkdirSync(cursorDir, { recursive: true });
          let config = { mcpServers: {} };
          if (existsSync(cursorFile)) {
            config = JSON.parse(readFileSync(cursorFile, 'utf-8'));
          }
          config.mcpServers = config.mcpServers || {};
          config.mcpServers['agent-monitor'] = mcpEntry;
          writeFileSync(cursorFile, JSON.stringify(config, null, 2));
          installedIn.push(cursorFile);
        } catch (e) {
          console.error(`Failed to configure Cursor MCP: ${e.message}`);
        }
      }

      // 2. Claude Desktop MCP (~/Library/Application Support/Claude/claude_desktop_config.json on macOS, %APPDATA%\Claude on Windows)
      if (client === 'all' || client === 'claude') {
        const isWin = process.platform === 'win32';
        const claudeDir = isWin
          ? join(process.env.APPDATA || homedir(), 'Claude')
          : join(homedir(), 'Library', 'Application Support', 'Claude');
        const claudeFile = join(claudeDir, 'claude_desktop_config.json');
        try {
          if (existsSync(claudeDir)) {
            let config = { mcpServers: {} };
            if (existsSync(claudeFile)) {
              config = JSON.parse(readFileSync(claudeFile, 'utf-8'));
            }
            config.mcpServers = config.mcpServers || {};
            config.mcpServers['agent-monitor'] = mcpEntry;
            writeFileSync(claudeFile, JSON.stringify(config, null, 2));
            installedIn.push(claudeFile);
          }
        } catch (e) {
          console.error(`Failed to configure Claude Desktop MCP: ${e.message}`);
        }
      }

      // 3. Workspace Agent MCP (.agent/mcp_config.json)
      if (client === 'all' || client === 'agent') {
        const agentDir = join(process.cwd(), '.agent');
        const agentFile = join(agentDir, 'mcp_config.json');
        try {
          mkdirSync(agentDir, { recursive: true });
          let config = { mcpServers: {} };
          if (existsSync(agentFile)) {
            config = JSON.parse(readFileSync(agentFile, 'utf-8'));
          }
          config.mcpServers = config.mcpServers || {};
          config.mcpServers['agent-monitor'] = mcpEntry;
          writeFileSync(agentFile, JSON.stringify(config, null, 2));
          installedIn.push(agentFile);
        } catch (e) {
          console.error(`Failed to configure Agent MCP: ${e.message}`);
        }
      }

      console.log(`${c.green}✓ AgentMonitor MCP configured successfully!${c.reset}`);
      for (const p of installedIn) {
        console.log(`  ${c.cyan}→${c.reset} ${p}`);
      }
      console.log(`\nAgents can now invoke tools: get_agent_health, reap_zombies, create_checkpoint, etc.\n`);
      break;
    }

    default:
      console.error(`${c.red}Unknown command:${c.reset} ${command}`);
      console.log(`Run ${c.cyan}agent-monitor --help${c.reset} to view available commands.\n`);
      process.exit(1);
  }
}

run().catch(err => {
  console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
  process.exit(1);
});
