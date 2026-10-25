use crate::engine::ShadowGitEngine;
use crate::models::{CheckpointTurn, RewindResult};

#[tauri::command]
pub fn get_checkpoints() -> Vec<CheckpointTurn> {
    ShadowGitEngine::get_checkpoints()
}

#[tauri::command]
pub fn rewind_turn(snapshot_id: String) -> RewindResult {
    ShadowGitEngine::rewind_to_snapshot(&snapshot_id)
}

#[tauri::command]
pub fn get_file_diff(snapshot_id: String, file_path: String) -> Result<String, String> {
    ShadowGitEngine::get_file_diff(&snapshot_id, &file_path)
}

#[tauri::command]
pub fn open_local_file(file_path: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&file_path).spawn();
        Ok(true)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd").args(["/c", "start", "", &file_path]).spawn();
        Ok(true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&file_path).spawn();
        Ok(true)
    }
}
