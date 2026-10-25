// SOLID Interface for AgentMonitor Telemetry & Control API

export interface AgentProcessNode {
  pid: number
  ppid: number
  name: string
  command: string
  repoName?: string
  agentType: string
  state: 'thinking' | 'toolLoop' | 'cpuHang' | 'zombie' | 'idle'
  cpuUsage: number
  memoryMb: number
  stepCount?: number
  maxSteps?: number
  isZombie: boolean
  children: AgentProcessNode[]
}

export interface SystemStatsSummary {
  totalAgentCpu: number
  totalAgentMemoryMb: number
  zombieCount: number
  zombieMemoryMb: number
  activeAgentCount: number
}

export interface TokenSessionMetrics {
  id: string
  sessionName: string
  provider: string
  model: string
  coldStartTaxTokens: number
  activeMcpsCount: number
  burnRateTokensMin: number
  burnRateCostHr: number
  taskCostDollars: number
  quota5hrPct: number
  quotaWeeklyPct: number
  quotaStatus: string
  tone: string
}

export interface ModifiedFileEntry {
  path: string
  status: 'M' | 'A' | 'D'
  additions: number
  deletions: number
  patch?: string
}

export interface CheckpointTurn {
  turnNumber: number
  timestampStr: string
  promptSummary: string
  filesSummary: string
  filesModifiedCount: number
  linesAdded: number
  linesDeleted: number
  guardrailStatus: string
  snapshotId: string
  tone: string
  diffFile?: string
  diffContent?: string
  modifiedFiles?: ModifiedFileEntry[]
}

export interface WirePacket {
  id: string
  timestampStr: string
  latencyMs: number
  route: string
  toolName?: string
  summaryCmd?: string
  methodCmd: string
  rawTokens: number
  scrubbedTokens: number
  savedPct: number
  outcome: string
  tone: string
  rawRequest: string
  rawResponse: string
}

export interface StartupContextItem {
  id: string
  namePath: string
  scope: string
  staticTokenWeight: number
  fileSize?: string
  lineCount?: number
  autoStart: boolean
  description: string
  content?: string
}

export interface ContextAuditSummary {
  totalStaticTokens: number
  maxContextTokens: number
  usedPercentage: number
  availableTokens: number
  activeProfile: string
  slices: { label: string; tokens: number; percentage: number }[]
}

export interface ReapSummary {
  terminatedPids: number[]
  freedMemoryMb: number
  processNames: string[]
}

// Helper to check if running inside Tauri runtime
const inTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return !!(
    (window as unknown as { isTauri?: boolean }).isTauri ||
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window
  )
}

async function invokeTauri<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  // 1. Try global window.__TAURI__.core.invoke
  if (typeof window !== 'undefined') {
    const tauriGlobal = (window as unknown as { __TAURI__?: { core?: { invoke: <R>(c: string, a?: Record<string, unknown>) => Promise<R> } } }).__TAURI__
    if (tauriGlobal?.core?.invoke) {
      try {
        const res = await tauriGlobal.core.invoke<T>(cmd, args)
        if (res !== undefined && res !== null) return res
      } catch (e) {
        console.warn(`[AgentMonitor] Tauri global invoke '${cmd}' failed:`, e)
      }
    }

    // 2. Try @tauri-apps/api/core module invoke
    if (inTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const res = await invoke<T>(cmd, args)
        if (res !== undefined && res !== null) return res
      } catch (e) {
        console.warn(`[AgentMonitor] Tauri import invoke '${cmd}' failed:`, e)
      }
    }
  }

  // 3. Try relative /api/
  const queryStr = Object.keys(args).length > 0
    ? '?' + new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])).toString()
    : ''

  try {
    const res = await fetch(`/api/${cmd}${queryStr}`)
    if (res.ok) {
      const data = await res.json()
      if (data !== undefined && data !== null) return data as T
    }
  } catch (err) {
    // 4. Try absolute localhost:8443 in case origin is tauri://
    try {
      const res = await fetch(`http://localhost:8443/api/${cmd}${queryStr}`)
      if (res.ok) {
        const data = await res.json()
        if (data !== undefined && data !== null) return data as T
      }
    } catch {}
  }

  return getMockData<T>(cmd, args)
}

