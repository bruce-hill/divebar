//! Minimal freedesktop icon lookup: the hicolor theme across XDG data
//! dirs, then /usr/share/pixmaps. Tray items install their icons into
//! hicolor (or ship an icon_theme_path, handled in tray.rs), so a full
//! index.theme/inherits implementation isn't needed here.

use std::path::{Path, PathBuf};

pub fn lookup(name: &str, size: u32) -> Option<PathBuf> {
    let mut best: Option<(u32, PathBuf)> = None;
    for root in icon_roots() {
        let Ok(entries) = std::fs::read_dir(root.join("hicolor")) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir_name = entry.file_name();
            let Some(score) = size_dir_score(&dir_name.to_string_lossy(), size) else {
                continue;
            };
            if best.as_ref().is_some_and(|(s, _)| *s <= score) {
                continue;
            }
            if let Some(path) = find_in_size_dir(&entry.path(), name) {
                best = Some((score, path));
            }
        }
    }
    if let Some((_, path)) = best {
        return Some(path);
    }
    ["png", "svg"].iter().find_map(|ext| {
        let path = Path::new("/usr/share/pixmaps").join(format!("{name}.{ext}"));
        path.is_file().then_some(path)
    })
}

fn icon_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        roots.push(home.join(".icons"));
        match std::env::var_os("XDG_DATA_HOME") {
            Some(data_home) => roots.push(PathBuf::from(data_home).join("icons")),
            None => roots.push(home.join(".local/share/icons")),
        }
    }
    let data_dirs =
        std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    roots.extend(
        data_dirs
            .split(':')
            .filter(|dir| !dir.is_empty())
            .map(|dir| Path::new(dir).join("icons")),
    );
    roots
}

/// How well a theme size directory ("48x48", "scalable", ...) matches the
/// target size: 0 is an exact match, lower is better, None means skip.
/// "scalable" scores 1 so an exact raster match wins but scalable beats
/// any other size.
fn size_dir_score(dir_name: &str, size: u32) -> Option<u32> {
    if dir_name == "scalable" {
        return Some(1);
    }
    let width: u32 = dir_name.split('x').next()?.parse().ok()?;
    Some(width.abs_diff(size).saturating_mul(2))
}

/// Searches the context subdirs (apps, status, devices, ...) of one theme
/// size directory.
fn find_in_size_dir(size_dir: &Path, name: &str) -> Option<PathBuf> {
    for context in std::fs::read_dir(size_dir).ok()?.flatten() {
        for ext in ["png", "svg"] {
            let path = context.path().join(format!("{name}.{ext}"));
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_size_beats_scalable_beats_near_sizes() {
        assert_eq!(size_dir_score("48x48", 48), Some(0));
        assert_eq!(size_dir_score("scalable", 48), Some(1));
        assert_eq!(size_dir_score("32x32", 48), Some(32));
        assert_eq!(size_dir_score("64x64", 48), Some(32));
        assert!(size_dir_score("47x47", 48).unwrap() > size_dir_score("scalable", 48).unwrap());
    }

    #[test]
    fn non_size_dirs_are_skipped() {
        assert_eq!(size_dir_score("symbolic", 48), None);
        assert_eq!(size_dir_score("index.theme", 48), None);
    }
}
