
import { Search, Calendar, AlertCircle, X, ZoomIn, ZoomOut, Maximize2, Siren, Disc3Icon, LifeBuoy } from "lucide-react";

const KanbanFilters = ({
  searchTerm,
  setSearchTerm,
  searchResults,
  suggestions,
  isSearching,
  navigateToResult,
  handleSuggestionClick,
  clearSearch,
  isSearchFocused,
  setIsSearchFocused,
  showResults,
  setShowResults,
  searchContainerRef,
  handleSearchInput,
  handleSearchFocus,
  handleSearchBlur,
  handleKeyDown,
  activeFilters,
  togglePriorityFilter,
  toggleDueDateFilter,
  onClearFilters,
  searchContext = { isSearchActive: false, totalResults: 0 },
  // Zoom props
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  // Check if any filters are active
  const hasActiveFilters =
    activeFilters &&
    ((activeFilters.priority && activeFilters.priority.length > 0) ||
      (activeFilters.dueDates && activeFilters.dueDates.length > 0));

  // Count total active filters
  const activeFilterCount =
    (activeFilters?.priority?.length || 0) +
    (activeFilters?.dueDates?.length || 0);

  return (
    <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60">
      <div className="px-6 py-4">
        {/* Main Controls Row */}
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Search and Filters */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Enhanced Search */}
            <div className="relative group" ref={searchContainerRef}>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className={`h-4 w-4 transition-colors ${
                  isSearchFocused
                    ? "text-blue-500 dark:text-blue-400 midnight:text-indigo-500"
                    : "text-gray-400 dark:text-gray-500 midnight:text-gray-600"
                } group-focus-within:text-indigo-500`} />
              </div>
              <input
                type="text"
                className={`block w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl transition-all duration-300 min-w-[280px] sm:min-w-[350px] ${
                  isSearchFocused
                    ? "bg-white dark:bg-gray-800 midnight:bg-gray-900 border-indigo-500/60 ring-2 ring-indigo-500/20 shadow-sm"
                    : "bg-white/70 dark:bg-gray-800/70 midnight:bg-gray-900/70 border-gray-200/60 dark:border-gray-600/60 midnight:border-gray-700/60"
                } text-gray-900 dark:text-gray-100 midnight:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:outline-none`}
                placeholder="Search cards and columns..."
                value={searchTerm}
                onChange={handleSearchInput}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                onKeyDown={handleKeyDown}
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Search Results Dropdown */}
              {showResults && (searchTerm || isSearchFocused) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 max-h-80 overflow-auto">
                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-1">
                        Suggestions
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className={`px-2 py-1 text-xs rounded-md flex items-center gap-1 ${
                              suggestion.type === "card"
                                ? "bg-blue-100 dark:bg-blue-900/20 midnight:bg-indigo-900/20 text-blue-800 dark:text-blue-300 midnight:text-indigo-300"
                                : "bg-purple-100 dark:bg-purple-900/20 midnight:bg-purple-900/20 text-purple-800 dark:text-purple-300 midnight:text-purple-300"
                            } hover:bg-opacity-80 transition-colors`}
                          >
                            {suggestion.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  <div className="p-2">
                    {isSearching && searchResults.length === 0 && searchTerm && (
                      <div className="flex items-center justify-center p-4 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                        Searching...
                      </div>
                    )}

                    {!isSearching && searchResults.length === 0 && searchTerm && (
                      <div className="flex items-center justify-center p-4 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                        No results found
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-1">
                          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                        </div>
                        <div className="space-y-1">
                          {searchResults.map((result, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                navigateToResult(result);
                                setShowResults(false);
                              }}
                              className="w-full px-2 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-left"
                            >
                              <div className="text-sm font-medium text-gray-800 dark:text-white midnight:text-indigo-200">
                                {result.type === "card" ? result.card.title : result.column.title}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Search Results Indicator */}
            {searchContext.isSearchActive && searchContext.totalResults > 0 && (
              <div className="flex items-center">
                <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-600 midnight:border-blue-700 rounded-lg text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    {searchContext.totalResults} found
                  </span>
                </div>
              </div>
            )}

            {/* Enhanced Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 align-middle">
              {/* Priority Filters */}
              <div className="flex items-center gap-1">
                {["High", "Medium", "Low"].map((priority) => {
                  const getPriorityIcon = () => {
                    switch (priority) {
                      case "High":
                        return <Siren className="w-3 h-3" />;
                      case "Medium":
                        return <Disc3Icon className="w-3 h-3" />;
                      case "Low":
                        return <LifeBuoy className="w-3 h-3" />;
                      default:
                        return <AlertCircle className="w-3 h-3" />;
                    }
                  };

                  return (
                    <button
                      key={priority}
                      onClick={() => togglePriorityFilter(priority)}
                      className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
                        activeFilters?.priority?.includes(priority)
                          ? priority === "High"
                            ? "bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-600 midnight:border-red-700"
                            : priority === "Medium"
                            ? "bg-amber-50 dark:bg-amber-900/30 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border-amber-200 dark:border-amber-600 midnight:border-amber-700"
                            : "bg-emerald-50 dark:bg-emerald-900/30 midnight:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border-emerald-200 dark:border-emerald-600 midnight:border-emerald-700"
                          : "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {getPriorityIcon()}
                        {priority}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Due Date Filters */}
              <div className="flex items-center gap-1">
                {[
                  { key: "overdue", label: "Overdue", color: "red" },
                  { key: "today", label: "Today", color: "amber" },
                  { key: "thisWeek", label: "This Week", color: "blue" },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => toggleDueDateFilter(key)}
                    className={`px-3 py-2 text-xs font-medium border rounded-lg transition-all duration-200 whitespace-nowrap ${
                      activeFilters?.dueDates?.includes(key)
                        ? color === "red"
                          ? "bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-600 midnight:border-red-700"
                          : color === "amber"
                          ? "bg-amber-50 dark:bg-amber-900/30 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border-amber-200 dark:border-amber-600 midnight:border-amber-700"
                          : "bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border-blue-200 dark:border-blue-600 midnight:border-blue-700"
                        : "bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{label.split(" ")[0]}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={onClearFilters}
                  className="px-3 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 transition-all duration-200"
                  title="Clear all filters"
                >
                  <div className="flex items-center gap-1">
                    <X className="w-3 h-3" />
                    Clear ({activeFilterCount})
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Right side - Zoom Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-0.5 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-900 rounded-lg px-1.5 py-1">
              <button
                onClick={onZoomOut}
                className="p-1 hover:bg-white dark:hover:bg-gray-600 midnight:hover:bg-gray-800 hover:shadow-sm rounded-md transition-all duration-200 active:scale-95"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300 midnight:text-indigo-200 min-w-[40px] text-center font-medium">
                {zoomLevel}%
              </span>
              <button
                onClick={onZoomIn}
                className="p-1 hover:bg-white dark:hover:bg-gray-600 midnight:hover:bg-gray-800 hover:shadow-sm rounded-md transition-all duration-200 active:scale-95"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-800 mx-0.5" />
              <button
                onClick={onResetZoom}
                className="p-1 hover:bg-white dark:hover:bg-gray-600 midnight:hover:bg-gray-800 hover:shadow-sm rounded-md transition-all duration-200 active:scale-95"
                title="Reset Zoom"
              >
                <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KanbanFilters;
