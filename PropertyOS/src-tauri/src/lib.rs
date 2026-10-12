use fs2::FileExt;
use serde_json::Value;
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use tauri::Manager;

fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "Application storage directory is unavailable.")?;
    fs::create_dir_all(&dir).map_err(|_| "Could not create local storage. Check disk permissions.")?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).map_err(|_| "Could not secure the local data directory.")?; }
    Ok(dir)
}
fn read(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() { return Ok(None); }
    fs::read_to_string(path).map(Some).map_err(|_| "Could not read the encrypted workspace. No data was replaced.".into())
}
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid local storage location.")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not prepare an atomic save.")?;
    file.write_all(content.as_bytes()).and_then(|_| file.flush()).and_then(|_| file.as_file().sync_all()).map_err(|_| "Could not save. Check available disk space.")?;
    file.persist(path).map_err(|_| "Could not replace the encrypted workspace. The previous version remains available.")?;
    #[cfg(unix)] { let _ = std::fs::File::open(parent).and_then(|f| f.sync_all()); }
    Ok(())
}
#[tauri::command]
fn read_vault(app: tauri::AppHandle) -> Result<Option<String>, String> { read(&directory(&app)?.join("workspace.posvault")) }
#[tauri::command]
fn read_recovery(app: tauri::AppHandle) -> Result<Option<String>, String> { read(&directory(&app)?.join("recovery.posvault")) }
#[tauri::command]
fn write_vault(app: tauri::AppHandle, content: String, expected: Option<u64>) -> Result<(), String> {
    let dir = directory(&app)?;
    let lock = OpenOptions::new().create(true).truncate(false).read(true).write(true).open(dir.join("workspace.lock")).map_err(|_| "Could not lock the workspace for saving.")?;
    lock.lock_exclusive().map_err(|_| "Another application is saving this workspace.")?;
    let path = dir.join("workspace.posvault");
    let old = read(&path)?;
    let revision = match &old { Some(data) => Some(serde_json::from_str::<Value>(data).map_err(|_| "The current encrypted workspace header is damaged. Restore a verified backup.")?["revision"].as_u64().ok_or("Invalid workspace revision.")?), None => None };
    if revision != expected { return Err("Another session changed this workspace. Lock and reopen before continuing.".into()); }
    let incoming: Value = serde_json::from_str(&content).map_err(|_| "Invalid encrypted workspace.")?;
    if incoming["format"] != "PropertyOS" || incoming["version"] != 1 || incoming["revision"].as_u64().is_none() || incoming["ciphertext"].as_str().is_none() { return Err("Invalid encrypted workspace header.".into()); }
    if let Some(previous) = old { atomic_write(&dir.join("recovery.posvault"), &previous)?; }
    atomic_write(&path, &content)
}
#[tauri::command]
fn checkpoint_vault(app: tauri::AppHandle, day: String) -> Result<(), String> {
    if day.len()!=10 || !day.chars().all(|c| c.is_ascii_digit() || c=='-') { return Err("Invalid backup date.".into()); }
    let dir=directory(&app)?;
    if let Some(current)=read(&dir.join("workspace.posvault"))? {
        let backups=dir.join("backups");fs::create_dir_all(&backups).map_err(|_| "Could not create backup directory.")?;
        let target=backups.join(format!("{}.posvault",day));if !target.exists(){atomic_write(&target,&current)?;}
    }
    Ok(())
}
#[tauri::command]
fn preserve_restore(app: tauri::AppHandle, content: String) -> Result<(), String> {
    atomic_write(&directory(&app)?.join("pre-restore.posvault"), &content)
}
#[tauri::command]
fn last_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir=directory(&app)?.join("backups"); if !dir.exists(){return Ok(None);}
    let mut names: Vec<String> = fs::read_dir(dir).map_err(|_| "Could not inspect backups.")?.filter_map(|e| e.ok()).filter_map(|e| e.file_name().to_str().map(str::to_owned)).filter(|n|n.ends_with(".posvault")).collect();names.sort();Ok(names.last().map(|n| n.trim_end_matches(".posvault").to_owned()))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_vault, read_recovery, write_vault, checkpoint_vault, preserve_restore, last_backup])
        .run(tauri::generate_context!())
        .expect("PropertyOS could not start");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn atomic_saves_replace_without_truncation() { let d=tempfile::tempdir().unwrap();let p=d.path().join("vault");atomic_write(&p,"first").unwrap();atomic_write(&p,"second").unwrap();assert_eq!(read(&p).unwrap().unwrap(),"second"); }
}
