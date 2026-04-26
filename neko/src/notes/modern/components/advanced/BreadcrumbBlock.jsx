import { Navigation } from 'lucide-react';

const BreadcrumbBlock = ({ block }) => {
  const items = block.properties?.items || [
    { label: 'Home', url: '/' },
    { label: 'Documentation', url: '/docs' },
    { label: 'Components', url: '/docs/components' },
    { label: 'Breadcrumb', url: null }
  ];

  return (
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900">
      <div className="flex items-center gap-2 mb-3">
        <Navigation className="w-4 h-4" />
        <span className="font-medium">Breadcrumb Navigation</span>
      </div>
      <nav className="flex" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-1">
          {items.map((item, index) => (
            <li key={index} className="inline-flex items-center">
              {index > 0 && (
                <span className="mx-2 text-gray-400 dark:text-gray-500 midnight:text-gray-600">/</span>
              )}
              {item.url ? (
                <a
                  href={item.url}
                  className="text-blue-600 dark:text-blue-400 midnight:text-blue-300 hover:text-blue-800 dark:hover:text-blue-300 midnight:hover:text-blue-200"
                >
                  {item.label}
                </a>
              ) : (
                <span className="text-gray-500 dark:text-gray-400 midnight:text-gray-500">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

export default BreadcrumbBlock;
