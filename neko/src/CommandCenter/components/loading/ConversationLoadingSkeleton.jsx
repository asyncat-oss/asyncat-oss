export default function ConversationLoadingSkeleton() {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex-shrink-0hite dark:bg-gray-900 midnight:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-48"></div>
            <div className="flex items-center gap-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-16"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-8">
          <div className="group mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-12 animate-pulse"></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-4">
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          </div>

          <div className="group mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-16 animate-pulse"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce bg-gray-400"></div>
                <div
                  className="w-2 h-2 rounded-full animate-bounce bg-gray-400"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full animate-bounce bg-gray-400"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-4">
              <div className="space-y-3">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-4/5 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-5/6 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
