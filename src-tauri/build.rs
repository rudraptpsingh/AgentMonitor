fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/mac_dock.m")
            .flag("-fobjc-arc")
            .compile("mac_dock");
        println!("cargo:rustc-link-lib=framework=Cocoa");
    }

    tauri_build::build()
}
