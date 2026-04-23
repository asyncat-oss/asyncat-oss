// SourcesSection.jsx - Unified info footer: data sources + bonus links + knowledge notice
import { useMemo, useState } from 'react';
import {
  ExternalLink, Database, FileText, Calendar, CheckSquare,
  Target, RotateCcw, BarChart3, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';

// ─── Bonus Links Parser (moved here from BonusLinksSection) ─────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const parseBonusLinks = (content) => {
  if (!content || typeof content !== 'string') return [];
  const blockMatch = content.match(/<bonus_links>([\s\S]*?)<\/bonus_links>/i);
  if (!blockMatch) return [];
  const lines = blockMatch[1].trim().split('\n');
  const links = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const mdMatch = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)(?:\s*[-–—]\s*(.+))?$/);
    if (mdMatch) {
      links.push({ title: mdMatch[1].trim(), url: mdMatch[2].trim(), description: mdMatch[3]?.trim() || null });
      continue;
    }
    const plainMatch = trimmed.match(/^(https?:\/\/\S+)(?:\s*[-–—]\s*(.+))?$/);
    if (plainMatch) {
      links.push({ title: plainMatch[1].trim(), url: plainMatch[1].trim(), description: plainMatch[2]?.trim() || null });
    }
  }
  return links;
};

// eslint-disable-next-line react-refresh/only-export-components
export const stripBonusLinks = (content) => {
  if (!content) return content;
  return content.replace(/<bonus_links>[\s\S]*?<\/bonus_links>/gi, '').trim();
};

// ─── Main Component ──────────────────────────────────────────────────────────

const SourcesSection = ({
  content,
  settings = { showSources: true }
}) => {
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [linkWarningAcknowledged, setLinkWarningAcknowledged] = useState(false);

  // Extract data sources from *(from X)* citations
  const sources = useMemo(() => {
    if (!content) return [];
    const sourceRegex = /\*\(from ([^)]+)\)\*/g;
    const foundSources = new Set();
    let match;
    while ((match = sourceRegex.exec(content)) !== null) {
      foundSources.add(match[1]);
    }
    return Array.from(foundSources).map(source => {
      const cleanSource = source.trim();
      const lowerSource = cleanSource.toLowerCase();
      if (lowerSource.includes('task') || lowerSource.includes('kanban') || lowerSource.includes('card'))
        return { name: cleanSource, icon: CheckSquare, color: 'blue' };
      if (lowerSource.includes('project'))
        return { name: cleanSource, icon: Target, color: 'green' };
      if (lowerSource.includes('calendar') || lowerSource.includes('event'))
        return { name: cleanSource, icon: Calendar, color: 'purple' };
      if (lowerSource.includes('note') || lowerSource.includes('document'))
        return { name: cleanSource, icon: FileText, color: 'orange' };
      if (lowerSource.includes('habit') || lowerSource.includes('streak'))
        return { name: cleanSource, icon: RotateCcw, color: 'indigo' };
      if (lowerSource.includes('analytics') || lowerSource.includes('query'))
        return { name: cleanSource, icon: BarChart3, color: 'red' };
      return { name: cleanSource, icon: Database, color: 'gray' };
    });
  }, [content]);

  // Extract bonus links
  const bonusLinks = useMemo(() => parseBonusLinks(content), [content]);

  const hasSources = sources.length > 0;
  const hasLinks = bonusLinks.length > 0;

  if (!settings.showSources) return null;
  if (!hasSources && !hasLinks) return null;

  const iconColorMap = {
    blue: 'text-blue-500 dark:text-blue-400',
    green: 'text-green-500 dark:text-green-400',
    purple: 'text-purple-500 dark:text-purple-400',
    orange: 'text-orange-500 dark:text-orange-400',
    indigo: 'text-indigo-500 dark:text-indigo-400',
    red: 'text-red-500 dark:text-red-400',
    gray: 'text-gray-500 dark:text-gray-400'
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700/60 midnight:border-slate-700/60 bg-gray-50/50 dark:bg-gray-800/20 midnight:bg-slate-800/20 overflow-hidden">

      {/* ── Data Sources row ── */}
      {hasSources && (
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-gray-200/60 dark:border-gray-700/40 midnight:border-slate-700/40">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 shrink-0">
            <Database className="w-3.5 h-3.5" />
            <span>From your data</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((source, i) => {
              const Icon = source.icon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-gray-700/50 midnight:bg-slate-700/50 border border-gray-200 dark:border-gray-600/50 midnight:border-slate-600/50 text-xs text-gray-600 dark:text-gray-300 midnight:text-slate-300"
                >
                  <Icon className={`w-3 h-3 ${iconColorMap[source.color]}`} />
                  {source.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bonus Links row ── */}
      {hasLinks && (
        <div className="px-4 py-3">
          {/* Header toggle */}
          <button
            onClick={() => setLinksExpanded(v => !v)}
            className="w-full flex items-center justify-between group"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              <ExternalLink className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Bonus Links</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 midnight:bg-amber-900/30 text-amber-700 dark:text-amber-300 midnight:text-amber-200 text-xs font-medium">
                {bonusLinks.length}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>External — verify before visiting</span>
              {linksExpanded
                ? <ChevronUp className="w-3.5 h-3.5 ml-1" />
                : <ChevronDown className="w-3.5 h-3.5 ml-1" />
              }
            </div>
          </button>

          {/* Expanded links */}
          {linksExpanded && (
            <div className="mt-3 space-y-1.5">
              {/* One-time safety notice */}
              {!linkWarningAcknowledged && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/15 border border-amber-200 dark:border-amber-700/40 midnight:border-amber-600/30 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-700 dark:text-amber-300 midnight:text-amber-200 leading-relaxed">
                      These links are suggested by The Cat. External sites are not verified by Asyncat — always check the URL and never enter personal info on unfamiliar sites.
                    </p>
                    <button
                      onClick={() => setLinkWarningAcknowledged(true)}
                      className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400 underline hover:no-underline"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              )}

              {bonusLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!linkWarningAcknowledged) {
                      const ok = window.confirm(
                        `⚠️ External link — not verified by Asyncat.\n\n${link.url}\n\nProceed?`
                      );
                      if (!ok) e.preventDefault();
                    }
                  }}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white dark:bg-gray-700/40 midnight:bg-slate-700/40 border border-gray-200/60 dark:border-gray-600/30 midnight:border-slate-600/30 hover:border-amber-300 dark:hover:border-amber-600/50 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all group"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400 dark:text-amber-400 flex-shrink-0 mt-0.5 group-hover:text-amber-500 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-200 midnight:text-slate-200 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors truncate">
                      {link.title}
                    </div>
                    {link.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-0.5 line-clamp-1">
                        {link.description}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}


    </div>
  );
};

export default SourcesSection;
