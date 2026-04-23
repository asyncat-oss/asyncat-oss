import { useState, useEffect, useRef, useCallback } from "react";
import { useColumnContext } from "../context/ColumnContext";
import { useCardContext } from "../context/CardContext";
import viewsApi from "../viewsApi";

// Import components
import TimelineFilters from "./TimelineFilters";
import TimelineNavigation from "./TimelineNavigation";
import TimelineContent from "./TimelineContent";

// Import AddCardModal
import AddCardModal from "../kanban/features/cards/AddCardModal";

// Import utility functions
import {
	generateTimelineDates,
	getDueStatus,
	getStatusColor,
	getProgressColor,
	addDays,
	getWeekStart,
	getMonthStart,
	getQuarterStart,
	getQuarterInfo,
} from "./timelineUtils";

// Import Lucide icons
import {
	CheckCircle,
	Clock,
	AlertCircle,
	Calendar,
	ChevronDown,
	X,
	Search,
} from "lucide-react";


const TimelineView = ({ selectedProject, session }) => {
	const { columns, isLoading, error } = useColumnContext();
	const { setSelectedCard } = useCardContext();

	const timelineRef = useRef(null);
	const timelineContainerRef = useRef(null);

	// State for cards and timeline settings
	const [cards, setCards] = useState([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [filteredCards, setFilteredCards] = useState([]);
	const [isFiltering, setIsFiltering] = useState(false);

	// Timeline specific state - Initialize with proper period start
	const [viewMode, setViewMode] = useState("week"); // "week", "month", "quarter"
	const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
	const [visibleDateRange, setVisibleDateRange] = useState({
		start: null,
		end: null,
	});
	const [groupBy, setGroupBy] = useState("status"); // "status", "priority", "completion", "timeTracking"
	const [containerWidth, setContainerWidth] = useState(0);

	// Time tracking state
	const [timeEntries, setTimeEntries] = useState({});
	const [isLoadingTimeEntries, setIsLoadingTimeEntries] = useState(false);

	// Filter settings
	const [activeFilters, setActiveFilters] = useState({
		priority: [],
		status: [],
		timeRange: "all",
		completed: false,
	});

	// Enhanced Search overlay state - exactly like GanttView
	const [searchOverlay, setSearchOverlay] = useState({
		isVisible: false,
		isCollapsed: false,
		results: [],
		resultsByPeriod: new Map(),
		totalResults: 0,
		highlightedTaskId: null,
	});

	// Modal state for Create Task functionality
	const [showCreateTask, setShowCreateTask] = useState(false);

	// Helper function to get period key for search grouping
	const getPeriodKey = useCallback((date, viewType) => {
		if (viewType === "week") {
			const weekStart = getWeekStart(date);
			return `week-${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
		} else if (viewType === "quarter") {
			const quarterStart = getQuarterStart(date);
			const { quarter, year } = getQuarterInfo(date);
			return `quarter-${year}-${quarter}`;
		} else {
			const monthStart = getMonthStart(date);
			return `month-${monthStart.getFullYear()}-${monthStart.getMonth()}`;
		}
	}, []);

	// Helper function to format period name
	const formatPeriodName = (periodKey, viewType) => {
		const parts = periodKey.split("-");
		const year = parseInt(parts[1]);

		if (viewType === "week") {
			const month = parseInt(parts[2]);
			const day = parseInt(parts[3]);
			const date = new Date(year, month, day);
			const endDate = addDays(date, 6);
			return `${date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})} - ${endDate.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})}`;
		} else if (viewType === "quarter") {
			const quarter = parseInt(parts[2]);
			return `Q${quarter} ${year}`;
		} else {
			const month = parseInt(parts[2]);
			const date = new Date(year, month, 1);
			return date.toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			});
		}
	};

	// Get all cards from columns
	useEffect(() => {
		if (!columns || !Array.isArray(columns)) return;

		// Flatten all cards from all columns
		const allCards = columns.reduce((acc, column) => {
			if (column.Cards && Array.isArray(column.Cards)) {
				const cardsWithColumn = column.Cards.map((card) => ({
					...card,
					columnTitle: column.title,
					isCompletionColumn: column.isCompletionColumn || false,
				}));
				return [...acc, ...cardsWithColumn];
			}
			return acc;
		}, []);

		// Process cards with proper date handling - only include cards with valid dates
		const cardsWithValidDates = allCards.filter((card) => {
			return card.startDate && (card.endDate || card.dueDate);
		});

		const processedCards = cardsWithValidDates.map((card) => {
			const processedStartDate = new Date(card.startDate);
			processedStartDate.setHours(0, 0, 0, 0);

			let processedEndDate;
			if (card.endDate) {
				processedEndDate = new Date(card.endDate);
			} else if (card.dueDate) {
				processedEndDate = new Date(card.dueDate);
			} else {
				processedEndDate = new Date(processedStartDate);
			}
			processedEndDate.setHours(23, 59, 59, 999);

			// Ensure end date is not before start date
			if (processedEndDate < processedStartDate) {
				processedEndDate = new Date(processedStartDate);
				processedEndDate.setHours(23, 59, 59, 999);
			}

			return {
				...card,
				originalStartDate: card.startDate,
				originalEndDate: card.endDate,
				originalDueDate: card.dueDate,
				startDate: processedStartDate,
				endDate: processedEndDate,
				dueDate: card.dueDate
					? new Date(card.dueDate)
					: processedEndDate,
			};
		});

		// Sort cards by start date
		const sortedCards = processedCards.sort(
			(a, b) => a.startDate - b.startDate
		);
		setCards(sortedCards);
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
			await viewsApi.time.startTimer(cardId);

			// Refresh time entries after starting timer
			const entries = await viewsApi.time.getTimeEntries(cardId);
			setTimeEntries((prev) => ({
				...prev,
				[cardId]: entries,
			}));
		} catch (error) {
			console.error("Error starting timer:", error);
		}
	};

	const handleStopTimer = async (cardId, e) => {
		e.stopPropagation();
		try {
			const timeEntry = await viewsApi.time.stopTimer(cardId, "");

			// Update time entries for this card
			setTimeEntries((prev) => ({
				...prev,
				[cardId]: [timeEntry, ...(prev[cardId] || [])],
			}));
		} catch (error) {
			console.error("Error stopping timer:", error);
		}
	};

	// Get active timer from time entries
	const activeTimer = Object.keys(timeEntries).reduce((timer, cardId) => {
		const entries = timeEntries[cardId];
		if (entries && entries.length > 0) {
			const activeEntry = entries.find((entry) => !entry.endTime);
			if (activeEntry) {
				return { cardId, entry: activeEntry };
			}
		}
		return timer;
	}, null);

	// Initialize current period on component mount
	useEffect(() => {
		const today = new Date();
		if (viewMode === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (viewMode === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	}, [viewMode]);

	// Helper function to calculate date range based on view mode and current period start
	const calculateDateRange = useCallback((currentPeriodStart, viewType) => {
		if (!currentPeriodStart) return { start: null, end: null };

		let start = new Date(currentPeriodStart);
		let end = new Date(currentPeriodStart);

		switch (viewType) {
			case "week":
				// Show exactly 7 days starting from Monday
				start = getWeekStart(currentPeriodStart);
				end = addDays(start, 6);
				end.setHours(23, 59, 59, 999);
				break;
			case "month":
				// Show exactly the current month
				start = getMonthStart(currentPeriodStart);
				end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // Last day of month
				end.setHours(23, 59, 59, 999);
				break;
			case "quarter":
				// Show exactly 3 months of the quarter
				start = getQuarterStart(currentPeriodStart);
				end = new Date(start);
				end.setMonth(start.getMonth() + 3);
				end.setDate(end.getDate() - 1); // Last day of quarter
				end.setHours(23, 59, 59, 999);
				break;
			default:
				break;
		}

		return { start, end };
	}, []);

	// Calculate visible date range based on view mode and current period start
	useEffect(() => {
		if (!currentPeriodStart) return;
		const range = calculateDateRange(currentPeriodStart, viewMode);
		setVisibleDateRange(range);
	}, [viewMode, currentPeriodStart, calculateDateRange]);

	// Observe timeline container width for dynamic sizing
	useEffect(() => {
		const observeWidth = () => {
			if (timelineContainerRef.current) {
				const { width } =
					timelineContainerRef.current.getBoundingClientRect();
				if (width > 0) {
					setContainerWidth(width - 320); // Subtract left panel width
				}
			}
		};

		const timeoutId = setTimeout(observeWidth, 100);
		const resizeObserver = new ResizeObserver(observeWidth);

		if (timelineContainerRef.current) {
			resizeObserver.observe(timelineContainerRef.current);
		}

		window.addEventListener("resize", observeWidth);

		return () => {
			clearTimeout(timeoutId);
			resizeObserver.disconnect();
			window.removeEventListener("resize", observeWidth);
		};
	}, [viewMode, visibleDateRange]);

	// Enhanced search function - handles search overlay (exact Gantt implementation)
	const performSearch = useCallback(
		(searchTerm, cards) => {
			if (!searchTerm.trim()) {
				setSearchOverlay({
					isVisible: false,
					isCollapsed: false,
					results: [],
					resultsByPeriod: new Map(),
					totalResults: 0,
					highlightedTaskId: null,
				});
				return;
			}

			const search = searchTerm.toLowerCase();
			const results = cards.filter((card) => {
				const searchableFields = [
					card.title?.toLowerCase() || "",
					card.description?.toLowerCase() || "",
					card.columnTitle?.toLowerCase() || "",
					card.priority?.toLowerCase() || "",
				];

				return searchableFields.some((field) => field.includes(search));
			});

			// Group results by time period
			const resultsByPeriod = new Map();
			results.forEach((card) => {
				const periodKey = getPeriodKey(card.startDate, viewMode);
				if (!resultsByPeriod.has(periodKey)) {
					resultsByPeriod.set(periodKey, []);
				}
				resultsByPeriod.get(periodKey).push(card);
			});

			// Sort periods chronologically
			const sortedPeriods = Array.from(resultsByPeriod.keys()).sort();
			const sortedResultsByPeriod = new Map();
			sortedPeriods.forEach((period) => {
				sortedResultsByPeriod.set(period, resultsByPeriod.get(period));
			});

			setSearchOverlay({
				isVisible: true,
				isCollapsed: false,
				results,
				resultsByPeriod: sortedResultsByPeriod,
				totalResults: results.length,
				highlightedTaskId: null,
			});
		},
		[viewMode, getPeriodKey]
	);

	// Update search when search term, cards, or view changes
	useEffect(() => {
		performSearch(searchTerm, cards);
	}, [searchTerm, cards, performSearch]);

	// Enhanced function to handle scrolling to task position - exactly like GanttView
	const scrollToTask = useCallback(
		(card, groupIndex = 0, cardIndex = 0) => {
			if (!timelineRef.current) return;

			// Calculate vertical position based on group and card position
			const groupHeaderHeight = 80; // Height of each group header
			const cardHeight = 60; // Height of each card row

			// Calculate the target row within the group
			const groupOffset = groupIndex * groupHeaderHeight;
			const cardOffset = cardIndex * cardHeight;
			const targetY = groupOffset + cardOffset;

			// Calculate horizontal position (timeline position)
			let targetX = 0;

			if (visibleDateRange.start && card.startDate) {
				const taskStartDate = new Date(card.startDate);
				const rangeStartDate = new Date(visibleDateRange.start);

				// Calculate days from range start to task start
				const daysDiff = Math.floor(
					(taskStartDate - rangeStartDate) / (1000 * 60 * 60 * 24)
				);

				if (daysDiff >= 0) {
					// Task is within or after the visible range
					if (containerWidth > 0) {
						// Calculate based on timeline dates length
						const timelineDates = generateTimelineDates(
							visibleDateRange,
							viewMode
						);
						const totalDays = timelineDates.length;
						if (totalDays > 0) {
							targetX = (daysDiff / totalDays) * containerWidth;
						}
					}
				}
			}

			// Scroll to the calculated position with smooth animation
			timelineRef.current.scrollTo({
				top: Math.max(0, targetY - 100), // Offset by 100px to show some context above
				left: Math.max(0, targetX - 200), // Offset by 200px to show some context to the left
				behavior: "smooth",
			});

			// Also scroll the task into view horizontally if it's at the edges
			setTimeout(() => {
				const taskBarElement = document.getElementById(
					`task-bar-${card.id}`
				);
				if (taskBarElement) {
					taskBarElement.scrollIntoView({
						behavior: "smooth",
						block: "nearest",
						inline: "center",
					});
				}
			}, 500); // Wait for initial scroll to complete
		},
		[visibleDateRange, containerWidth, viewMode]
	);

	// Enhanced Navigate to task function - exactly like GanttView
	const navigateToTask = useCallback(
		(card) => {
			if (!card.startDate) return;

			const taskDate = new Date(card.startDate);
			const currentRangeStart = visibleDateRange.start;
			const currentRangeEnd = visibleDateRange.end;

			// Check if task is already in current visible range
			const isTaskInCurrentRange =
				currentRangeStart &&
				currentRangeEnd &&
				taskDate >= currentRangeStart &&
				taskDate <= currentRangeEnd;

			if (isTaskInCurrentRange) {
				// Task is in current view, just scroll to it
				// Find the card's position in the grouped cards
				const groupedCards = getGroupedCards();
				let foundGroupIndex = -1;
				let foundCardIndex = -1;

				groupedCards.forEach((group, groupIndex) => {
					const cardIndex = group.cards.findIndex(
						(c) => c.id === card.id
					);
					if (cardIndex !== -1) {
						foundGroupIndex = groupIndex;
						foundCardIndex = cardIndex;
					}
				});

				setSearchOverlay((prev) => ({
					...prev,
					highlightedTaskId: card.id,
				}));

				setTimeout(() => {
					scrollToTask(card, foundGroupIndex, foundCardIndex);
				}, 100);

				setTimeout(() => {
					setSearchOverlay((prev) => ({
						...prev,
						highlightedTaskId: null,
					}));
				}, 3000);
			} else {
				// Task is outside current view, navigate to its time period
				if (viewMode === "week") {
					setCurrentPeriodStart(getWeekStart(taskDate));
				} else if (viewMode === "quarter") {
					setCurrentPeriodStart(getQuarterStart(taskDate));
				} else {
					setCurrentPeriodStart(getMonthStart(taskDate));
				}

				// Highlight and scroll after navigation
				setSearchOverlay((prev) => ({
					...prev,
					highlightedTaskId: card.id,
				}));

				setTimeout(() => {
					// Find the card's position after navigation
					const groupedCards = getGroupedCards();
					let foundGroupIndex = -1;
					let foundCardIndex = -1;

					groupedCards.forEach((group, groupIndex) => {
						const cardIndex = group.cards.findIndex(
							(c) => c.id === card.id
						);
						if (cardIndex !== -1) {
							foundGroupIndex = groupIndex;
							foundCardIndex = cardIndex;
						}
					});

					scrollToTask(card, foundGroupIndex, foundCardIndex);
				}, 400); // Longer wait for view change

				setTimeout(() => {
					setSearchOverlay((prev) => ({
						...prev,
						highlightedTaskId: null,
					}));
				}, 3000);
			}
		},
		[viewMode, visibleDateRange, scrollToTask]
	);

	// Enhanced function to handle search result clicks - exactly like GanttView
	const handleSearchResultClick = useCallback(
		(task) => {
			// Close search overlay first (collapse it)
			setSearchOverlay((prev) => ({ ...prev, isCollapsed: true }));

			// Navigate to the task
			navigateToTask(task);

			// Optional: Clear search after navigation
			setTimeout(() => {
				setSearchTerm("");
			}, 1500);
		},
		[navigateToTask]
	);

	// Apply search and filters
	useEffect(() => {
		if (!cards.length) return;

		let filtered = [...cards];

		// Apply completed filter
		if (activeFilters.completed) {
			filtered = filtered.filter(
				(card) => card.progress === 100 || card.isCompletionColumn
			);
		}

		// Apply priority filters
		if (activeFilters.priority.length > 0) {
			filtered = filtered.filter((card) =>
				activeFilters.priority.includes(card.priority)
			);
		}

		// Apply status filters
		if (activeFilters.status.length > 0) {
			filtered = filtered.filter((card) =>
				activeFilters.status.includes(card.columnTitle)
			);
		}

		// Apply time range filter
		if (activeFilters.timeRange !== "all") {
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);

			const weekStart = new Date(today);
			weekStart.setDate(today.getDate() - today.getDay());

			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 6);

			const nextWeekStart = new Date(weekEnd);
			nextWeekStart.setDate(weekEnd.getDate() + 1);

			const nextWeekEnd = new Date(nextWeekStart);
			nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

			const monthStart = new Date(
				today.getFullYear(),
				today.getMonth(),
				1
			);
			const monthEnd = new Date(
				today.getFullYear(),
				today.getMonth() + 1,
				0
			);

			switch (activeFilters.timeRange) {
				case "upcoming":
					filtered = filtered.filter((card) => card.dueDate >= today);
					break;
				case "overdue":
					filtered = filtered.filter((card) => card.dueDate < today);
					break;
				case "today":
					filtered = filtered.filter(
						(card) =>
							card.dueDate >= today && card.dueDate < tomorrow
					);
					break;
				case "thisWeek":
					filtered = filtered.filter(
						(card) =>
							card.dueDate >= weekStart && card.dueDate <= weekEnd
					);
					break;
				case "nextWeek":
					filtered = filtered.filter(
						(card) =>
							card.dueDate >= nextWeekStart &&
							card.dueDate <= nextWeekEnd
					);
					break;
				case "thisMonth":
					filtered = filtered.filter(
						(card) =>
							card.dueDate >= monthStart &&
							card.dueDate <= monthEnd
					);
					break;
				default:
					break;
			}
		}

		setFilteredCards(filtered);
		setIsFiltering(
			searchTerm ||
				activeFilters.priority.length > 0 ||
				activeFilters.status.length > 0 ||
				activeFilters.timeRange !== "all" ||
				activeFilters.completed
		);
	}, [cards, searchTerm, activeFilters]);

	// Navigation handlers
	const navigatePrevious = () => {
		if (!currentPeriodStart) return;

		switch (viewMode) {
			case "week":
				setCurrentPeriodStart(addDays(currentPeriodStart, -7));
				break;
			case "month":
				const prevMonth = new Date(currentPeriodStart);
				prevMonth.setMonth(prevMonth.getMonth() - 1);
				setCurrentPeriodStart(getMonthStart(prevMonth));
				break;
			case "quarter":
				const prevQuarter = new Date(currentPeriodStart);
				prevQuarter.setMonth(prevQuarter.getMonth() - 3);
				setCurrentPeriodStart(getQuarterStart(prevQuarter));
				break;
			default:
				break;
		}
	};

	const navigateNext = () => {
		if (!currentPeriodStart) return;

		switch (viewMode) {
			case "week":
				setCurrentPeriodStart(addDays(currentPeriodStart, 7));
				break;
			case "month":
				const nextMonth = new Date(currentPeriodStart);
				nextMonth.setMonth(nextMonth.getMonth() + 1);
				setCurrentPeriodStart(getMonthStart(nextMonth));
				break;
			case "quarter":
				const nextQuarter = new Date(currentPeriodStart);
				nextQuarter.setMonth(nextQuarter.getMonth() + 3);
				setCurrentPeriodStart(getQuarterStart(nextQuarter));
				break;
			default:
				break;
		}
	};

	const resetToToday = () => {
		const today = new Date();
		if (viewMode === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (viewMode === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	};

	// Filter toggle functions
	const toggleCompletedFilter = () => {
		setActiveFilters((prev) => ({
			...prev,
			completed: !prev.completed,
		}));
	};

	const togglePriorityFilter = (priority) => {
		setActiveFilters((prev) => {
			const updated = { ...prev };
			if (updated.priority.includes(priority)) {
				updated.priority = updated.priority.filter(
					(p) => p !== priority
				);
			} else {
				updated.priority = [...updated.priority, priority];
			}
			return updated;
		});
	};

	const toggleOverdueFilter = () => {
		setActiveFilters((prev) => ({
			...prev,
			timeRange: prev.timeRange === "overdue" ? "all" : "overdue",
		}));
	};

	const toggleTimeRangeFilter = (range) => {
		setActiveFilters((prev) => ({
			...prev,
			timeRange: prev.timeRange === range ? "all" : range,
		}));
	};

	const clearFilters = () => {
		setActiveFilters({
			priority: [],
			status: [],
			timeRange: "all",
			completed: false,
		});
	};

	// Helper function to check if a task is highlighted
	const isTaskHighlighted = useCallback(
		(card) => {
			return searchOverlay.highlightedTaskId === card.id;
		},
		[searchOverlay.highlightedTaskId]
	);

	// Group cards by the selected criteria
	const getGroupedCards = () => {
		const displayCards = isFiltering ? filteredCards : cards;

		switch (groupBy) {
			case "status": {
				// Group by column status
				const statusGroups = {};
				displayCards.forEach((card) => {
					if (!statusGroups[card.columnTitle]) {
						statusGroups[card.columnTitle] = [];
					}
					statusGroups[card.columnTitle].push(card);
				});

				return Object.entries(statusGroups).map(([status, cards]) => ({
					title: status,
					cards: cards,
					color: getStatusColor(status),
				}));
			}

			case "priority": {
				// Group by priority
				const priorityGroups = {};
				const priorityOrder = { High: 1, Medium: 2, Low: 3, "": 4 };

				displayCards.forEach((card) => {
					const priority = card.priority || "";
					if (!priorityGroups[priority]) {
						priorityGroups[priority] = [];
					}
					priorityGroups[priority].push(card);
				});

				return Object.entries(priorityGroups)
					.sort(([a], [b]) => priorityOrder[a] - priorityOrder[b])
					.map(([priority, cards]) => ({
						title: priority || "No Priority",
						cards: cards,
						color:
							priority === "High"
								? "bg-red-500"
								: priority === "Medium"
								? "bg-yellow-500"
								: priority === "Low"
								? "bg-green-500"
								: "bg-gray-500",
					}));
			}

			case "dueStatus": {
				// Group by due status
				const dueGroups = {
					Overdue: [],
					Today: [],
					"This Week": [],
					Upcoming: [],
					"No Date": [],
				};

				displayCards.forEach((card) => {
					const status = getDueStatus(card.dueDate).label;
					dueGroups[status].push(card);
				});

				return Object.entries(dueGroups)
					.filter(([_, cards]) => cards.length > 0)
					.map(([status, cards]) => ({
						title: status,
						cards: cards,
						color:
							status === "Overdue"
								? "bg-red-500"
								: status === "Today"
								? "bg-orange-500"
								: status === "This Week"
								? "bg-blue-500"
								: status === "Upcoming"
								? "bg-purple-500"
								: "bg-gray-500",
					}));
			}

			case "completion": {
				// Group by completion status
				const completionGroups = {
					Completed: [],
					"In Progress": [],
				};

				displayCards.forEach((card) => {
					if (card.progress === 100 || card.isCompletionColumn) {
						completionGroups["Completed"].push(card);
					} else {
						completionGroups["In Progress"].push(card);
					}
				});

				return Object.entries(completionGroups)
					.filter(([_, cards]) => cards.length > 0)
					.map(([status, cards]) => ({
						title: status,
						cards: cards,
						color:
							status === "Completed"
								? "bg-green-500"
								: "bg-blue-500",
					}));
			}

			case "timeTracking": {
				// Group by time tracking status
				const timeGroups = {
					"Has Time Entries": [],
					"No Time Tracked": [],
				};

				displayCards.forEach((card) => {
					if (
						timeEntries[card.id] &&
						timeEntries[card.id].length > 0
					) {
						timeGroups["Has Time Entries"].push(card);
					} else {
						timeGroups["No Time Tracked"].push(card);
					}
				});

				return Object.entries(timeGroups)
					.filter(([_, cards]) => cards.length > 0)
					.map(([status, cards]) => ({
						title: status,
						cards: cards,
						color:
							status === "Has Time Entries"
								? "bg-purple-500"
								: "bg-gray-500",
					}));
			}

			default:
				return [
					{
						title: "All Tasks",
						cards: displayCards,
						color: "bg-indigo-500",
					},
				];
		}
	};

	if (error) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950 text-red-500 dark:text-red-400 midnight:text-red-300">
				Error: {error}
			</div>
		);
	}

	if (!selectedProject?.id) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-200">
						No Project Selected
					</h2>
					<p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-2">
						Please select a project to view its timeline.
					</p>
				</div>
			</div>
		);
	}

	const timelineDates = generateTimelineDates(visibleDateRange, viewMode);
	const groupedCards = getGroupedCards();
	const displayCards = isFiltering ? filteredCards : cards;
	const hasCards = displayCards.length > 0;
	const totalTimelineWidth = containerWidth;

	return (
		<div
			className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950"
			ref={timelineContainerRef}
		>
			{/* Timeline Filters */}
			<TimelineFilters
				searchTerm={searchTerm}
				setSearchTerm={setSearchTerm}
				activeFilters={activeFilters}
				toggleCompletedFilter={toggleCompletedFilter}
				togglePriorityFilter={togglePriorityFilter}
				toggleOverdueFilter={toggleOverdueFilter}
				toggleTimeRangeFilter={toggleTimeRangeFilter}
				onClearFilters={clearFilters}
				onCreateTask={() => setShowCreateTask(true)}
				session={session}
				searchContext={{
					isSearchActive: searchOverlay.isVisible,
					totalResults: searchOverlay.totalResults,
				}}
			/>

			{/* Timeline Navigation */}
			<TimelineNavigation
				viewMode={viewMode}
				setViewMode={setViewMode}
				visibleDateRange={visibleDateRange}
				navigatePrevious={navigatePrevious}
				navigateNext={navigateNext}
				resetToToday={resetToToday}
				groupBy={groupBy}
				setGroupBy={setGroupBy}
			/>

			{/* Search Results Overlay - using Lucide icons (exact Gantt implementation) */}
			{searchOverlay.isVisible && (
				<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 shadow-sm">
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 border-b border-blue-200 dark:border-blue-800 midnight:border-blue-800/50">
						<div className="flex items-center space-x-3">
							<Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
							<div>
								<h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 midnight:text-blue-200">
									Search Results
								</h3>
								<p className="text-xs text-blue-700 dark:text-blue-300 midnight:text-blue-400">
									{searchOverlay.totalResults}{" "}
									{searchOverlay.totalResults === 1
										? "task"
										: "tasks"}{" "}
									matching "{searchTerm}"
								</p>
							</div>
						</div>

						<div className="flex items-center space-x-2">
							<button
								onClick={() =>
									setSearchOverlay((prev) => ({
										...prev,
										isCollapsed: !prev.isCollapsed,
									}))
								}
								className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-700/30 midnight:hover:bg-blue-900/30 rounded"
								title={
									searchOverlay.isCollapsed
										? "Expand"
										: "Collapse"
								}
							>
								<ChevronDown
									className={`w-4 h-4 transition-transform duration-200 ${
										searchOverlay.isCollapsed
											? "rotate-180"
											: ""
									}`}
								/>
							</button>

							<button
								onClick={() => setSearchTerm("")}
								className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-700/30 midnight:hover:bg-blue-900/30 rounded"
								title="Close search"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					</div>

					{/* Results Content */}
					{!searchOverlay.isCollapsed && (
						<div className="max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50">
							{searchOverlay.totalResults === 0 ? (
								<div className="p-6 text-center">
									<Search className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
									<p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
										No tasks found matching "{searchTerm}"
									</p>
									<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-600 mt-1">
										Try adjusting your search terms
									</p>
								</div>
							) : (
								<div className="divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800">
									{Array.from(
										searchOverlay.resultsByPeriod.entries()
									).map(([periodKey, tasks]) => (
										<div key={periodKey} className="p-4">
											{/* Period Header */}
											<div className="flex items-center justify-between mb-3">
												<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
													{formatPeriodName(
														periodKey,
														viewMode
													)}
												</h4>
												<span className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-600">
													{tasks.length}{" "}
													{tasks.length === 1
														? "task"
														: "tasks"}
												</span>
											</div>

											{/* Tasks List */}
											<div className="space-y-2">
												{tasks.map((task) => (
													<div
														key={task.id}
														onClick={() =>
															handleSearchResultClick(
																task
															)
														}
														className="p-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-blue-300 dark:hover:border-blue-600 midnight:hover:border-blue-700 hover:shadow-sm cursor-pointer transition-all duration-200 group"
													>
														<div className="flex items-start justify-between">
															<div className="flex-1 min-w-0">
																<div className="flex items-center space-x-2 mb-1">
																	{/* Status icon */}
																	{task.progress ===
																		100 ||
																	task.isCompletionColumn ? (
																		<CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
																	) : task.priority ===
																	  "High" ? (
																		<AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
																	) : (
																		<Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
																	)}

																	<h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200 truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 midnight:group-hover:text-blue-400">
																		{
																			task.title
																		}
																	</h5>
																</div>

																<div className="space-y-4">
																	{/* Status and Due Date */}
																	<div className="flex items-center justify-between text-xs py-2">
																		<span
																			className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${
																				task.isCompletionColumn
																					? "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900"
																					: "bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/5 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-900"
																			}`}
																		>
																			{
																				task.columnTitle
																			}
																		</span>
																	</div>
																</div>
															</div>

															{/* Priority badge */}
															<div className="flex-shrink-0 ml-2 text-right">
																{task.priority && (
																	<span
																		className={`px-2 py-1 text-xs font-medium rounded-md ${
																			task.priority ===
																			"High"
																				? "bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 text-red-700 dark:text-red-400 midnight:text-red-300 border border-red-200 dark:border-red-800 midnight:border-red-900"
																				: task.priority ===
																				  "Medium"
																				? "bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border border-amber-200 dark:border-amber-800 midnight:border-amber-900"
																				: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900"
																		}`}
																	>
																		{
																			task.priority
																		}
																	</span>
																)}
																<div className="mt-3">
																	<span className="flex items-center justify-end text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
																		<Calendar className="w-3 h-3 mr-1" />
																		{new Date(
																			task.startDate
																		).toLocaleDateString(
																			"en-US",
																			{
																				month: "short",
																				day: "numeric",
																			}
																		)}{" "}
																		-{" "}
																		{new Date(
																			task.endDate
																		).toLocaleDateString(
																			"en-US",
																			{
																				month: "short",
																				day: "numeric",
																			}
																		)}
																	</span>
																</div>
															</div>
														</div>

														{/* Progress bar */}
														<div className="mt-2 flex items-center space-x-2">
															<div className="flex-1 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-1.5">
																<div
																	className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(
																		task.progress ||
																			0
																	)}`}
																	style={{
																		width: `${
																			task.progress ||
																			0
																		}%`,
																	}}
																/>
															</div>
															<span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
																{task.progress ||
																	0}
																%
															</span>
														</div>
													</div>
												))}
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Timeline Content Area */}
			<div className="flex-1 overflow-hidden relative">
				<TimelineContent
					timelineRef={timelineRef}
					timelineDates={timelineDates}
					groupedCards={groupedCards}
					activeTimer={activeTimer}
					handleStartTimer={handleStartTimer}
					handleStopTimer={handleStopTimer}
					visibleDateRange={visibleDateRange}
					groupBy={groupBy}
					session={session}
					setSelectedCard={setSelectedCard}
					hasCards={hasCards}
					containerWidth={containerWidth}
					totalTimelineWidth={totalTimelineWidth}
					viewMode={viewMode}
					searchOverlay={searchOverlay}
					isTaskHighlighted={isTaskHighlighted}
				/>
			</div>

			{/* Create Task Modal */}
			{showCreateTask && (
				<AddCardModal
					onClose={() => setShowCreateTask(false)}
					onSuccess={() => setShowCreateTask(false)}
				/>
			)}
		</div>
	);
};

export default TimelineView;
