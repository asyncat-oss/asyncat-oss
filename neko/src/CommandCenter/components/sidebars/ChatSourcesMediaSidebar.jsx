// Side panel → Sources & media: the pictures and web pages the chat's
// answers used, each opening in the browser.

import { useState, useEffect } from 'react';
import { Image, Link2, ExternalLink } from 'lucide-react';
import { useUiPreferences } from '../../../contexts/UiPreferencesContext.jsx';
import { openWebLink } from '../../../utils/openWebLink.js';
import { Segmented } from '../../../components/ui/Tabs.jsx';

export default function ChatSourcesMediaSidebar({ catalog }) {
  const { workbenchPreferences } = useUiPreferences();
  const [tab, setTab] = useState(catalog.imageCount > 0 ? 'images' : 'sources');
  const hasImages = catalog.imageCount > 0;
  const hasSources = catalog.sourceCount > 0;

  useEffect(() => {
    if (tab === 'images' && !hasImages && hasSources) setTab('sources');
    if (tab === 'sources' && !hasSources && hasImages) setTab('images');
  }, [tab, hasImages, hasSources]);

  // A kind with nothing in it is left out rather than shown as an empty
  // choice; with one kind left, a plain label names it.
  const kinds = [
    hasImages && { value: 'images', label: 'Images', icon: Image, meta: String(catalog.imageCount) },
    hasSources && { value: 'sources', label: 'Sources', icon: Link2, meta: String(catalog.sourceCount) },
  ].filter(Boolean);
  const only = kinds.length === 1 ? kinds[0] : null;

  return (
    <div className="flex h-full flex-col">
      {kinds.length > 1 && (
        <div className="border-b border-line px-3 py-2">
          <Segmented
            size="sm"
            label="Sources and media"
            value={tab}
            onChange={setTab}
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
            items={kinds}
          />
        </div>
      )}
      {only && (
        <div className="flex h-11 items-center gap-1.5 border-b border-line px-3 text-[12px] font-medium text-fg-muted">
          <only.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          {only.label}
          <span className="tabular-nums text-fg-subtle">{only.meta}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'images' && (
          <div className="grid grid-cols-2 gap-2">
            {catalog.images.map((img, i) => (
              <button
                type="button"
                key={`${img.image || img.thumbnail || img.url}-${i}`}
                onClick={() => openWebLink(img.url || img.image, workbenchPreferences.browserOpenLinks)}
                className="group overflow-hidden rounded-lg border border-line bg-canvas text-left outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/40"
                title={img.title}
              >
                <div className="relative aspect-square bg-hover">
                  <img
                    src={img.thumbnail || img.image}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <ExternalLink className="absolute right-1.5 top-1.5 h-4 w-4 rounded bg-canvas/90 p-0.5 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </div>
                <div className="min-w-0 px-2 py-1.5">
                  <p className="truncate text-[12px] font-medium text-fg">{img.title}</p>
                  <p className="truncate text-[11px] text-fg-subtle">{img.answerLabel}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'sources' && (
          <div className="space-y-1.5">
            {catalog.sources.map((source, i) => (
              <button
                type="button"
                key={`${source.url}-${i}`}
                onClick={() => openWebLink(source.url, workbenchPreferences.browserOpenLinks)}
                className="block w-full rounded-lg border border-line p-3 text-left outline-none transition-colors hover:border-line-strong hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${source.domain}.ico`}
                    alt=""
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{source.title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{source.domain}</p>
                    {source.snippet && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-fg-muted">
                        {source.snippet}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-fg-subtle">{source.answerLabel}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-fg-subtle" />
                </div>
              </button>
            ))}
          </div>
        )}

        {catalog.totalCount === 0 && (
          <p className="px-1 py-5 text-[12px] text-fg-subtle">
            No sources or images in this chat yet.
          </p>
        )}
      </div>
    </div>
  );
}
