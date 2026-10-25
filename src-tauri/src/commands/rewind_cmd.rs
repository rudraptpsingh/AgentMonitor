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
