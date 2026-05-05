
import {
  ArrowUpDown,
  Filter,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import ListViewCard from "./ListViewCard";

const ListViewTable = ({
  sortConfig,
  handleSort,
  sortedFilteredCards,
  expandedCards,
  toggleCardExpanded,
  setSelectedCard,
  profiles,
  assigningCardId,
  onAssignAgent,
  onCancelRun,
  onOpenRun,
}) => {
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="w-4 h-4 ml-1 text-gray-400" />;
    }
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="w-4 h-4 ml-1 text-blue-500" />
    ) : (
      <ChevronDown className="w-4 h-4 ml-1 text-blue-500" />
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 px-6 py-4 h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="min-w-full table-fixed">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
              <th
                scope="col"
                className="w-1/3 px-3 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
                onClick={() => handleSort("title")}
              >
                <div className="flex items-center">
                  Task
                  {getSortIcon("title")}
                </div>
              </th>
              <th
                scope="col"
                className="w-32 px-2 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider"
              >
                <div className="flex items-center justify-center">Agent</div>
              </th>
              <th
                scope="col"
                className="w-28 px-2 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
                onClick={() => handleSort("runStatus")}
              >
                <div className="flex items-center justify-center">
                  Run Status
                  {getSortIcon("runStatus")}
                </div>
              </th>
              <th
                scope="col"
                className="w-48 px-2 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider"
              >
                <div className="flex items-center">Current Activity</div>
              </th>
              <th
                scope="col"
                className="w-24 px-2 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
                onClick={() => handleSort("priority")}
              >
                <div className="flex items-center justify-center">
                  Priority
                  {getSortIcon("priority")}
                </div>
              </th>
              <th
                scope="col"
                className="w-28 px-2 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
                onClick={() => handleSort("dueDate")}
              >
                <div className="flex items-center justify-center">
                  Due Date
                  {getSortIcon("dueDate")}
                </div>
              </th>
              <th
                scope="col"
                className="w-56 px-2 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 uppercase tracking-wider"
              >
                <div className="flex items-center justify-end">Actions</div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 midnight:bg-gray-950">
            {sortedFilteredCards.length > 0 ? (
              sortedFilteredCards.map((card) => (
                <ListViewCard
                  key={card.id}
                  card={card}
                  expandedCards={expandedCards}
                  toggleCardExpanded={toggleCardExpanded}
                  setSelectedCard={setSelectedCard}
                  profiles={profiles}
                  assigningCardId={assigningCardId}
                  onAssignAgent={onAssignAgent}
                  onCancelRun={onCancelRun}
                  onOpenRun={onOpenRun}
                />
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mb-4">
                      <Filter className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-gray-100 mb-1">
                      No tasks found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 max-w-sm">
                      No tasks match your current filters.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ListViewTable;
