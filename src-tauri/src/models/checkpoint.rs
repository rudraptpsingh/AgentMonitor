use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointTurn {
    pub turn_number: u32,
    pub timestamp_str: String,
    pub prompt_summary: String,
    pub files_summary: String,
    pub files_modified_count: usize,
    pub lines_added: u32,
    pub lines_deleted: u32,
    pub guardrail_status: String, // "SAFE" | "BLOCKED: .env read" | "BLOCKED: ../ traversal"
    pub snapshot_id: String,
    pub tone: String,             // "green" | "danger" | "amber"
    pub diff_file: Option<String>,
    pub diff_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindResult {
    pub success: bool,
    pub restored_snapshot_id: String,
    pub elapsed_ms: u64,
    pub message: String,
}
