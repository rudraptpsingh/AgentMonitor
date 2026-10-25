use std::sync::Mutex;
use tauri::State;
use crate::engine::{ProcessExplorerEngine, SessionTailer, ZombieReaper};
use crate::models::{AgentProcessNode, ReapSummary, SystemStatsSummary};

pub struct AppState {
    pub explorer: Mutex<ProcessExplorerEngine>,
}

#[tauri::command]
pub fn get_process_tree(state: State<'_, AppState>) -> Result<(Vec<AgentProcessNode>, SystemStatsSummary), String> {
    let mut explorer = state.explorer.lock().map_err(|e| e.to_string())?;
    Ok(explorer.scan_agent_trees())
}

#[tauri::command]
pub fn pause_agent(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    let explorer = state.explorer.lock().map_err(|e| e.to_string())?;
    explorer.pause_agent(pid)
}

#[tauri::command]
pub fn resume_agent(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    let explorer = state.explorer.lock().map_err(|e| e.to_string())?;
    explorer.resume_agent(pid)
}

#[tauri::command]
pub fn kill_tree(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    let mut explorer = state.explorer.lock().map_err(|e| e.to_string())?;
    explorer.kill_tree(pid)
}

#[tauri::command]
pub fn reap_orphaned_zombies() -> Result<ReapSummary, String> {
    Ok(ZombieReaper::reap_orphaned_mcps())
}

#[tauri::command]
pub fn heal_jsonl_hang(project_path: String) -> Result<u32, String> {
    SessionTailer::heal_jsonl_hang(&project_path)
}
