import { useState, useEffect, useCallback } from "react";
import { useColumnContext } from "../../views/context/ColumnContext";
import { useCardContext } from "../../views/context/CardContext";
import ListViewFilters from "./ListViewFilters";
import ListViewTable from "./ListViewTable";
import AddCardModal from "../kanban/features/cards/AddCardModal";
import viewsApi from "../viewsApi";

const ListView = ({ selectedProject, session }) => {
	const { columns, isLoading, error } = useColumnContext();
	const { setSelectedCard } = useCardContext();
	const [searchTerm, setSearchTerm] = useState("");
	const [sortConfig, setSortConfig] = useState({
		key: "dueDate",
		direction: "asc",
	});
	const [filterConfig, setFilterConfig] = useState({
		priority: [],
		dueStatus: [],
		completed: false,
		hasDependencies: false,
		isBlocked: false,
		hasTimer: false,
	});
	const [cards, setCards] = useState([]);
	const [expandedCards, setExpandedCards] = useState(new Set());
	const [timeEntries, setTimeEntries] = useState({});
	const [activeTimer, setActiveTimer] = useState(null);
	const [cardDependencies, setCardDependencies] = useState({});
	const [dependentCards, setDependentCards] = useState({});
	const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
	const [isLoadingTimeEntries, setIsLoadingTimeEntries] = useState(false);
	const [expandedTimeEntries, setExpandedTimeEntries] = useState(new Set());
	const [showCreateTask, setShowCreateTask] = useState(false);

	// Process cards from all columns
	useEffect(() => {
		if (!columns || !Array.isArray(columns)) return;

		const allCards = columns.reduce((acc, column) => {
			if (column.Cards && Array.isArray(column.Cards)) {
				const cardsWithColumn = column.Cards.map((card) => ({
					...card,
					columnId: column.id,
					columnTitle: column.title,
					isCompletionColumn: column.isCompletionColumn || false,
				}));
				return [...acc, ...cardsWithColumn];
			}
			return acc;
		}, []);

		setCards(allCards);
	}, [columns]);

	// Fetch time entries for all cards
	useEffect(() => {
		const fetchTimeEntries = async () => {
			if (!cards.length || !session?.user?.id) return;

			setIsLoadingTimeEntries(true);
			try {
				// Use the batch API to fetch time entries for all cards
				const cardIds = cards.map((card) => card.id);
				const entriesMap =
					await viewsApi.batch.fetchTimeEntriesForCards(cardIds);
				setTimeEntries(entriesMap);
			} catch (error) {
				console.error("Error fetching time entries:", error);
			} finally {
				setIsLoadingTimeEntries(false);
			}
		};

		fetchTimeEntries();
	}, [cards, session?.user?.id]);

	// Timer control functions
	const handleStartTimer = async (cardId, e) => {
		e.stopPropagation();
		try {
			const timeEntry = await viewsApi.time.startTimer(cardId);
			setActiveTimer(timeEntry);
		} catch (error) {
			console.error("Error starting timer:", error);
		}
	};

	const handleStopTimer = async (cardId, e) => {
		e.stopPropagation();
		try {
			const timeEntry = await viewsApi.time.stopTimer(cardId, "");
			setActiveTimer(null);

			setTimeEntries((prev) => ({
				...prev,
				[cardId]: [timeEntry, ...(prev[cardId] || [])],
			}));
		} catch (error) {
			console.error("Error stopping timer:", error);
		}
	};

	// Toggle expanded state for a card
	const toggleCardExpanded = (cardId, event) => {
		event.stopPropagation();
		setExpandedCards((prevExpanded) => {
			const newExpanded = new Set(prevExpanded);
			if (newExpanded.has(cardId)) {
				newExpanded.delete(cardId);
			} else {
				newExpanded.add(cardId);
			}
			return newExpanded;
		});
	};

	// Toggle time entries expanded state
	const toggleTimeEntriesExpanded = (cardId, event) => {
		event.stopPropagation();
		setExpandedTimeEntries((prev) => {
			const newExpanded = new Set(prev);
			if (newExpanded.has(cardId)) {
				newExpanded.delete(cardId);
			} else {
				newExpanded.add(cardId);
			}
			return newExpanded;
		});
	};

	// Check if a card is blocked by dependencies
	const isCardBlocked = useCallback(
		(card) => {
			if (card.dependencies?.length > 0 && cardDependencies[card.id]) {
				return cardDependencies[card.id].some(
					(dep) => !dep.Column?.isCompletionColumn
				);
			}
			return false;
		},
		[cardDependencies]
	);

	// Get sorted and filtered cards
	const getSortedFilteredCards = useCallback(() => {
		let filteredCards = [...cards];

		// Apply search term
		if (searchTerm) {
			const search = searchTerm.toLowerCase();
			filteredCards = filteredCards.filter(
				(card) =>
					card.title?.toLowerCase().includes(search) ||
					card.description?.toLowerCase().includes(search)
			);
		}

		// Apply completed filter
		if (filterConfig.completed) {
			filteredCards = filteredCards.filter(
				(card) => card.progress === 100 || card.isCompletionColumn
			);
		}

		// Apply priority filter
		if (filterConfig.priority.length > 0) {
			filteredCards = filteredCards.filter((card) =>
				filterConfig.priority.includes(card.priority)
			);
		}

		// Apply due status filter
		if (filterConfig.dueStatus.length > 0) {
			filteredCards = filteredCards.filter((card) => {
				const status = getDueStatus(card.dueDate);
				return filterConfig.dueStatus.includes(status);
			});
		}

		// Apply dependencies filter
		if (filterConfig.hasDependencies) {
			filteredCards = filteredCards.filter(
				(card) =>
					(card.dependencies && card.dependencies.length > 0) ||
					(dependentCards[card.id] &&
						dependentCards[card.id].length > 0)
			);
		}

		// Apply blocked filter
		if (filterConfig.isBlocked) {
			filteredCards = filteredCards.filter((card) => isCardBlocked(card));
		}

		// Apply active timer filter
		if (filterConfig.hasTimer) {
			filteredCards = filteredCards.filter(
				(card) => activeTimer && activeTimer.cardId === card.id
			);
		}

		// Apply sorting
		filteredCards.sort((a, b) => {
			const { key, direction } = sortConfig;
			let valueA, valueB;

			switch (key) {
				case "title":
				case "description":
					valueA = a[key]?.toLowerCase() || "";
					valueB = b[key]?.toLowerCase() || "";
					break;
				case "dueDate":
					valueA = a[key] ? new Date(a[key]).getTime() : Infinity;
					valueB = b[key] ? new Date(b[key]).getTime() : Infinity;
					break;
				case "progress":
					valueA = a[key] || 0;
					valueB = b[key] || 0;
					break;
				case "priority":
					const priorityValue = { High: 3, Medium: 2, Low: 1 };
					valueA = priorityValue[a[key]] || 0;
					valueB = priorityValue[b[key]] || 0;
					break;
				case "timeSpent":
					valueA = a[key] || 0;
					valueB = b[key] || 0;
					break;
				case "duration":
					valueA = a[key] ?? Infinity;
					valueB = b[key] ?? Infinity;
					break;
				default:
					valueA = a[key] || "";
					valueB = b[key] || "";
			}

			if (valueA < valueB) return direction === "asc" ? -1 : 1;
			if (valueA > valueB) return direction === "asc" ? 1 : -1;
			return 0;
		});

		return filteredCards;
	}, [
		cards,
		searchTerm,
		filterConfig,
		activeTimer,
		dependentCards,
		sortConfig,
		isCardBlocked,
	]);

	// Calculate due status for filtering
	const getDueStatus = (dueDate) => {
		if (!dueDate) return "none";

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const due = new Date(dueDate);
		due.setHours(0, 0, 0, 0);

		if (due < today) return "overdue";
		if (due.getTime() === today.getTime()) return "today";

		const nextWeek = new Date(today);
		nextWeek.setDate(today.getDate() + 7);

		if (due <= nextWeek) return "thisWeek";

		return "later";
	};

	// Sort handler
	const handleSort = (key) => {
		const direction =
			sortConfig.key === key && sortConfig.direction === "asc"
				? "desc"
				: "asc";
		setSortConfig({ key, direction });
	};

	// Filter toggle functions
	const toggleCompletedFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			completed: !prev.completed,
		}));
	};

	const toggleDependenciesFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			hasDependencies: !prev.hasDependencies,
		}));
	};

	const toggleBlockedFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			isBlocked: !prev.isBlocked,
		}));
	};

	const toggleTimerFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			hasTimer: !prev.hasTimer,
		}));
	};

	const togglePriorityFilter = (priority) => {
		setFilterConfig((prev) => {
			if (prev.priority.includes(priority)) {
				return {
					...prev,
					priority: prev.priority.filter((p) => p !== priority),
				};
			} else {
				return {
					...prev,
					priority: [...prev.priority, priority],
				};
			}
		});
	};

	const toggleDueStatusFilter = (status) => {
		setFilterConfig((prev) => {
			if (prev.dueStatus.includes(status)) {
				return {
					...prev,
					dueStatus: prev.dueStatus.filter((s) => s !== status),
				};
			} else {
				return {
					...prev,
					dueStatus: [...prev.dueStatus, status],
				};
			}
		});
	};

	const clearFilters = () => {
		setFilterConfig({
			priority: [],
			dueStatus: [],
			completed: false,
			hasDependencies: false,
			isBlocked: false,
			hasTimer: false,
		});
	};

	if (error) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="text-center p-8 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-xl">
					<div className="text-red-500 mb-4">
						<svg
							className="w-12 h-12 mx-auto"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
						Error Loading Tasks
					</h3>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						{error}
					</p>
				</div>
			</div>
		);
	}

	if (!selectedProject?.id) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="text-center p-8 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-xl">
					<div className="text-gray-400 dark:text-gray-500 midnight:text-gray-600 mb-4">
						<svg
							className="w-16 h-16 mx-auto"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
							/>
						</svg>
					</div>
					<h2 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
						No Project Selected
					</h2>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						Please select a project to view its tasks.
					</p>
				</div>
			</div>
		);
	}

	const sortedFilteredCards = getSortedFilteredCards();

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-md transition-all duration-200">
			<ListViewFilters
				searchTerm={searchTerm}
				setSearchTerm={setSearchTerm}
				filterConfig={filterConfig}
				toggleCompletedFilter={toggleCompletedFilter}
				toggleDependenciesFilter={toggleDependenciesFilter}
				toggleBlockedFilter={toggleBlockedFilter}
				toggleTimerFilter={toggleTimerFilter}
				togglePriorityFilter={togglePriorityFilter}
				toggleDueStatusFilter={toggleDueStatusFilter}
				onClearFilters={clearFilters}
				onCreateTask={() => setShowCreateTask(true)}
				searchContext={{
					isSearchActive: !!searchTerm,
					totalResults: searchTerm
						? getSortedFilteredCards().length
						: 0,
				}}
			/>
			<div className="flex-1 min-h-0 flex flex-col">
				<div className="flex-1 min-h-0 overflow-y-auto">
					<ListViewTable
						sortConfig={sortConfig}
						handleSort={handleSort}
						sortedFilteredCards={sortedFilteredCards}
						expandedCards={expandedCards}
						toggleCardExpanded={toggleCardExpanded}
						expandedTimeEntries={expandedTimeEntries}
						toggleTimeEntriesExpanded={toggleTimeEntriesExpanded}
						setSelectedCard={setSelectedCard}
						activeTimer={activeTimer}
						timeEntries={timeEntries}
						cardDependencies={cardDependencies}
						dependentCards={dependentCards}
						handleStartTimer={handleStartTimer}
						handleStopTimer={handleStopTimer}
						session={session}
						isCardBlocked={isCardBlocked}
						columns={columns}
					/>
				</div>
			</div>
			{showCreateTask && (
				<AddCardModal
					onClose={() => setShowCreateTask(false)}
					onSuccess={() => setShowCreateTask(false)}
				/>
			)}
		</div>
	);
};

export default ListView;
