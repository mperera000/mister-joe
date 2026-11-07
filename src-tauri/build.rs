fn main() {
  // whisper.cpp's Metal code uses @available checks, which need
  // ___isPlatformVersionAtLeast from clang's runtime library. Some Xcode setups
  // (like GitHub's Mac runners) don't link it on their own, so link it here.
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
    if let Ok(out) = std::process::Command::new("clang").arg("--print-resource-dir").output() {
      let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
      if std::path::Path::new(&format!("{dir}/lib/darwin/libclang_rt.osx.a")).exists() {
        println!("cargo:rustc-link-search=native={dir}/lib/darwin");
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
      }
    }
  }
  tauri_build::build()
}