function getMockData<T>(cmd: string, _args: Record<string, unknown>): T {
  switch (cmd) {
    case 'get_process_tree':
      return [
        [
          {
            pid: 794,
            ppid: 1,
            name: "Claude",
            command: "/Applications/Claude.app/Contents/MacOS/Claude",
            repoName: "NG-OK",
            agentType: "claude",
            state: "thinking",
            cpuUsage: 14.2,
            memoryMb: 176,
            stepCount: 4,
            maxSteps: 50,
            isZombie: false,
            children: [
              {
                pid: 997,
                ppid: 794,
                name: "Claude Helper",
                command: "/Applications/Claude.app/Contents/Frameworks/Claude Helper.app",
                repoName: "NG-OK",
                agentType: "claude",
                state: "toolLoop",
                cpuUsage: 4.4,
                memoryMb: 48,
                stepCount: 1,
                maxSteps: 50,
                isZombie: false,
                children: []
              },
              {
                pid: 1067,
                ppid: 794,
                name: "Claude Renderer",
                command: "/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer)",
                repoName: "NG-OK",
                agentType: "claude",
                state: "idle",
                cpuUsage: 0.2,
                memoryMb: 48,
                stepCount: 1,
                maxSteps: 50,
                isZombie: false,
                children: []
              }
            ]
          },
          {
            pid: 1097,
            ppid: 1,
            name: "codex-host",
            command: "/Users/rp/.codex/plugins/cache/openai-bundled",
            repoName: "AgentMonitor",
            agentType: "codex",
            state: "idle",
            cpuUsage: 0.1,
            memoryMb: 64,
            stepCount: 1,
            maxSteps: 50,
            isZombie: false,
            children: []
          }
        ],
        {
          totalAgentCpu: 18.8,
          totalAgentMemoryMb: 336,
          zombieCount: 0,
          zombieMemoryMb: 0,
          activeAgentCount: 2
        }
      ] as T

    case 'terminate_session':
      return { success: true, message: 'Session terminated' } as T

    case 'get_token_metrics':
      return [
        {
          id: "67e1a2e3-9765-4b4a-88dc-79843a8ef0be",
          sessionName: "NG-OK / claude",
          provider: "Anthropic",
          model: "Claude Opus 5.5",
          coldStartTaxTokens: 48200,
          activeMcpsCount: 6,
          burnRateTokensMin: 3904,
          burnRateCostHr: 3.02,
          taskCostDollars: 1.49,
          quota5hrPct: 84,
          quotaWeeklyPct: 61,
          quotaStatus: "safe",
          tone: "danger"
        },
        {
          id: "01a16722-d743-7472-8a46-e4ce94ade608",
          sessionName: "codex / Configure Rudra’s Mac for remote use",
          provider: "OpenAI",
          model: "GPT-5.3 Codex",
          coldStartTaxTokens: 18950,
          activeMcpsCount: 3,
          burnRateTokensMin: 3860,
          burnRateCostHr: 3.42,
          taskCostDollars: 2.11,
          quota5hrPct: 28,
          quotaWeeklyPct: 19,
          quotaStatus: "safe",
          tone: "blue"
        }
      ] as T

    case 'get_checkpoints':
      return [
        {
          turnNumber: 1,
          timestampStr: "Live Working Tree",
          promptSummary: "Active uncommitted changes (15 files modified)",
          filesSummary: "15 files modified",
          filesModifiedCount: 15,
          linesAdded: 142,
          linesDeleted: 18,
          guardrailStatus: "SAFE",
          snapshotId: "snap_live",
          tone: "green",
          diffFile: ".gitattributes",
          diffContent: "+ Modified: .gitattributes, AGENTS.md, CLAUDE.md"
        },
        {
          turnNumber: 2,
          timestampStr: "#2 · 10:09:33 AM",
          promptSummary: "Initial commit",
          filesSummary: "Commit diff",
          filesModifiedCount: 2,
          linesAdded: 45,
          linesDeleted: 12,
          guardrailStatus: "SAFE",
          snapshotId: "snap_686b4de",
          tone: "green",
          diffFile: "src/main.rs",
          diffContent: "Commit: 686b4de - Initial commit"
        }
      ] as T

    case 'get_wire_packets':
      return [
        {
          id: "toolu_017p2Dgt5aa6mM2R2Sr7LxtN",
          timestampStr: "Live Session Log",
          latencyMs: 84,
          route: "claude → ccd_turn",
          methodCmd: "tools/call: mcp__ccd_turn__update_plan",
          rawTokens: 76,
          scrubbedTokens: 120,
          savedPct: 88.5,
          outcome: "200 OK · Compressed",
          tone: "green",
          rawRequest: "{\n  \"items\": [\n    {\n      \"content\": \"Check out PR 769 into a worktree\",\n      \"status\": \"in_progress\"\n    }\n  ]\n}",
          rawResponse: "{ \"status\": \"success\", \"executed\": true }"
        },
        {
          id: "toolu_01D1nTKAUgTdNpoSEe8BDvfz",
          timestampStr: "Live Session Log",
          latencyMs: 84,
          route: "claude → Bash",
          methodCmd: "tools/call: Bash",
          rawTokens: 77,
          scrubbedTokens: 120,
          savedPct: 88.5,
          outcome: "200 OK · Compressed",
          tone: "green",
          rawRequest: "{\n  \"command\": \"cd /Users/rp/Documents/GitHub/NG-OK && gh pr view 769\"\n}",
          rawResponse: "{ \"status\": \"success\", \"executed\": true }"
        }
      ] as T

    case 'get_startup_context':
      return [
        [
          { id: "1", namePath: "~/.claude/settings.json", scope: "Global OS", staticTokenWeight: 8420, autoStart: true, description: "Claude runtime preferences & marketplaces" },
          { id: "2", namePath: "~/.codex/config.toml", scope: "Global OS", staticTokenWeight: 6240, autoStart: true, description: "Codex runtime configuration & models" },
          { id: "3", namePath: "CLAUDE.md", scope: "Repo-Local", staticTokenWeight: 4812, autoStart: true, description: "Repository agent instructions" },
          { id: "4", namePath: "AGENTS.md", scope: "Repo-Local", staticTokenWeight: 3120, autoStart: true, description: "Workspace agent specifications" },
          { id: "5", namePath: ".gitattributes", scope: "Repo-Local", staticTokenWeight: 890, autoStart: true, description: "Git repository attributes & hooks" },
          { id: "6", namePath: "package.json", scope: "Repo-Local", staticTokenWeight: 1420, autoStart: true, description: "Project dependencies manifest" }
        ],
        {
          totalStaticTokens: 24902,
          maxContextTokens: 200000,
          usedPercentage: 12.5,
          availableTokens: 175098,
          activeProfile: "Local Developer Profile",
          slices: [
            { label: "GLOBAL OS", tokens: 14660, percentage: 59.1 },
            { label: "REPO INSTRUCTIONS", tokens: 7932, percentage: 32 },
            { label: "MANIFESTS", tokens: 2310, percentage: 8.9 }
          ]
        }
      ] as T

    case 'reap_orphaned_zombies':
      return {
        terminatedPids: [9954, 9961],
        freedMemoryMb: 1127.0,
        processNames: ['npx @playwright/mcp', 'postgres-mcp'],
      } as T
    case 'pause_agent':
    case 'resume_agent':
    case 'kill_tree':
      return true as T
    case 'strip_idle_mcps':
      return 47500 as T
    case 'rewind_turn':
      return {
        success: true,
        restoredSnapshotId: 'snap_c03a',
        elapsedMs: 14,
        message: 'Successfully restored working tree and context',
      } as T
    default:
      return {} as T
  }
}

