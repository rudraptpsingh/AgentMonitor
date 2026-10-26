use std::path::Path;
use agent_monitor::engine::{
    BpeTokenizerEngine, McpTapEngine, ProcessExplorerEngine, SensitiveBoundaryGuardrail,
    SessionTailer, ShadowGitEngine,
};
use agent_monitor::engine::traits::{
    CheckpointManager, GuardrailRule, ProcessController,
    TokenAuditor, WireInterceptor,
};

#[test]
fn test_process_scanner_and_controller() {
    let mut explorer = ProcessExplorerEngine::new();
    let (trees, summary) = explorer.scan_agent_trees();
    
    assert!(!trees.is_empty(), "Should detect live agent or developer processes");
    assert!(summary.active_agent_count > 0);

    // Test ProcessController trait implementation
    let reap_summary = explorer.reap_zombies();
    assert!(reap_summary.freed_memory_mb >= 0.0);
}

#[test]
fn test_token_auditor_trait() {
    let tailer = SessionTailer;
    let sessions = tailer.get_sessions();
    assert!(!sessions.is_empty(), "Should discover real local sessions");

    let countdown = tailer.get_quota_countdown();
    assert!(countdown.safe_p90);

    let (items, audit) = tailer.audit_startup_context();
    assert!(!items.is_empty(), "Should audit real files in workspace and ~/.claude");
    assert_eq!(audit.max_context_tokens, 200_000);
}

#[test]
fn test_checkpoint_and_guardrail_rule() {
    let shadow_git = ShadowGitEngine;
    let checkpoints = shadow_git.get_checkpoints();
    assert!(!checkpoints.is_empty(), "Should read real git commit history or working tree status");

    let rewind_res = shadow_git.rewind_to_snapshot("snap_test");
    assert!(rewind_res.success);

    let revert_file_res = ShadowGitEngine::revert_single_file("snap_test", "src/App.tsx");
    assert!(revert_file_res.success);
    assert_eq!(revert_file_res.restored_snapshot_id, "snap_test");

    let guardrail = SensitiveBoundaryGuardrail;
    assert_eq!(guardrail.name(), "SensitiveBoundaryGuardrail");

    let blocked_env = guardrail.evaluate(Path::new("repo/.env"));
    assert!(blocked_env.is_some(), ".env file must be intercepted");

    let blocked_ssh = guardrail.evaluate(Path::new("~/.ssh/id_rsa"));
    assert!(blocked_ssh.is_some(), "~/.ssh credentials must be intercepted");

    let safe_file = guardrail.evaluate(Path::new("repo/src/App.tsx"));
    assert!(safe_file.is_none(), "Regular source files must pass guardrails");
}

#[test]
fn test_wire_interceptor_trait() {
    let tap = McpTapEngine;
    let packets = tap.get_packets();
    assert!(!packets.is_empty(), "Should extract real tool calls from ~/.claude/projects/ logs");

    let (scrubbed, was_compressed) = tap.scrub_output(
        "Line 1\nLine 2\nError: compilation failed\nFatal: test failed"
    );
    assert!(!scrubbed.is_empty());
    assert!(!was_compressed);
}

#[test]
fn test_bpe_token_counting() {
    let count = BpeTokenizerEngine::count_tokens("AgentMonitor: Activity Monitor for AI Agents");
    assert!(count > 0);
}
