use crate::engine::McpTapEngine;
use crate::models::WirePacket;

#[tauri::command]
pub fn get_wire_packets() -> Vec<WirePacket> {
    McpTapEngine::get_packets()
}

#[tauri::command]
pub fn toggle_log_scrubber(enabled: bool) -> bool {
    enabled
}

#[tauri::command]
pub fn abort_tool_call(_packet_id: String) -> Result<(), String> {
    Ok(())
}
