use std::path::Path;
use crate::models::{
    AgentProcessNode, CheckpointTurn, ContextAuditSummary, QuotaCountdown,
    ReapSummary, RewindResult, StartupContextItem, SystemStatsSummary,
    TokenSessionMetrics, WirePacket,
};

/// Interface Segregation Principle (ISP): Fine-grained traits for process inspection
pub trait ProcessScanner: Send + Sync {
    fn scan_agent_trees(&mut self) -> (Vec<AgentProcessNode>, SystemStatsSummary);
}

/// Interface Segregation Principle (ISP): Fine-grained trait for process lifecycle actions
pub trait ProcessController: Send + Sync {
    fn pause_agent(&self, pid: u32) -> Result<(), String>;
    fn resume_agent(&self, pid: u32) -> Result<(), String>;
    fn kill_tree(&mut self, root_pid: u32) -> Result<(), String>;
    fn reap_zombies(&self) -> ReapSummary;
}

/// Token & Quota observability trait
pub trait TokenAuditor: Send + Sync {
    fn get_sessions(&self) -> Vec<TokenSessionMetrics>;
    fn get_quota_countdown(&self) -> QuotaCountdown;
    fn audit_startup_context(&self) -> (Vec<StartupContextItem>, ContextAuditSummary);
}

/// Time-travel and shadow Merkle-tree checkpoint trait
pub trait CheckpointManager: Send + Sync {
    fn get_checkpoints(&self) -> Vec<CheckpointTurn>;
    fn rewind_to_snapshot(&self, snapshot_id: &str) -> RewindResult;
}

/// Open/Closed Principle (OCP): Extensible security guardrail interface
pub trait GuardrailRule: Send + Sync {
    fn name(&self) -> &'static str;
    fn evaluate(&self, target_path: &Path) -> Option<String>;
}

/// Protocol Wire packet inspection trait
pub trait WireInterceptor: Send + Sync {
    fn get_packets(&self) -> Vec<WirePacket>;
    fn scrub_output(&self, raw: &str) -> (String, bool);
}
