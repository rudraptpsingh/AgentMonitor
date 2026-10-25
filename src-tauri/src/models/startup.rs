use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupContextItem {
    pub id: String,
    pub name_path: String,
    pub scope: String, // "Global OS" | "Repo-Local"
    pub static_token_weight: u32,
    #[serde(default)]
    pub file_size: String,
    #[serde(default)]
    pub line_count: usize,
    pub auto_start: bool,
    pub description: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreemapSlice {
    pub label: String,
    pub tokens: u32,
    pub percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextAuditSummary {
    pub total_static_tokens: u32,
    pub max_context_tokens: u32,
    pub used_percentage: f32,
    pub available_tokens: u32,
    pub active_profile: String,
    pub slices: Vec<TreemapSlice>,
}
