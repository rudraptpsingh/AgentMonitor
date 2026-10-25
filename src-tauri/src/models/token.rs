use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSessionMetrics {
    pub id: String,
    pub session_name: String,
    pub provider: String,
    pub model: String,
    pub cold_start_tax_tokens: u32,
    pub active_mcps_count: usize,
    pub burn_rate_tokens_min: f64,
    pub burn_rate_cost_hr: f64,
    pub task_cost_dollars: f64,
    pub quota_5hr_pct: f32,
    pub quota_weekly_pct: f32,
    pub quota_status: String, // "safe" | "warning" | "exceeded"
    pub tone: String,         // "green" | "blue" | "amber" | "danger"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenBurnPoint {
    pub timestamp_sec: u64,
    pub system_mcp_tokens: u32,
    pub reasoning_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaCountdown {
    pub provider_name: String,
    pub remaining_seconds: u64,
    pub formatted_countdown: String,
    pub safe_p90: bool,
    pub headroom_pct: f32,
}
