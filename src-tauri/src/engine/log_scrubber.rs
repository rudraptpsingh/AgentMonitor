use regex::Regex;

pub struct LogScrubberEngine {
    enabled: bool,
}

impl LogScrubberEngine {
    pub fn new() -> Self {
        Self { enabled: true }
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Compresses verbose terminal logs (e.g. npm test, cargo build, vitest) down to failure essentials
    pub fn scrub_terminal_output(&self, raw_output: &str) -> (String, bool) {
        if !self.enabled || raw_output.len() < 2000 {
            return (raw_output.to_string(), false);
        }

        let lines: Vec<&str> = raw_output.lines().collect();
        let error_regex = Regex::new(r"(?i)(error|failed|failure|fatal|panic|exception)").unwrap();

        let mut error_lines = Vec::new();
        for line in &lines {
            if error_regex.is_match(line) {
                error_lines.push(*line);
            }
        }

        if error_lines.is_empty() {
            let summary = format!(
                "[AgentMonitor LogScrubber: {} lines condensed into success summary]\n{}",
                lines.len(),
                lines.iter().take(10).cloned().collect::<Vec<_>>().join("\n")
            );
            return (summary, true);
        }

        let condensed = format!(
            "[AgentMonitor LogScrubber: Compressed {} lines down to {} relevant error lines]\n{}",
            lines.len(),
            error_lines.len().min(15),
            error_lines.iter().take(15).cloned().collect::<Vec<_>>().join("\n")
        );

        (condensed, true)
    }
}
