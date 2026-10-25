use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WirePacket {
    pub id: String,
    pub timestamp_str: String,
    pub latency_ms: u64,
    pub route: String,       // e.g. "claude → playwright-mcp"
    #[serde(default)]
    pub tool_name: String,   // e.g. "Bash", "mcp__update_plan", "ReadFile"
    #[serde(default)]
    pub summary_cmd: String, // e.g. "git status", "ls /Volumes"
    pub method_cmd: String,  // e.g. "tools/call: browser_snapshot"
    pub raw_tokens: u32,
    pub scrubbed_tokens: u32,
    pub saved_pct: f32,
    pub outcome: String,     // e.g. "200 OK · Compressed"
    pub tone: String,        // "green" | "blue" | "danger"
    pub raw_request: String,
    pub raw_response: String,
}
