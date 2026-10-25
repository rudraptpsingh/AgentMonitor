use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use crate::models::ReapSummary;

pub struct ZombieReaper;

impl ZombieReaper {
    pub fn reap_orphaned_mcps() -> ReapSummary {
        let mut sys = System::new();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            ProcessRefreshKind::new().with_cpu().with_memory(),
        );

        let mut terminated_pids = Vec::new();
        let mut process_names = Vec::new();
        let mut freed_mb = 0.0f64;

        for (pid, proc) in sys.processes() {
            let pid_u32 = pid.as_u32();
            let cmd = proc.cmd().iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" ").to_lowercase();
            let ppid = proc.parent().map(|p| p.as_u32()).unwrap_or(0);

            let is_mcp = cmd.contains("@modelcontextprotocol")
                || cmd.contains("playwright/mcp")
                || cmd.contains("postgres-mcp")
                || cmd.contains("mcp-server");

            // On Unix, detached children are reparented to 1 (init/launchd)
            // On Windows, parent PID is either 0 or points to an exited process
            let is_orphaned = is_mcp && (ppid == 1 || ppid == 0 || sys.process(Pid::from_u32(ppid)).is_none());

            if is_orphaned {
                let mem = (proc.memory() as f64) / (1024.0 * 1024.0);
                let name = proc.name().to_string_lossy().to_string();
                proc.kill();
                terminated_pids.push(pid_u32);
                process_names.push(name);
                freed_mb += mem;
            }
        }

        ReapSummary {
            terminated_pids,
            freed_memory_mb: freed_mb,
            process_names,
        }
    }
}
