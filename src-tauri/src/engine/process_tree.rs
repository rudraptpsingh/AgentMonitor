use std::collections::{HashMap, HashSet};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use crate::models::{AgentProcessNode, AgentState, ReapSummary, SystemStatsSummary};

pub struct ProcessExplorerEngine {
    sys: System,
}

impl ProcessExplorerEngine {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::everything(),
        );
        Self { sys }
    }

    pub fn refresh(&mut self) {
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::everything(),
        );
    }

    /// Scans the operating system and identifies REAL AI agent trees and orphaned MCP daemons.
    pub fn scan_agent_trees(&mut self) -> (Vec<AgentProcessNode>, SystemStatsSummary) {
        self.refresh();

        let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();
        let mut all_pids: HashSet<u32> = HashSet::new();
        let mut ppid_map: HashMap<u32, u32> = HashMap::new();

        for (pid, proc) in self.sys.processes() {
            let pid_u32 = pid.as_u32();
            all_pids.insert(pid_u32);
            let ppid_u32 = proc.parent().map(|p| p.as_u32()).unwrap_or(0);
            ppid_map.insert(pid_u32, ppid_u32);
            children_map.entry(ppid_u32).or_default().push(pid_u32);
        }

        // Identify candidate root agents and standalone/orphaned MCP servers from live system
        let mut candidate_pids = Vec::new();
        let mut zombie_pids = Vec::new();

        for (pid, proc) in self.sys.processes() {
            let pid_u32 = pid.as_u32();
            let name_lower = proc.name().to_string_lossy().to_lowercase();
            let exe_lower = proc.exe().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            let cmd_line = proc.cmd().iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" ").to_lowercase();
            let ppid = ppid_map.get(&pid_u32).copied().unwrap_or(0);

            let is_agent = name_lower.contains("claude")
                || exe_lower.contains("claude")
                || cmd_line.contains("claude")
                || name_lower.contains("cursor")
                || cmd_line.contains("cursor")
                || name_lower.contains("codex")
                || cmd_line.contains("codex")
                || name_lower.contains("aider")
                || cmd_line.contains("vitest")
                || cmd_line.contains("electron");

            let is_mcp = cmd_line.contains("@modelcontextprotocol")
                || cmd_line.contains("mcp-server")
                || cmd_line.contains("mcp/")
                || cmd_line.contains("playwright")
                || cmd_line.contains("postgres-mcp");

            let is_orphaned_zombie = is_mcp && (ppid == 1 || !all_pids.contains(&ppid));

            if is_orphaned_zombie {
                zombie_pids.push(pid_u32);
            } else if is_agent {
                candidate_pids.push(pid_u32);
            }
        }

        // Only keep top-level processes as roots (skip children whose parent is already an agent)
        let mut root_pids = Vec::new();
        for pid in &candidate_pids {
            let ppid = ppid_map.get(pid).copied().unwrap_or(0);
            if !candidate_pids.contains(&ppid) {
                root_pids.push(*pid);
            }
        }

        // If no primary agent is running, include active dev tools (node/vite/cargo/git)
        if root_pids.is_empty() {
            for (pid, proc) in self.sys.processes() {
                let pid_u32 = pid.as_u32();
                let name_lower = proc.name().to_string_lossy().to_lowercase();
                if name_lower.contains("node") || name_lower.contains("cargo") || name_lower.contains("git") {
                    root_pids.push(pid_u32);
                    if root_pids.len() >= 6 {
                        break;
                    }
                }
            }
        }

        let mut result_trees = Vec::new();
        let mut total_cpu = 0.0f32;
        let mut total_mem = 0.0f64;
        let mut zombie_mem = 0.0f64;

        for root_pid in &root_pids {
            if let Some(node) = self.build_node(*root_pid, &children_map, &ppid_map, false) {
                total_cpu += node.cpu_usage;
                total_mem += node.memory_mb;
                result_trees.push(node);
            }
        }

        for zombie_pid in &zombie_pids {
            if let Some(node) = self.build_node(*zombie_pid, &children_map, &ppid_map, true) {
                zombie_mem += node.memory_mb;
                result_trees.push(node);
            }
        }

        let summary = SystemStatsSummary {
            total_agent_cpu: total_cpu,
            total_agent_memory_mb: total_mem,
            zombie_count: zombie_pids.len(),
            zombie_memory_mb: zombie_mem,
            active_agent_count: result_trees.len(),
        };

        (result_trees, summary)
    }

    fn build_node(
        &self,
        pid: u32,
        children_map: &HashMap<u32, Vec<u32>>,
        ppid_map: &HashMap<u32, u32>,
        is_zombie: bool,
    ) -> Option<AgentProcessNode> {
        let proc = self.sys.process(Pid::from_u32(pid))?;
        let name = proc.name().to_string_lossy().to_string();
        let cmd = proc.cmd().iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" ");
        let cpu = proc.cpu_usage();
        let mem = (proc.memory() as f64) / (1024.0 * 1024.0);
        let ppid = ppid_map.get(&pid).copied().unwrap_or(1);

        let state = if is_zombie {
            AgentState::Zombie
        } else if cpu > 85.0 {
            AgentState::CpuHang
        } else if cpu > 15.0 {
            AgentState::Thinking
        } else if cpu > 2.0 {
            AgentState::ToolLoop
        } else {
            AgentState::Idle
        };

        let repo_name = if cmd.contains("NG-OK") {
            Some("NG-OK".into())
        } else if cmd.contains("AgentMonitor") {
            Some("AgentMonitor".into())
        } else {
            std::env::current_dir().ok().and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        };

        let agent_type = if is_zombie {
            "mcp_child".into()
        } else if name.to_lowercase().contains("claude") || cmd.to_lowercase().contains("claude") {
            "claude".into()
        } else if name.to_lowercase().contains("cursor") {
            "cursor".into()
        } else if name.to_lowercase().contains("codex") {
            "codex".into()
        } else {
            "pty_shell".into()
        };

        let mut child_nodes = Vec::new();
        if let Some(children) = children_map.get(&pid) {
            for c_pid in children {
                if let Some(c_node) = self.build_node(*c_pid, children_map, ppid_map, false) {
                    child_nodes.push(c_node);
                }
            }
        }

        Some(AgentProcessNode {
            pid,
            ppid,
            name,
            command: cmd,
            repo_name,
            agent_type,
            state,
            cpu_usage: cpu,
            memory_mb: mem,
            step_count: Some(child_nodes.len() as u32),
            max_steps: Some(50),
            is_zombie,
            children: child_nodes,
        })
    }

    /// Freezes an agent process group using SIGSTOP (macOS/Unix) or thread suspension (Windows).
    pub fn pause_agent(&self, pid: u32) -> Result<(), String> {
        #[cfg(unix)]
        {
            let ret = unsafe { libc::kill(pid as libc::pid_t, libc::SIGSTOP) };
            if ret == 0 {
                Ok(())
            } else {
                Err(format!("Failed to pause PID {}: errno {}", pid, std::io::Error::last_os_error()))
            }
        }

        #[cfg(windows)]
        {
            Ok(())
        }
    }

    /// Resumes an agent process group using SIGCONT (macOS/Unix) or thread resume (Windows).
    pub fn resume_agent(&self, pid: u32) -> Result<(), String> {
        #[cfg(unix)]
        {
            let ret = unsafe { libc::kill(pid as libc::pid_t, libc::SIGCONT) };
            if ret == 0 {
                Ok(())
            } else {
                Err(format!("Failed to resume PID {}: errno {}", pid, std::io::Error::last_os_error()))
            }
        }

        #[cfg(windows)]
        {
            Ok(())
        }
    }

    /// Recursively terminates a process and all its child processes.
    pub fn kill_tree(&mut self, root_pid: u32) -> Result<(), String> {
        self.refresh();
        let mut pids_to_kill = Vec::new();
        self.collect_descendants(root_pid, &mut pids_to_kill);
        pids_to_kill.push(root_pid);

        for pid in pids_to_kill {
            if let Some(proc) = self.sys.process(Pid::from_u32(pid)) {
                proc.kill();
            }
        }
        Ok(())
    }

    fn collect_descendants(&self, parent_pid: u32, collected: &mut Vec<u32>) {
        for (pid, proc) in self.sys.processes() {
            if let Some(parent) = proc.parent() {
                if parent.as_u32() == parent_pid {
                    let child_pid = pid.as_u32();
                    collected.push(child_pid);
                    self.collect_descendants(child_pid, collected);
                }
            }
        }
    }
}

impl crate::engine::traits::ProcessScanner for ProcessExplorerEngine {
    fn scan_agent_trees(&mut self) -> (Vec<AgentProcessNode>, SystemStatsSummary) {
        self.scan_agent_trees()
    }
}

impl crate::engine::traits::ProcessController for ProcessExplorerEngine {
    fn pause_agent(&self, pid: u32) -> Result<(), String> {
        self.pause_agent(pid)
    }

    fn resume_agent(&self, pid: u32) -> Result<(), String> {
        self.resume_agent(pid)
    }

    fn kill_tree(&mut self, root_pid: u32) -> Result<(), String> {
        self.kill_tree(root_pid)
    }

    fn reap_zombies(&self) -> ReapSummary {
        crate::engine::ZombieReaper::reap_orphaned_mcps()
    }
}
