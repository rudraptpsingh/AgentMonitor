use crate::engine::BpeTokenizerEngine;
use crate::models::{ContextAuditSummary, StartupContextItem};

#[tauri::command]
pub fn get_startup_context() -> (Vec<StartupContextItem>, ContextAuditSummary) {
    BpeTokenizerEngine::audit_startup_context()
}

#[tauri::command]
pub fn toggle_startup_item(_item_id: String, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn switch_context_profile(profile_name: String) -> Result<String, String> {
    Ok(format!("Profile successfully switched to {}", profile_name))
}
