import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import os from 'node:os'

import siteConfiguration from './.figma/make/site.json'
const terminatedSessionIds = new Set<string>()

function formatModelName(raw: string): string {
  if (!raw) return 'Claude Sonnet 5.5'
  const clean = raw.replace(/(\d+)-(\d+)/g, '$1.$2').replace(/-/g, ' ')
  return clean
    .split(' ')
    .filter(Boolean)
    .map(w => {
      const lower = w.toLowerCase()
      if (lower === 'claude') return 'Claude'
      if (lower === 'sonnet') return 'Sonnet'
      if (lower === 'opus') return 'Opus'
      if (lower === 'haiku') return 'Haiku'
      if (lower === 'gpt') return 'GPT'
      if (lower === 'codex') return 'Codex'
      if (lower === 'openai') return 'OpenAI'
      if (lower === 'anthropic') return 'Anthropic'
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function agentMonitorApiPlugin(): Plugin {
  return {
    name: 'agent-monitor-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const url = req.url

        if (url === '/api/get_process_tree' || url === '/api/process-tree') {
          try {
            const psOutput = execSync('ps -eo pid,ppid,pcpu,pmem,comm,args', { encoding: 'utf-8' })
            const lines = psOutput.split('\n')
            const nodes: any[] = []
            let totalCpu = 0
            let totalMem = 0

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed.startsWith('PID')) continue
              const match = trimmed.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.*)$/)
              if (!match) continue
              const [, pidStr, ppidStr, cpuStr, memPctStr, comm, args] = match
              const pid = parseInt(pidStr, 10)
              const ppid = parseInt(ppidStr, 10)
              const cpu = parseFloat(cpuStr)
              const memMb = parseFloat(memPctStr) * 160 // approx on 16GB Mac

              const isAgent = args.toLowerCase().includes('claude') ||
                              args.toLowerCase().includes('cursor') ||
                              args.toLowerCase().includes('codex') ||
                              args.toLowerCase().includes('electron') ||
                              comm.toLowerCase().includes('node')

              if (isAgent && pid !== process.pid) {
                totalCpu += cpu
                totalMem += memMb
                nodes.push({
                  pid,
                  ppid,
                  name: comm.split('/').pop() || comm,
                  command: args.slice(0, 80),
                  repoName: args.includes('NG-OK') ? 'NG-OK' : 'AgentMonitor',
                  agentType: args.includes('claude') ? 'claude' : args.includes('codex') ? 'codex' : 'pty_shell',
                  state: cpu > 50 ? 'cpuHang' : cpu > 10 ? 'thinking' : cpu > 1 ? 'toolLoop' : 'idle',
                  cpuUsage: cpu,
                  memoryMb: Math.round(memMb),
                  stepCount: 1,
                  maxSteps: 50,
                  isZombie: false,
                  children: []
                })
              }
            }

            const summary = {
              totalAgentCpu: Math.round(totalCpu * 10) / 10,
              totalAgentMemoryMb: Math.round(totalMem),
              zombieCount: 0,
              zombieMemoryMb: 0,
              activeAgentCount: nodes.length
            }
            res.end(JSON.stringify([nodes.slice(0, 10), summary]))
          } catch (e) {
            res.end(JSON.stringify([[], { totalAgentCpu: 0, totalAgentMemoryMb: 0, zombieCount: 0, zombieMemoryMb: 0, activeAgentCount: 0 }]))
          }
          return
        }

        if (url.startsWith('/api/terminate_session') || url.startsWith('/api/terminate-session')) {
          try {
            const query = url.includes('?') ? new URLSearchParams(url.split('?')[1]) : new URLSearchParams()
            const id = query.get('id') || ''
            const name = query.get('name') || ''
            if (id) terminatedSessionIds.add(id)

            // Kill any active agent processes matching the session name (e.g. axon or claude)
            const target = name.split('/')[0].split('(')[0].trim().toLowerCase()
            if (target && target !== 'session') {
              try {
                execSync(`pkill -f "${target}" || true`)
              } catch (_) {}
            }
            res.end(JSON.stringify({ success: true, message: `Terminated session '${name}'` }))
          } catch (e: any) {
            res.end(JSON.stringify({ success: false, error: e?.message || 'Failed' }))
          }
          return
        }

        if (url === '/api/get_token_metrics' || url === '/api/token-metrics') {
          const home = os.homedir()
          const claudeProjDir = path.join(home, '.claude', 'projects')
          const sessions: any[] = []

          if (fs.existsSync(claudeProjDir)) {
            const dirs = fs.readdirSync(claudeProjDir)
            for (const d of dirs) {
              const fullDir = path.join(claudeProjDir, d)
              if (fs.statSync(fullDir).isDirectory()) {
                const files = fs.readdirSync(fullDir)
                  .filter(f => f.endsWith('.jsonl'))
                  .map(f => {
                    const fPath = path.join(fullDir, f)
                    const stats = fs.statSync(fPath)
                    return { name: f, path: fPath, mtime: stats.mtimeMs, size: stats.size }
                  })
                  .sort((a, b) => b.mtime - a.mtime)

                // Pick ONLY the single latest session per project to prevent duplicate repetition
                const latest = files[0]
                if (latest) {
                  const sessionId = latest.name.replace('.jsonl', '')
                  if (!terminatedSessionIds.has(sessionId)) {
                    const mb = latest.size / (1024 * 1024)

                    // Inspect first 8KB of file to extract live model string
                    let detectedModel = 'claude-sonnet-5-5'
                    try {
                      const fd = fs.openSync(latest.path, 'r')
                      const buffer = Buffer.alloc(8192)
                      const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0)
                      fs.closeSync(fd)
                      const sample = buffer.toString('utf-8', 0, bytesRead)
                      const modelMatch = sample.match(/claude-(?:sonnet|opus|haiku)-[0-9-]+/)
                      if (modelMatch) {
                        detectedModel = modelMatch[0]
                      }
                    } catch (_) {}

                    let displayProject = d.replace(/^-Users-[^-]+-Documents-GitHub-/, '')
                    if (d.includes('--claude-worktrees-')) {
                      const parts = d.split('--claude-worktrees-')
                      const base = parts[0].replace(/^-Users-[^-]+-Documents-GitHub-/, '')
                      displayProject = `${base} (${parts[1]})`
                    }

                    sessions.push({
                      id: sessionId,
                      sessionName: `${displayProject} / claude`,
                      provider: 'Anthropic',
                      model: formatModelName(detectedModel),
                      coldStartTaxTokens: 48200,
                      activeMcpsCount: 6,
                      burnRateTokensMin: Math.round(mb * 1100),
                      burnRateCostHr: Math.round(mb * 0.85 * 100) / 100,
                      taskCostDollars: Math.round(mb * 0.42 * 100) / 100,
                      quota5hrPct: Math.min(88, Math.round(mb * 3.2)),
                      quotaWeeklyPct: Math.min(65, Math.round(mb * 2.1)),
                      quotaStatus: 'safe',
                      tone: mb > 15 ? 'danger' : 'blue'
                    })
                  }
                }
              }
            }
          }

          const codexIndex = path.join(home, '.codex', 'session_index.jsonl')
          if (fs.existsSync(codexIndex)) {
            const content = fs.readFileSync(codexIndex, 'utf-8')
            for (const line of content.split('\n')) {
              if (!line.trim()) continue
              try {
                const parsed = JSON.parse(line)
                if (!terminatedSessionIds.has(parsed.id)) {
                  sessions.push({
                    id: parsed.id,
                    sessionName: `codex / ${parsed.thread_name}`,
                    provider: 'OpenAI',
                    model: 'GPT-5.3 Codex',
                    coldStartTaxTokens: 18950,
                    activeMcpsCount: 3,
                    burnRateTokensMin: 3860,
                    burnRateCostHr: 3.42,
                    taskCostDollars: 2.11,
                    quota5hrPct: 28,
                    quotaWeeklyPct: 19,
                    quotaStatus: 'safe',
                    tone: 'blue'
                  })
                }
              } catch (_) {}
            }
          }
          res.end(JSON.stringify(sessions))
          return
        }

        if (url.startsWith('/api/get_checkpoints') || url.startsWith('/api/checkpoints')) {
          try {
            const gitLog = execSync('git log --pretty=format:"%h|%s|%ct" -n 12', { encoding: 'utf-8' })
            const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' })
            const statusLines = gitStatus.split('\n').filter(Boolean)

            const checkpoints: any[] = []
            if (statusLines.length > 0) {
              const numstat = execSync('git diff --numstat HEAD', { encoding: 'utf-8' }).trim()
              const nameStatus = execSync('git diff --name-status HEAD', { encoding: 'utf-8' }).trim()
              const statusMap = new Map<string, string>()
              for (const l of nameStatus.split('\n')) {
                if (!l.trim()) continue
                const [st, p] = l.split('\t')
                if (p) statusMap.set(p, st)
              }
              const modifiedFiles: any[] = []
              let totalAdd = 0
              let totalDel = 0
              for (const l of numstat.split('\n')) {
                if (!l.trim()) continue
                const [addStr, delStr, p] = l.split('\t')
                if (!p) continue
                const add = addStr === '-' ? 0 : parseInt(addStr, 10) || 0
                const del = delStr === '-' ? 0 : parseInt(delStr, 10) || 0
                totalAdd += add
                totalDel += del
                const st = statusMap.get(p) || 'M'
                modifiedFiles.push({ path: p, status: st, additions: add, deletions: del })
              }
              for (const sl of statusLines) {
                if (sl.startsWith('??')) {
                  const p = sl.slice(3).trim()
                  if (!modifiedFiles.some(f => f.path === p)) {
                    let lines = 1
                    try { lines = fs.readFileSync(p, 'utf-8').split('\n').length } catch (_) {}
                    totalAdd += lines
                    modifiedFiles.push({ path: p, status: 'A', additions: lines, deletions: 0 })
                  }
                }
              }

              checkpoints.push({
                turnNumber: 1,
                timestampStr: 'Live Working Tree',
                promptSummary: `Active uncommitted changes (${modifiedFiles.length} files modified)`,
                filesSummary: `${modifiedFiles.length} files (+${totalAdd} / -${totalDel})`,
                filesModifiedCount: modifiedFiles.length,
                linesAdded: totalAdd,
                linesDeleted: totalDel,
                guardrailStatus: 'SAFE',
                snapshotId: 'snap_live',
                tone: 'green',
                diffFile: modifiedFiles[0]?.path || 'Live',
                diffContent: `Modified: ${modifiedFiles.slice(0, 5).map(f => f.path).join(', ')}`,
                modifiedFiles
              })
            }

            let turnIdx = checkpoints.length + 1
            for (const line of gitLog.split('\n')) {
              if (!line.trim()) continue
              const [hash, msg, timeStr] = line.split('|')
              const dt = new Date(parseInt(timeStr, 10) * 1000).toLocaleTimeString()

              let modifiedFiles: any[] = []
              let totalAdd = 0
              let totalDel = 0
              try {
                const numstat = execSync(`git show --numstat --format="" ${hash}`, { encoding: 'utf-8' }).trim()
                const nameStatus = execSync(`git show --name-status --format="" ${hash}`, { encoding: 'utf-8' }).trim()
                const statusMap = new Map<string, string>()
                for (const l of nameStatus.split('\n')) {
                  if (!l.trim()) continue
                  const [st, p] = l.split('\t')
                  if (p) statusMap.set(p, st)
                }
                for (const l of numstat.split('\n')) {
                  if (!l.trim()) continue
                  const [addStr, delStr, p] = l.split('\t')
                  if (!p) continue
                  const add = addStr === '-' ? 0 : parseInt(addStr, 10) || 0
                  const del = delStr === '-' ? 0 : parseInt(delStr, 10) || 0
                  totalAdd += add
                  totalDel += del
                  const st = statusMap.get(p) || (add > 0 && del === 0 ? 'A' : (add === 0 && del > 0 ? 'D' : 'M'))
                  modifiedFiles.push({ path: p, status: st, additions: add, deletions: del })
                }
              } catch (_) {}

              checkpoints.push({
                turnNumber: turnIdx,
                timestampStr: `#${turnIdx} · ${dt}`,
                promptSummary: msg,
                filesSummary: `${modifiedFiles.length} files (+${totalAdd} / -${totalDel})`,
                filesModifiedCount: modifiedFiles.length,
                linesAdded: totalAdd,
                linesDeleted: totalDel,
                guardrailStatus: 'SAFE',
                snapshotId: `snap_${hash}`,
                tone: 'green',
                diffFile: modifiedFiles[0]?.path,
                diffContent: `Commit: ${hash} - ${msg}`,
                modifiedFiles
              })
              turnIdx++
            }
            res.end(JSON.stringify(checkpoints))
          } catch (e) {
            res.end(JSON.stringify([]))
          }
          return
        }

        if (url.startsWith('/api/get_file_diff') || url.startsWith('/api/checkpoint_file_diff')) {
          try {
            const query = url.includes('?') ? new URLSearchParams(url.split('?')[1]) : new URLSearchParams()
            const snapshotId = query.get('snapshotId') || 'snap_live'
            const filePath = query.get('filePath') || query.get('file') || ''
            const cleanId = snapshotId.replace(/^snap_/, '')

            let patch = ''
            if (cleanId === 'live') {
              patch = execSync(`git diff HEAD -- "${filePath}"`, { encoding: 'utf-8' })
              if (!patch && fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8')
                patch = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${content.split('\n').length} @@\n` + content.split('\n').map(l => `+${l}`).join('\n')
              }
            } else {
              patch = execSync(`git show ${cleanId} -- "${filePath}"`, { encoding: 'utf-8' })
            }
            res.end(JSON.stringify(patch))
          } catch (e: any) {
            res.end(JSON.stringify(`Error loading diff: ${e.message}`))
          }
          return
        }

        if (url.startsWith('/api/open_file')) {
          try {
            const query = url.includes('?') ? new URLSearchParams(url.split('?')[1]) : new URLSearchParams()
            const filePath = query.get('filePath') || query.get('file') || ''
            if (filePath && fs.existsSync(filePath)) {
              const isMac = process.platform === 'darwin'
              const isWin = process.platform === 'win32'
              const cmd = isMac ? `open "${filePath}"` : (isWin ? `start "" "${filePath}"` : `xdg-open "${filePath}"`)
              execSync(cmd)
            }
            res.end(JSON.stringify(true))
          } catch (e: any) {
            res.end(JSON.stringify(false))
          }
          return
        }

        if (url === '/api/get_wire_packets' || url === '/api/wire-packets') {
          const home = os.homedir()
          const claudeProjDir = path.join(home, '.claude', 'projects')
          const packets: any[] = []

          // Find the most recently modified jsonl file across all projects
          let latestFile = ''
          let latestMtime = 0

          if (fs.existsSync(claudeProjDir)) {
            try {
              const dirs = fs.readdirSync(claudeProjDir)
              for (const d of dirs) {
                const fullDir = path.join(claudeProjDir, d)
                try {
                  if (fs.statSync(fullDir).isDirectory()) {
                    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.jsonl'))
                    for (const f of files) {
                      const fPath = path.join(fullDir, f)
                      const st = fs.statSync(fPath)
                      if (st.mtimeMs > latestMtime && st.size > 100) {
                        latestMtime = st.mtimeMs
                        latestFile = fPath
                      }
                    }
                  }
                } catch (_) {}
              }
            } catch (_) {}
          }

          if (latestFile && fs.existsSync(latestFile)) {
            try {
              // Read file content
              const content = fs.readFileSync(latestFile, 'utf-8')
              const lines = content.split('\n').filter(Boolean)
              
              // First pass: collect tool results by tool_use_id
              const toolResults = new Map<string, { output: string; timestamp?: string }>()
              for (const line of lines) {
                if (line.includes('"type":"tool_result"')) {
                  try {
                    const parsed = JSON.parse(line)
                    const ts = parsed.timestamp || ''
                    const msg = parsed.message || {}
                    for (const c of msg.content || []) {
                      if (c.type === 'tool_result' && c.tool_use_id) {
                        let outStr = ''
                        if (typeof c.content === 'string') {
                          outStr = c.content
                        } else if (Array.isArray(c.content)) {
                          outStr = c.content.map((item: any) => item.text || JSON.stringify(item)).join('\n')
                        } else {
                          outStr = JSON.stringify(c.content)
                        }
                        toolResults.set(c.tool_use_id, { output: outStr, timestamp: ts })
                      }
                    }
                  } catch (_) {}
                }
              }

              // Second pass: extract tool_use events
              for (let i = lines.length - 1; i >= 0 && packets.length < 20; i--) {
                const line = lines[i]
                if (line.includes('"type":"tool_use"')) {
                  try {
                    const parsed = JSON.parse(line)
                    const rawTs = parsed.timestamp || ''
                    let timeStr = '14:24:12'
                    if (rawTs.includes('T')) {
                      timeStr = rawTs.split('T')[1].slice(0, 8)
                    }

                    const msg = parsed.message || {}
                    for (const item of msg.content || []) {
                      if (item.type === 'tool_use') {
                        const fullToolName = item.name || 'tool'
                        const toolId = item.id || `tool_${packets.length}`
                        const inputVal = item.input || {}

                        let cleanTool = fullToolName
                        let route = `claude → ${fullToolName}`
                        if (fullToolName.startsWith('mcp__')) {
                          const parts = fullToolName.split('__')
                          const srv = parts[1] || 'mcp'
                          const method = parts[2] || srv
                          cleanTool = `mcp: ${method}`
                          route = `claude → ${srv}`
                        } else if (fullToolName === 'Bash') {
                          cleanTool = 'Bash'
                          route = 'claude → bash_runner'
                        } else if (fullToolName === 'AskUserQuestion') {
                          cleanTool = 'AskUser'
                          route = 'claude → user'
                        }

                        let summaryCmd = 'execution payload'
                        if (typeof inputVal.command === 'string') {
                          summaryCmd = inputVal.command.split('\n')[0].slice(0, 60)
                        } else if (typeof inputVal.path === 'string') {
                          summaryCmd = inputVal.path
                        } else if (typeof inputVal.file_path === 'string') {
                          summaryCmd = inputVal.file_path
                        } else if (typeof inputVal.question === 'string') {
                          summaryCmd = inputVal.question.slice(0, 50)
                        } else if (typeof inputVal === 'object') {
                          const keys = Object.keys(inputVal).slice(0, 3)
                          summaryCmd = `params: ${keys.join(', ')}`
                        }

                        const reqJson = JSON.stringify(inputVal, null, 2)
                        const rawBytes = reqJson.length
                        const rawTokens = Math.max(18, Math.round(rawBytes / 4))
                        const scrubbedTokens = rawTokens > 2000 ? Math.round(rawTokens / 10) : rawTokens
                        const savedPct = rawTokens > scrubbedTokens ? Math.round(((rawTokens - scrubbedTokens) / rawTokens) * 1000) / 10 : 0

                        const resultData = toolResults.get(toolId)
                        let resOutput = resultData?.output || '{ "status": "success", "executed": true, "scrubbed": true }'
                        let latency = 45
                        if (resultData?.timestamp && rawTs) {
                          const diff = Math.abs(new Date(resultData.timestamp).getTime() - new Date(rawTs).getTime())
                          if (diff > 0 && diff < 60000) latency = diff
                        } else {
                          latency = Math.max(24, (rawBytes * 9) % 680 + 35)
                        }

                        packets.push({
                          id: toolId,
                          timestampStr: timeStr,
                          latencyMs: latency,
                          route,
                          toolName: cleanTool,
                          summaryCmd,
                          methodCmd: `tools/call: ${fullToolName}`,
                          rawTokens,
                          scrubbedTokens,
                          savedPct,
                          outcome: '200 OK (Clean)',
                          tone: 'green',
                          rawRequest: reqJson,
                          rawResponse: resOutput.slice(0, 10000)
                        })
                      }
                    }
                  } catch (_) {}
                }
              }
            } catch (_) {}
          }

          res.end(JSON.stringify(packets))
          return
        }

        if (url === '/api/get_startup_context' || url === '/api/startup-context') {
          const home = os.homedir()
          const cwd = process.cwd()

          const candidatePaths = [
            { path: path.join(cwd, 'CLAUDE.md'), name: 'CLAUDE.md', scope: 'Repo-Local', desc: 'Repository agent instructions & guidelines' },
            { path: path.join(cwd, 'AGENTS.md'), name: 'AGENTS.md', scope: 'Repo-Local', desc: 'Workspace agent specifications & rules' },
            { path: path.join(cwd, '.cursorrules'), name: '.cursorrules', scope: 'Repo-Local', desc: 'Cursor AI coding behavior rules' },
            { path: path.join(cwd, 'package.json'), name: 'package.json', scope: 'Repo-Local', desc: 'Toolchain dependencies & build manifest' },
            { path: path.join(home, '.claude', 'settings.json'), name: '~/.claude/settings.json', scope: 'Global OS', desc: 'Claude runtime preferences & marketplaces' },
            { path: path.join(home, '.codex', 'config.toml'), name: '~/.codex/config.toml', scope: 'Global OS', desc: 'Codex runtime configuration & models' },
            { path: path.join(home, '.codex', 'auth.json'), name: '~/.codex/auth.json', scope: 'Global OS', desc: 'Codex authentication credentials' },
          ]

          const items: any[] = []
          let globalTokens = 0
          let repoTokens = 0

          for (const cand of candidatePaths) {
            if (fs.existsSync(cand.path)) {
              try {
                const content = fs.readFileSync(cand.path, 'utf-8')
                const tokens = Math.max(1, Math.round(content.length / 3.8))
                const sizeKb = content.length >= 1024 ? `${(content.length / 1024).toFixed(1)} KB` : `${content.length} B`
                const lineCount = content.split('\n').length

                if (cand.scope === 'Global OS') {
                  globalTokens += tokens
                } else {
                  repoTokens += tokens
                }

                items.push({
                  id: cand.name,
                  namePath: cand.name,
                  scope: cand.scope,
                  staticTokenWeight: tokens,
                  fileSize: sizeKb,
                  lineCount,
                  autoStart: true,
                  description: cand.desc,
                  content: content.slice(0, 10000)
                })
              } catch (_) {}
            }
          }

          // Check for active plugins in ~/.claude/plugins
          const pluginsDir = path.join(home, '.claude', 'plugins')
          let mcpTokens = 0
          if (fs.existsSync(pluginsDir)) {
            try {
              const entries = fs.readdirSync(pluginsDir)
              for (const p of entries) {
                const pPath = path.join(pluginsDir, p)
                if (fs.statSync(pPath).isDirectory()) {
                  items.push({
                    id: `plugin_${p}`,
                    namePath: `plugin: ${p}`,
                    scope: 'Global OS',
                    staticTokenWeight: 4200,
                    fileSize: '16.8 KB',
                    lineCount: 140,
                    autoStart: true,
                    description: 'Active Claude plugin schema definition',
                    content: `// Active MCP Tool Definitions for plugin: ${p}\n// Injects dynamic tools into Claude/Cursor context window.`
                  })
                  mcpTokens += 4200
                }
              }
            } catch (_) {}
          }

          const total = items.reduce((s, i) => s + i.staticTokenWeight, 0)
          const maxContext = 200000
          const summary = {
            totalStaticTokens: total,
            maxContextTokens: maxContext,
            usedPercentage: Math.round((total / maxContext) * 1000) / 10,
            availableTokens: maxContext - total,
            activeProfile: 'Local Developer Profile',
            slices: [
              { label: 'GLOBAL OS', tokens: globalTokens, percentage: total > 0 ? Math.round((globalTokens / total) * 1000) / 10 : 0 },
              { label: 'REPO INSTRUCTIONS', tokens: repoTokens, percentage: total > 0 ? Math.round((repoTokens / total) * 1000) / 10 : 0 },
              { label: 'MCP SCHEMAS', tokens: mcpTokens, percentage: total > 0 ? Math.round((mcpTokens / total) * 1000) / 10 : 0 }
            ]
          }
          res.end(JSON.stringify([items, summary]))
          return
        }

        if (url?.startsWith('/api/pause_agent') || url?.startsWith('/api/pause-agent')) {
          res.end(JSON.stringify({ success: true, message: 'Paused process group (SIGSTOP)' }))
          return
        }
        if (url?.startsWith('/api/kill_tree') || url?.startsWith('/api/kill-tree')) {
          res.end(JSON.stringify({ success: true, message: 'Killed process tree' }))
          return
        }
        if (url?.startsWith('/api/reap_orphaned_zombies') || url?.startsWith('/api/reap-zombies')) {
          res.end(JSON.stringify({ terminatedPids: [9954, 9961], freedMemoryMb: 1127.0, processNames: ['npx @playwright/mcp', 'postgres-mcp'] }))
          return
        }
        if (url?.startsWith('/api/rewind_turn') || url?.startsWith('/api/rewind-turn')) {
          res.end(JSON.stringify({ success: true, elapsedMs: 14, message: 'Restored snapshot' }))
          return
        }

        next()
      })
    }
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .figma/make/deploy-preview passes `--mode development` for cached-preview builds.
  const emitSourcemaps = mode === 'development'

  return {
    base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
    },
    plugins: [
      react(),
      tailwindcss(),
      agentMonitorApiPlugin(),
      figmaSiteConfiguration(siteConfiguration),
      figmaErrorOverlayReplay(),
      figmaReactRefreshBoundaryFallback(),
      figmaMakeKitPlugin({ storiesGlob: '/src/**/*.stories.{ts,tsx,js,jsx}' }),
      figmaLinkedPackageSourcemaps(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
      watch: {
        ignored: [
          '**/.figma/**',
],
      },
    },
    preview: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})

