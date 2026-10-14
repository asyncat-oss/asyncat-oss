// The one neutral icon for each place in Files and each kind of thing it lists.

import {
  Archive, AudioLines, BookOpen, CircleDashed, Code2, Cpu, Eye, File, FileText, Folder, Globe, GraduationCap, HardDrive, History,
  Image as ImageIcon, Layers, LayoutGrid, Music, Network, NotebookPen, Paperclip, ScrollText, Table,
} from 'lucide-react';

export const PLACE_ICONS = {
  made: LayoutGrid,
  uploads: Paperclip,
  models: Cpu,
  training: GraduationCap,
  exports: Archive,
  logs: ScrollText,
  system: HardDrive,
};

const KIND_ICONS = {
  picture: ImageIcon,
  document: FileText,
  page: Globe,
  data: Table,
  diagram: Network,
  audio: Music,
  code: Code2,
  note: NotebookPen,
  knowledge: BookOpen,
  language: Cpu,
  vision: Eye,
  image: ImageIcon,
  voice: AudioLines,
  unfinished: CircleDashed,
  dataset: Table,
  adapter: Layers,
  result: Folder,
  export: Archive,
  log: ScrollText,
  cache: Folder,
  undo: History,
};

/** The icon for an item's kind (attachments by what the file is). */
export function kindIcon(item) {
  if (item.isFolder && !KIND_ICONS[item.kind]) return Folder;
  return KIND_ICONS[item.fileKind] || KIND_ICONS[item.kind] || File;
}

