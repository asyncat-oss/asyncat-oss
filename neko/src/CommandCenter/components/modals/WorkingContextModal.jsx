import { useState, useEffect, useCallback, useMemo } from "react";
import { X, ChevronRight, FolderOpen, Check, Loader2, ArrowLeft } from "lucide-react";
import Portal from "../../../components/Portal";
import { filesApi } from "../../api";
import { dirname, basename, rootIcon } from "../../../files/fileUtils.js";

function normalizeFsPath(value = "") {
  return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

function absoluteFromRoot(rootPath = "", relativePath = ".") {
  if (!rootPath) return "";
  if (!relativePath || relativePath === ".") return rootPath;
  return `${String(rootPath).replace(/[\\/]+$/, "")}/${String(relativePath).replace(/^\/+/, "")}`;
}

function buildBreadcrumbs(relativePath = ".") {
  if (!relativePath || relativePath === ".") return [{ label: "Root", path: "." }];
  const segments = String(relativePath).split("/").filter(Boolean);
  const crumbs = [{ label: "Root", path: "." }];
  segments.forEach((segment, index) => {
    crumbs.push({ label: segment, path: segments.slice(0, index + 1).join("/") });
  });
  return crumbs;
}

function contextFromAbsolutePath(rawPath, roots = []) {
  const target = normalizeFsPath(rawPath);
  const matches = roots
    .map(root => ({ root, rootPath: normalizeFsPath(root.path || "") }))
    .filter(item => item.rootPath && (target === item.rootPath || target.startsWith(`${item.rootPath}/`)))
    .sort((a, b) => b.rootPath.length - a.rootPath.length);
  const match = matches[0];
  if (!match) return null;
  const relativePath = target === match.rootPath ? "." : target.slice(match.rootPath.length + 1) || ".";
  return { rootId: match.root.id, rootPath: match.root.path, relativePath };
}

export function WorkingContextModal({
  isOpen,
  onClose,
  onSelect,
  fileRoots = [],
  initialRootId = "workspace",
  initialRelativePath = ".",
  activeWorkingDir = "",
}) {
  const [rootId, setRootId] = useState(initialRootId);
  const [browsePath, setBrowsePath] = useState(initialRelativePath);
  const [manualPath, setManualPath] = useState(activeWorkingDir);
  const [manualError, setManualError] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRootId(initialRootId);
    setBrowsePath(initialRelativePath);
    setManualPath(activeWorkingDir);
    setManualError(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    filesApi
      .listDirectory(rootId, browsePath || ".", false, { limit: 240 })
      .then(res => {
        if (!cancelled) setEntries((res.entries || []).filter(e => e.type === "dir"));
      })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, rootId, browsePath]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [isOpen, onClose]);

  const activeRoot = fileRoots.find(r => r.id === rootId) || fileRoots[0];
  const workingDir = activeRoot ? absoluteFromRoot(activeRoot.path, browsePath) : "";
  const breadcrumbs = useMemo(() => buildBreadcrumbs(browsePath), [browsePath]);
  const folderLabel = browsePath === "." ? (activeRoot?.label || "Root") : basename(browsePath);

  const navigateTo = useCallback((path, root = activeRoot) => {
    setBrowsePath(path);
    setManualPath(absoluteFromRoot(root?.path || "", path));
    setManualError(null);
  }, [activeRoot]);

  const applyManualPath = useCallback(() => {
    const ctx = contextFromAbsolutePath(manualPath, fileRoots);
    if (!ctx) {
      setManualError("Path must be inside one of your listed workspaces.");
      return;
    }
    setManualError(null);
    const newRoot = fileRoots.find(r => r.id === ctx.rootId);
    setRootId(ctx.rootId);
    setBrowsePath(ctx.relativePath);
    setManualPath(absoluteFromRoot(newRoot?.path || "", ctx.relativePath));
  }, [fileRoots, manualPath]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 animate-in zoom-in-95 duration-150"
          style={{ maxHeight: "min(640px, 90vh)" }}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Change workspace folder"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800 midnight:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Change workspace folder</h2>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                The selected folder becomes the agent's working directory
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {/* Root / workspace list */}
            <div className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-gray-100 p-2 dark:border-gray-800 midnight:border-slate-800">
              <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                Workspaces
              </p>
              {fileRoots.map(root => {
                const RootIcon = rootIcon(root.kind);
                const active = root.id === rootId;
                return (
                  <button
                    key={root.id}
                    type="button"
                    onClick={() => {
                      const newRoot = root;
                      setRootId(newRoot.id);
                      setBrowsePath(".");
                      setManualPath(newRoot.path || "");
                      setManualError(null);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                    }`}
                  >
                    <RootIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{root.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Folder browser */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* Path bar */}
              <div className="border-b border-gray-100 px-4 pb-3 pt-3 dark:border-gray-800 midnight:border-slate-800">
                {/* Breadcrumbs */}
                <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-0.5">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.path} className="inline-flex min-w-0 items-center gap-0.5">
                      {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600" />}
                      <button
                        type="button"
                        onClick={() => navigateTo(crumb.path)}
                        className={`max-w-[9rem] truncate rounded px-1.5 py-0.5 text-xs transition-colors ${
                          i === breadcrumbs.length - 1
                            ? "bg-gray-100 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                            : "text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        {crumb.label}
                      </button>
                    </span>
                  ))}
                  {browsePath !== "." && (
                    <button
                      type="button"
                      onClick={() => navigateTo(dirname(browsePath))}
                      className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      title="Go up one level"
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Manual path input */}
                <div className="flex gap-2">
                  <input
                    value={manualPath}
                    onChange={e => { setManualPath(e.target.value); setManualError(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyManualPath(); } }}
                    placeholder="/absolute/path/to/project"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-300 outline-none transition-colors focus:border-gray-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:bg-gray-900 midnight:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={applyManualPath}
                    className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:border-slate-700"
                  >
                    Go
                  </button>
                </div>
                {manualError && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{manualError}</p>
                )}
              </div>

              {/* Folder list */}
              <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading folders…
                  </div>
                ) : entries.length > 0 ? (
                  entries.map(entry => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => navigateTo(entry.path)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:hover:bg-slate-800"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-amber-400 dark:text-amber-500" />
                      <span className="flex-1 truncate">{entry.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <FolderOpen className="h-8 w-8 text-gray-200 dark:text-gray-700" />
                    <p className="text-sm text-gray-400 dark:text-gray-500">No subfolders here</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 border-t border-gray-100 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-800/40 midnight:border-slate-800 midnight:bg-slate-900/40">
            <p className="min-w-0 truncate text-xs text-gray-400 dark:text-gray-500" title={workingDir}>
              {workingDir || "—"}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSelect(rootId, browsePath)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-indigo-600 midnight:hover:bg-indigo-500 midnight:text-white"
              >
                <Check className="h-3.5 w-3.5" />
                Use &ldquo;{folderLabel}&rdquo;
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default WorkingContextModal;