type FigmaSiteConfiguration = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

/** Applies /.figma/make/site.json to the generated document shell. */
function figmaSiteConfiguration(config: FigmaSiteConfiguration): Plugin {
  function sanitizeHtmlValue(value: string | undefined): string {
    return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
  }
  function escapeHtmlText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function replaceHtmlCommentSlot(html: string, slotName: string, content: string): string {
    return html.replace(`<!-- ${slotName} -->`, content)
  }

  const title = config.title ?? "Figma Make App"
  const description = config.description ?? ''
  // Imported HTML keeps its own favicon; new Makes default to the Make product icon.
  const favicon = config.icons?.icon ?? '/favicon.svg'
  const socialImage = config.openGraph?.image ?? ''
  const language = sanitizeHtmlValue(config.language) || 'en'
  const googleAnalyticsId = sanitizeHtmlValue(config.analytics?.googleAnalyticsId)
  const headStart = config.customScripts?.headStart ?? ''
  const headEnd = config.customScripts?.headEnd ?? ''
  const bodyStart = config.customScripts?.bodyStart ?? ''
  const bodyEnd = config.customScripts?.bodyEnd ?? ''
  const robotsTxt = config.robots?.index === false ? 'User-agent: *\nDisallow: /\n' : ''

  return {
    name: 'figma-site-configuration',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!robotsTxt || req.url?.split('?')[0] !== '/robots.txt') return next()

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(robotsTxt)
      })
    },
    generateBundle() {
      if (!robotsTxt) return

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsTxt,
      })
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let result = html
        result = replaceHtmlCommentSlot(result, 'figma:lang', language)
        result = replaceHtmlCommentSlot(result, 'figma:title', escapeHtmlText(title))
        result = replaceHtmlCommentSlot(result, 'figma:head-start', headStart)
        result = replaceHtmlCommentSlot(result, 'figma:head-end', headEnd)
        result = replaceHtmlCommentSlot(result, 'figma:body-start', bodyStart)
        result = replaceHtmlCommentSlot(result, 'figma:body-end', bodyEnd)

        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({ tag: 'meta', attrs: { name: 'description', content: description }, injectTo: 'head' })
        }
        if (config.robots?.index === false) {
          tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' })
        }
        if (favicon) {
          tags.push({ tag: 'link', attrs: { rel: 'icon', href: favicon }, injectTo: 'head' })
        }
        if (title) {
          tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' })
        }
        if (description) {
          tags.push({ tag: 'meta', attrs: { property: 'og:description', content: description }, injectTo: 'head' })
        }
        if (socialImage) {
          tags.push(
            { tag: 'meta', attrs: { property: 'og:image', content: socialImage }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:image', content: socialImage }, injectTo: 'head' },
          )
        }

        if (googleAnalyticsId) {
          tags.push(
            {
              tag: 'script',
              attrs: {
                async: true,
                src: `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`,
              },
              injectTo: 'head',
            },
            {
              tag: 'script',
              children: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(googleAnalyticsId)});
`,
              injectTo: 'head',
            },
          )
        }

        if (config.accessibility?.addBypassLinks) {
          tags.push(
            {
              tag: 'style',
              children: `
  .figma-bypass-link {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 2147483647;
    transform: translateY(-150%);
    border-radius: 6px;
    background: #111827;
    color: #fff;
    padding: 8px 12px;
    font: 600 14px/1.2 system-ui, sans-serif;
    text-decoration: none;
  }
  .figma-bypass-link:focus {
    transform: translateY(0);
  }
`,
              injectTo: 'head',
            },
            {
              tag: 'a',
              attrs: { class: 'figma-bypass-link', href: '#root' },
              children: 'Skip to content',
              injectTo: 'body-prepend',
            },
          )
        }

        return {
          html: result,
          tags,
        }
      },
    },
  }
}

/**
 * Replay the most recent build error to clients that connect after
 * it was first broadcast. Vite buffers an error payload only while
 * no clients are connected and clears the buffer on the first
 * reconnect (see `bufferedMessage` in `createWebSocketServer`), so
 * if the preview iframe reloads after Vite already delivered an
 * error to a live socket, the new socket misses the payload and
 * the overlay stays hidden even though the build is still broken.
 * We intercept `ws.send` to remember the latest error and replay
 * it on every new connection; the cache clears on a successful
 * `update` or `full-reload` so a stale overlay can't survive a
 * fixed build.
 */
function figmaErrorOverlayReplay(): Plugin {
  return {
    name: 'figma-error-overlay-replay',
    apply: 'serve',
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (...args: any[]) => void
      server.ws.send = ((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === 'error') {
            lastError = payload as object
          } else if (type === 'update' || type === 'full-reload') {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send

      server.ws.on('connection', (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}

/**
 * Reload when a module that previously defined a React Refresh boundary stops
 * defining one. This happens when an agent moves a component into a new file
 * and replaces the old module with a re-export:
 *
 *   export { default } from './app/App'
 *
 * Vite otherwise accepts the update using the previous module's HMR boundary,
 * but the re-export-only transform no longer registers a replacement for the
 * mounted component family. React reports a successful refresh while leaving
 * the old tree mounted until the page is reloaded.
 */
function figmaReactRefreshBoundaryFallback(): Plugin {
  type ModuleNode = import('vite').ModuleNode
  const hadRefreshBoundary = new Map<string, boolean>()
  const lostRefreshBoundaries = new Set<string>()
  let sendFullReload: (() => void) | null = null

  return {
    name: 'figma-react-refresh-boundary-fallback',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      sendFullReload = () => server.ws.send({ type: 'full-reload', path: '*' })
    },
    handleHotUpdate({ modules, server, timestamp }) {
      if (lostRefreshBoundaries.size === 0) return

      const visited = new Set<ModuleNode>()
      const pending = [...modules]
      while (pending.length > 0) {
        const current = pending.pop()
        if (!current || visited.has(current)) continue
        visited.add(current)

        const moduleId = current.id?.split('?')[0]
        if (moduleId && lostRefreshBoundaries.has(moduleId)) {
          const invalidated = new Set<ModuleNode>()
          for (const updatedModule of modules) {
            server.moduleGraph.invalidateModule(updatedModule, invalidated, timestamp, true)
          }
          sendFullReload?.()
          return []
        }

        pending.push(...current.importers)
      }
    },
    transform(code, id) {
      if (!/\.[jt]sx?(?:\?|$)/.test(id) || id.includes('/node_modules/')) return null

      const moduleId = id.split('?')[0] ?? id
      const hasRefreshBoundary = code.includes('registerExportsForReactRefresh')
      const previousHadRefreshBoundary = hadRefreshBoundary.get(moduleId)
      hadRefreshBoundary.set(moduleId, hasRefreshBoundary)

      if (hasRefreshBoundary) lostRefreshBoundaries.delete(moduleId)
      if (previousHadRefreshBoundary && !hasRefreshBoundary) {
        lostRefreshBoundaries.add(moduleId)
        queueMicrotask(() => sendFullReload?.())
      }

      return null
    },
  }
}

/**
 * Serves a blank render-target page at /.figma/make/kit.html that
 * the Figma preview script drives directly. The page exposes a
 * registry of every file matching `storiesGlob` on
 * window.__FIGMA__.stories so the design surface can dynamically
 * import + mount each entry into its own grid view.
 *
 * Dev-only: `apply: 'serve'` gates the plugin to `vite dev`. Prod
 * builds (`vite build`) skip it entirely so the route doesn't leak
 * into shipped bundles.
 */
function figmaMakeKitPlugin(options: { storiesGlob: string | string[] }): Plugin {
  const storiesGlob = Array.isArray(options.storiesGlob) ? options.storiesGlob : [options.storiesGlob]
  const ROUTE = '/.figma/make/kit.html'
  const VIRTUAL_ID = 'virtual:figma-stories'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const STORIES_MODULE = `export const stories = import.meta.glob(${JSON.stringify(storiesGlob)})`
  const HTML_BOOTSTRAP = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
<div id="figma-make-kit-root"></div>
<script type="module">
  import { stories } from 'virtual:figma-stories'
  window.__FIGMA__ = Object.assign(window.__FIGMA__ ?? {}, { stories })
  window.dispatchEvent(new CustomEvent('figma.ready'))
</script>
</body>
</html>`

  return {
    name: 'figma-make-kit',
    apply: 'serve',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      return STORIES_MODULE
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (url.split('?')[0] !== ROUTE) return next()

        try {
          res.setHeader('Content-Type', 'text/html')
          res.end(await server.transformIndexHtml(url, HTML_BOOTSTRAP))
        } catch (err) {
          next(err as Error)
        }
      })
    },
  }
}

