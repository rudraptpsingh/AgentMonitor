pub mod commands;
pub mod engine;
pub mod models;

use std::sync::Mutex;
use commands::*;
use engine::ProcessExplorerEngine;
use tauri::Manager;

pub fn run() {
    let state = AppState {
        explorer: Mutex::new(ProcessExplorerEngine::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                // Native window opens cleanly. Devtools can be opened via right click -> Inspect Element
            }
            Ok(())
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Tab 1: Processes & Zombies
            get_process_tree,
            pause_agent,
            resume_agent,
            kill_tree,
            reap_orphaned_zombies,
            heal_jsonl_hang,
            // Tab 2: Token Impact & Burn
            get_token_metrics,
            get_quota_countdown,
            strip_idle_mcps,
            // Tab 3: Filesystem & Rewind
            get_checkpoints,
            rewind_turn,
            // Tab 4: MCP & Tool Wire
            get_wire_packets,
            toggle_log_scrubber,
            abort_tool_call,
            // Tab 5: Startup Context & Autoruns
            get_startup_context,
            toggle_startup_item,
            switch_context_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentMonitor desktop application");
}