export const agentApi = {
  // Tab 1: Processes & Zombies
  async getProcessTree(): Promise<[AgentProcessNode[], SystemStatsSummary]> {
    return invokeTauri<[AgentProcessNode[], SystemStatsSummary]>('get_process_tree')
  },
  async pauseAgent(pid: number): Promise<void> {
    return invokeTauri<void>('pause_agent', { pid })
  },
  async resumeAgent(pid: number): Promise<void> {
    return invokeTauri<void>('resume_agent', { pid })
  },
  async killTree(pid: number): Promise<void> {
    return invokeTauri<void>('kill_tree', { pid })
  },
  async reapOrphanedZombies(): Promise<ReapSummary> {
    return invokeTauri<ReapSummary>('reap_orphaned_zombies')
  },
  async healJsonlHang(projectPath: string): Promise<number> {
    return invokeTauri<number>('heal_jsonl_hang', { projectPath })
  },

  // Tab 2: Token Impact & Burn
  async getTokenMetrics(): Promise<TokenSessionMetrics[]> {
    return invokeTauri<TokenSessionMetrics[]>('get_token_metrics')
  },
  async stripIdleMcps(sessionId: string): Promise<number> {
    return invokeTauri<number>('strip_idle_mcps', { sessionId })
  },
  async terminateSession(sessionId: string, sessionName: string): Promise<{ success: boolean; message?: string }> {
    return invokeTauri<{ success: boolean; message?: string }>('terminate_session', { sessionId, sessionName })
  },

  // Tab 3: Filesystem & Rewind
  async getCheckpoints(): Promise<CheckpointTurn[]> {
    return invokeTauri<CheckpointTurn[]>('get_checkpoints')
  },
  async rewindTurn(snapshotId: string): Promise<{ success: boolean; elapsedMs: number }> {
    return invokeTauri<{ success: boolean; elapsedMs: number }>('rewind_turn', { snapshotId })
  },
  async getFileDiff(snapshotId: string, filePath: string): Promise<string> {
    return invokeTauri<string>('get_file_diff', { snapshotId, filePath })
  },
  async openFile(filePath: string): Promise<boolean> {
    return invokeTauri<boolean>('open_file', { filePath })
  },

  // Tab 4: MCP & Tool Wire
  async getWirePackets(): Promise<WirePacket[]> {
    return invokeTauri<WirePacket[]>('get_wire_packets')
  },
  async toggleLogScrubber(enabled: boolean): Promise<boolean> {
    return invokeTauri<boolean>('toggle_log_scrubber', { enabled })
  },

  // Tab 5: Startup Context & Autoruns
  async getStartupContext(): Promise<[StartupContextItem[], ContextAuditSummary]> {
    return invokeTauri<[StartupContextItem[], ContextAuditSummary]>('get_startup_context')
  },
  async switchContextProfile(profileName: string): Promise<string> {
    return invokeTauri<string>('switch_context_profile', { profileName })
  },
}
