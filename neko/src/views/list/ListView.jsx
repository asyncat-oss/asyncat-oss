import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useColumnContext } from "../../views/context/viewContexts";
import { useCardContext } from "../../views/context/viewContexts";
import ListViewFilters from "./ListViewFilters";
import ListViewTable from "./ListViewTable";
import AddCardModal from "../kanban/features/cards/AddCardModal";
import { agentTaskRunsApi, profilesApi } from "../../CommandCenter/commandCenterApi";

const ListView = ({ selectedProject }) => {
	const navigate = useNavigate();
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
		running: false,
	});
	const [cards, setCards] = useState([]);
	const [expandedCards, setExpandedCards] = useState(new Set());
	const [showCreateTask, setShowCreateTask] = useState(false);
	const [agentRunsByCard, setAgentRunsByCard] = useState({});
	const [agentProfiles, setAgentProfiles] = useState([]);
	const [assigningCardId, setAssigningCardId] = useState(null);

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
					agentRun: agentRunsByCard[card.id] || null,
				}));
				return [...acc, ...cardsWithColumn];
			}
			return acc;
		}, []);

		setCards(allCards);
	}, [columns, agentRunsByCard]);

	const loadAgentTaskRuns = useCallback(async () => {
		if (!selectedProject?.id) return;
		try {
			const result = await agentTaskRunsApi.list({
				projectId: selectedProject.id,
			});
			const next = {};
			for (const task of result.tasks || []) {
				if (task.agentRun) next[task.id] = task.agentRun;
			}
			setAgentRunsByCard(next);
		} catch (error) {
			console.error("Error loading agent task runs:", error);
		}
	}, [selectedProject?.id]);

	useEffect(() => {
		profilesApi
			.listProfiles()
			.then((result) => setAgentProfiles(result.profiles || []))
			.catch((error) => console.error("Error loading agent profiles:", error));
	}, []);

	useEffect(() => {
		loadAgentTaskRuns();
	}, [loadAgentTaskRuns]);

	useEffect(() => {
		const hasActiveRuns = Object.values(agentRunsByCard).some((run) =>
			["queued", "running"].includes(run?.status)
		);
		if (!hasActiveRuns) return;
		const timer = setInterval(loadAgentTaskRuns, 3000);
		return () => clearInterval(timer);
	}, [agentRunsByCard, loadAgentTaskRuns]);

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

		// Apply running filter
		if (filterConfig.running) {
			filteredCards = filteredCards.filter((card) =>
				["queued", "running"].includes(card.agentRun?.status)
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
				case "runStatus":
					valueA = a.agentRun?.status || "unassigned";
					valueB = b.agentRun?.status || "unassigned";
					break;
				case "priority":
					const priorityValue = { High: 3, Medium: 2, Low: 1 };
					valueA = priorityValue[a[key]] || 0;
					valueB = priorityValue[b[key]] || 0;
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
		sortConfig,
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
	const toggleRunningFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			running: !prev.running,
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
			running: false,
		});
	};

	const handleAssignAgent = async (card, profileId) => {
		if (!card?.id || !profileId) return;
		setAssigningCardId(card.id);
		try {
			const result = await agentTaskRunsApi.create({
				cardId: card.id,
				profileId,
			});
			if (result.run) {
				setAgentRunsByCard((prev) => ({ ...prev, [card.id]: result.run }));
			}
			await loadAgentTaskRuns();
		} catch (error) {
			console.error("Error assigning agent:", error);
		} finally {
			setAssigningCardId(null);
		}
	};

	const handleCancelRun = async (run) => {
		if (!run?.id) return;
		try {
			const result = await agentTaskRunsApi.cancel(run.id);
			if (result.run) {
				setAgentRunsByCard((prev) => ({
					...prev,
					[result.run.cardId]: result.run,
				}));
			}
		} catch (error) {
			console.error("Error cancelling agent run:", error);
		}
	};

	const handleOpenRun = (run) => {
		if (run?.sessionId) navigate(`/agents/${run.sessionId}`);
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
				toggleRunningFilter={toggleRunningFilter}
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
						setSelectedCard={setSelectedCard}
						profiles={agentProfiles}
						assigningCardId={assigningCardId}
						onAssignAgent={handleAssignAgent}
						onCancelRun={handleCancelRun}
						onOpenRun={handleOpenRun}
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
