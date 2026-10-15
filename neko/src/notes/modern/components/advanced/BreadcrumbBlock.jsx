// A breadcrumb block: a trail of links, the last one being where you are.

import { Navigation } from 'lucide-react';

const BreadcrumbBlock = ({ block }) => {
  const items = block.properties?.items || [
    { label: 'Home', url: '/' },
    { label: 'Documentation', url: '/docs' },
    { label: 'Components', url: '/docs/components' },
    { label: 'Breadcrumb', url: null }
  ];

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-fg">
        <Navigation className="h-4 w-4 text-fg-subtle" />
        Breadcrumb
      </div>
      <nav className="flex" aria-label="Breadcrumb">
        <ol className="inline-flex flex-wrap items-center gap-y-1 text-[13px]">
          {items.map((item, index) => (
            <li key={index} className="inline-flex items-center">
              {index > 0 && (
                <span className="mx-2 text-fg-subtle">/</span>
              )}
              {item.url ? (
                <a
                  href={item.url}
                  className="text-accent hover:underline"
                >
                  {item.label}
                </a>
              ) : (
                <span className="text-fg-muted">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

export default BreadcrumbBlock;
