//! History is a folder of plain Markdown files, one per dictation. The files are the
//! database: open them in any editor, sync them however you like, delete them freely.

use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub created: String,
    pub duration_seconds: f32,
    pub model: String,
    pub polished: bool,
    pub source: String,
    pub text: String,
}

pub struct NewEntry<'a> {
    pub text: &'a str,
    pub duration_seconds: f32,
    pub model: &'a str,
    pub polished: bool,
    pub source: &'a str,
    pub created: DateTime<Local>,
}

pub fn default_dir() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join("Mister Joe")
}

pub fn save(dir: &Path, e: &NewEntry) -> Result<Entry, String> {
    std::fs::create_dir_all(dir).map_err(|err| format!("Couldn't create {}: {err}", dir.display()))?;
    let stem = file_stem(&e.created, e.text);
    let mut id = stem.clone();
    let mut n = 2;
    while dir.join(format!("{id}.md")).exists() {
        id = format!("{stem} {n}");
        n += 1;
    }
    let entry = Entry {
        id: id.clone(),
        created: e.created.to_rfc3339(),
        duration_seconds: (e.duration_seconds * 10.0).round() / 10.0,
        model: e.model.to_string(),
        polished: e.polished,
        source: e.source.to_string(),
        text: e.text.to_string(),
    };
    std::fs::write(dir.join(format!("{id}.md")), to_markdown(&entry))
        .map_err(|err| format!("Couldn't save the dictation: {err}"))?;
    Ok(entry)
}

pub fn list(dir: &Path) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else { return vec![] };
    let mut entries: Vec<Entry> = read
        .filter_map(Result::ok)
        .map(|d| d.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .filter_map(|p| {
            let id = p.file_stem()?.to_str()?.to_string();
            let content = std::fs::read_to_string(&p).ok()?;
            Some(parse_markdown(&id, &content))
        })
        .collect();
    entries.sort_by(|a, b| b.created.cmp(&a.created));
    entries
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("That isn't a Mister Joe history file.".into());
    }
    std::fs::remove_file(dir.join(format!("{id}.md"))).map_err(|e| format!("Couldn't delete it: {e}"))
}

/// "2026-11-07 11.45.52 remind me to send the budget"
pub fn file_stem(created: &DateTime<Local>, text: &str) -> String {
    let words: Vec<String> = text
        .split_whitespace()
        .map(|w| w.chars().filter(|c| c.is_alphanumeric() || *c == '\'').collect::<String>().to_lowercase())
        .filter(|w| !w.is_empty())
        .take(6)
        .collect();
    let stamp = created.format("%Y-%m-%d %H.%M.%S");
    if words.is_empty() {
        stamp.to_string()
    } else {
        format!("{stamp} {}", words.join(" "))
    }
}

pub fn to_markdown(e: &Entry) -> String {
    format!(
        "---\ncreated: {}\nduration_seconds: {}\nmodel: {}\npolished: {}\nsource: {}\n---\n\n{}\n",
        e.created, e.duration_seconds, e.model, e.polished, e.source, e.text.trim_end()
    )
}

pub fn parse_markdown(id: &str, content: &str) -> Entry {
    let mut entry = Entry {
        id: id.to_string(),
        created: String::new(),
        duration_seconds: 0.0,
        model: String::new(),
        polished: false,
        source: "dictation".into(),
        text: content.trim().to_string(),
    };
    let normalized = content.replace("\r\n", "\n");
    if let Some(rest) = normalized.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            for line in rest[..end].lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let v = v.trim();
                    match k.trim() {
                        "created" => entry.created = v.to_string(),
                        "duration_seconds" => entry.duration_seconds = v.parse().unwrap_or(0.0),
                        "model" => entry.model = v.to_string(),
                        "polished" => entry.polished = v == "true",
                        "source" => entry.source = v.to_string(),
                        _ => {}
                    }
                }
            }
            entry.text = rest[end + 4..].trim().to_string();
        }
    }
    entry
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn when() -> DateTime<Local> {
        Local.with_ymd_and_hms(2026, 11, 7, 11, 45, 52).unwrap()
    }

    #[test]
    fn names_files_by_time_and_first_words() {
        assert_eq!(
            file_stem(&when(), "Remind me to send the budget to Priya, by Friday."),
            "2026-11-07 11.45.52 remind me to send the budget"
        );
        assert_eq!(file_stem(&when(), "  ...  "), "2026-11-07 11.45.52");
    }

    #[test]
    fn markdown_round_trip() {
        let e = Entry {
            id: "x".into(),
            created: when().to_rfc3339(),
            duration_seconds: 8.9,
            model: "Accurate (small.en)".into(),
            polished: false,
            source: "sample".into(),
            text: "Hey, it's Mister Joe.\n\nSecond paragraph: with a colon.".into(),
        };
        assert_eq!(parse_markdown("x", &to_markdown(&e)), e);
    }

    #[test]
    fn save_list_delete() {
        let dir = std::env::temp_dir().join(format!("joe-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let new = NewEntry { text: "hello there", duration_seconds: 1.234, model: "m", polished: false, source: "dictation", created: when() };
        let a = save(&dir, &new).unwrap();
        let b = save(&dir, &new).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(list(&dir).len(), 2);
        assert_eq!(a.duration_seconds, 1.2);
        assert!(delete(&dir, "../etc/passwd").is_err());
        delete(&dir, &a.id).unwrap();
        assert_eq!(list(&dir).len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
