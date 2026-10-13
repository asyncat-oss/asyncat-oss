import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import ProjectDialog from './components/ProjectDialog';

/** The folder's path on disk (desktop app only), or ''. */
function pathOf(file) {
  try {
    return window.electronAPI?.getPathForFile?.(file) || '';
  } catch {
    return '';
  }
}

/** The single folder in a drop, or null. */
function droppedFolder(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []).filter((item) => item.kind === 'file');
  if (items.length !== 1) return null;
  const entry = items[0].webkitGetAsEntry?.();
  if (!entry?.isDirectory) return null;
  const file = items[0].getAsFile();
  const folderPath = file ? pathOf(file) : '';
  return folderPath || null;
}

/**
 * Drop a folder anywhere on the app (outside a drop area of its own, such as
 * the chat) to start a project for it: the new-project dialog opens with the
 * folder and its name filled in.
 */
export default function FolderDropProject() {
  const navigate = useNavigate();
  const [folder, setFolder] = useState('');
  const [hovering, setHovering] = useState(false);
  const depthRef = useRef(0);

  useEffect(() => {
    if (!window.electronAPI?.getPathForFile) return undefined;
    const carriesFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const onEnter = (event) => {
      if (!carriesFiles(event)) return;
      depthRef.current += 1;
      setHovering(true);
    };
    const onLeave = (event) => {
      if (!carriesFiles(event)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setHovering(false);
    };
    const onOver = (event) => {
      // Lets the drop reach this handler where nothing else takes it.
      if (carriesFiles(event) && !event.defaultPrevented) event.preventDefault();
    };
    const onDrop = (event) => {
      depthRef.current = 0;
      setHovering(false);
      if (event.defaultPrevented) return; // the chat or a file list took it
      const found = droppedFolder(event.dataTransfer);
      event.preventDefault();
      if (found) setFolder(found);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <>
      {hovering && !folder && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-strong bg-elevated px-3.5 py-2 text-[12px] text-fg-muted shadow-lg">
          <FolderPlus className="h-3.5 w-3.5 text-accent" />
          Drop a folder to make it a project
        </div>
      )}
      <ProjectDialog
        open={Boolean(folder)}
        initialFolder={folder}
        onClose={() => setFolder('')}
        onSaved={(created) => { if (created?.id) navigate(`/projects/${created.id}`); }}
      />
    </>
  );
}
