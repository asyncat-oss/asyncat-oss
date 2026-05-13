import { useState, useEffect } from 'react';
import { Image, Link2, ExternalLink } from 'lucide-react';

export default function ChatSourcesMediaSidebar({ catalog }) {
  const [tab, setTab] = useState(catalog.imageCount > 0 ? 'images' : 'sources');
  const hasImages = catalog.imageCount > 0;
  const hasSources = catalog.sourceCount > 0;

  useEffect(() => {
    if (tab === 'images' && !hasImages && hasSources) setTab('sources');
    if (tab === 'sources' && !hasSources && hasImages) setTab('images');
  }, [tab, hasImages, hasSources]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700 midnight:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            Sources & media
          </span>
          <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">{catalog.totalCount}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800 midnight:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('images')}
            disabled={!hasImages}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              tab === 'images'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            <Image className="h-3.5 w-3.5" />
            {catalog.imageCount}
          </button>
          <button
            type="button"
            onClick={() => setTab('sources')}
            disabled={!hasSources}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              tab === 'sources'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            {catalog.sourceCount}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'images' && (
          <div className="grid grid-cols-2 gap-2">
            {catalog.images.map((img, i) => (
              <a
                key={`${img.image || img.thumbnail || img.url}-${i}`}
                href={img.url || img.image}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700"
                title={img.title}
              >
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                  <img
                    src={img.thumbnail || img.image}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <ExternalLink className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded bg-white/90 p-0.5 text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:bg-gray-900/90 dark:text-gray-200" />
                </div>
                <div className="min-w-0 px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">{img.title}</p>
                  <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">{img.answerLabel}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {tab === 'sources' && (
          <div className="space-y-2">
            {catalog.sources.map((source, i) => (
              <a
                key={`${source.url}-${i}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <img
                    src={`https://icons.duckduckgo.com/ip3/${source.domain}.ico`}
                    alt=""
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{source.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-blue-600 dark:text-blue-400">{source.domain}</p>
                    {source.snippet && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        {source.snippet}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{source.answerLabel}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                </div>
              </a>
            ))}
          </div>
        )}

        {catalog.totalCount === 0 && (
          <p className="px-1 py-5 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            No sources or images in this chat yet.
          </p>
        )}
      </div>
    </div>
  );
}