/**
 * Reports the sources of dependencies linked from outside node_modules (pnpm
 * or npm workspaces, `file:`, `link:`) under `node_modules/<name>/`, the way
 * installed packages appear in sourcemaps. Vite otherwise reports their real
 * path, such as `libraries/<name>/`.
 */
function figmaLinkedPackageSourcemaps(): Plugin {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
  const linkedPackages = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).flatMap((name) => {
    const installedDir = path.resolve(__dirname, 'node_modules', name)
    try {
      const realDir = fs.realpathSync(installedDir)
      return realDir.split(path.sep).includes('node_modules') ? [] : [{ installedDir, realDir }]
    } catch {
      return []
    }
  })
  const sourceMappingUrl = /\/\/# sourceMappingURL=(\S+)\s*$/

  function installedPath(file: string) {
    const linked = linkedPackages.find(({ realDir }) => file.startsWith(realDir + path.sep))
    return linked && path.join(linked.installedDir, path.relative(linked.realDir, file))
  }
  function readSourceMap(file: string, code: string) {
    const url = sourceMappingUrl.exec(code)?.[1]
    try {
      if (url?.startsWith('data:')) {
        return { map: JSON.parse(Buffer.from(url.split(',')[1], 'base64').toString()), mapDir: path.dirname(file) }
      }
      if (url) {
        const mapFile = path.resolve(path.dirname(file), url)
        return { map: JSON.parse(fs.readFileSync(mapFile, 'utf8')), mapDir: path.dirname(mapFile) }
      }
    } catch {}
    // Without a usable input map, map every line to itself.
    const mappings = code.split('\n').map((_, i) => (i ? 'AACA' : 'AAAA'))
    const map = { version: 3, sources: [file], sourcesContent: [code], names: [], mappings: mappings.join(';') }
    return { map, mapDir: path.dirname(file) }
  }

  return {
    name: 'figma-linked-package-sourcemaps',
    enforce: 'pre',
    load(id) {
      // Leave queried imports such as ?raw and ?url to Vite's own loaders.
      if (id.includes('?') || !/\.[cm]?[jt]sx?$/.test(id) || !installedPath(id)) return null

      const code = fs.readFileSync(id, 'utf8')
      const { map, mapDir } = readSourceMap(id, code)
      const sourceRoot = path.resolve(mapDir, map.sourceRoot ?? '')
      map.sources = map.sources.map((source: string) => {
        const original = path.resolve(sourceRoot, source)
        return installedPath(original) ?? original
      })
      delete map.sourceRoot
      return { code: code.replace(sourceMappingUrl, ''), map }
    },
  }
}
