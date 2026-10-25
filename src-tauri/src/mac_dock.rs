#[cfg(target_os = "macos")]
extern "C" {
    fn set_macos_dock_icon_from_path(utf8_path: *const libc::c_char);
}

#[cfg(target_os = "macos")]
pub fn set_dock_icon() {
    use std::ffi::CString;

    let candidates = [
        "src-tauri/icons/icon.png",
        "icons/icon.png",
        "../src-tauri/icons/icon.png",
        "src-tauri/icons/icon.icns",
        "icons/icon.icns",
        "/tmp/agentmonitor_1024.png",
    ];

    let mut found_path = None;
    for c in candidates {
        if let Ok(canon) = std::fs::canonicalize(c) {
            found_path = Some(canon.to_string_lossy().to_string());
            break;
        }
    }

    if let Some(path) = found_path {
        if let Ok(c_path) = CString::new(path) {
            unsafe {
                set_macos_dock_icon_from_path(c_path.as_ptr());
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_dock_icon() {}
