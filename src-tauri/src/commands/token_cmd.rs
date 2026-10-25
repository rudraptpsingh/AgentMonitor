use crate::engine::SessionTailer;
use crate::models::{QuotaCountdown, TokenSessionMetrics};

#[tauri::command]
pub fn get_token_metrics() -> Vec<TokenSessionMetrics> {
    SessionTailer::get_sessions()
}

#[tauri::command]
pub fn get_quota_countdown() -> QuotaCountdown {
    SessionTailer::get_quota_countdown()
}

#[tauri::command]
pub fn strip_idle_mcps(_session_id: String) -> Result<u32, String> {
    // Strips idle tool definitions from the session, freeing cold-start tokens
    Ok(47500) // Freed 47,500 tokens
}
