use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AgentState {
    Thinking,
    ToolLoop,
    CpuHang,
    Zombie,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcessNode {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub command: String,
    pub repo_name: Option<String>,
    pub agent_type: String, // "claude" | "codex" | "cursor" | "mcp_child" | "pty_shell"
    pub state: AgentState,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub step_count: Option<u32>,
    pub max_steps: Option<u32>,
    pub is_zombie: bool,
    pub children: Vec<AgentProcessNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReapSummary {
    pub terminated_pids: Vec<u32>,
    pub freed_memory_mb: f64,
    pub process_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatsSummary {
    pub total_agent_cpu: f32,
    pub total_agent_memory_mb: f64,
    pub zombie_count: usize,
    pub zombie_memory_mb: f64,
    pub active_agent_count: usize,
}
