import { useState, useEffect, useRef, useCallback } from "react";
import { useColumnContext } from "../../views/context/ColumnContext";
import { useCardContext } from "../../views/context/CardContext";
import { useCardActions } from "../hooks/useCardActions";
import viewsApi from "../viewsApi";
import GanttFilters from "./GanttFilters";
import GanttTimeline from "./GanttTimeline";
import GanttTaskList, { GanttTaskListHeader } from "./GanttTaskList";
import GanttTaskBar from "./GanttTaskBar";
import AddCardModal from "../kanban/features/cards/AddCardModal";
import {
	daysBetween,
	addDays,
	generateTimelineHeaders,
	getTaskBarStyle,
	getProgressColor,
} from "./GanttUtils";
import {
	CheckCircle,
	Clock,
	AlertCircle,
	Calendar,
	ChevronDown,
	X,
	Search,
	User,
} from "lucide-react";

// Import profile pictures
import catDP from "../../assets/dp/CAT.webp";
import dogDP from "../../assets/dp/DOG.webp";
import dolphinDP from "../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../assets/dp/DRAGON.webp";
import elephantDP from "../../assets/dp/ELEPHANT.webp";
import foxDP from "../../assets/dp/FOX.webp";
import lionDP from "../../assets/dp/LION.webp";
import owlDP from "../../assets/dp/OWL.webp";
import penguinDP from "../../assets/dp/PENGUIN.webp";
import wolfDP from "../../assets/dp/WOLF.webp";

// Centered Empty State Component using Lucide icons
const GanttEmptyState = () => {
	return (
		<div className="h-full flex flex-col items-center justify-center text-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
			<div className="max-w-md px-8">
				<div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-6">
					<Calendar className="w-8 h-8 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
				</div>

				<h3 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">
					No tasks found
				</h3>

				<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6 leading-relaxed">
					No tasks have been scheduled yet.
				</p>
			</div>
		</div>
	);
};

// Status Badge Component
const StatusBadge = ({ columnTitle, isCompletionColumn }) => {
	const getStatusColor = () => {
		if (isCompletionColumn) {
			return "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900";
		}
		return "bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/5 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-900";
	};

	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${getStatusColor()}`}
		>
			{columnTitle}
		</span>
	);
};

// Assignee Avatars Component with Profile Pictures
const AssigneeAvatars = ({
	assigneeIds,
	assigneeDetails,
	isLoadingAssignees,
	size = "small",
}) => {
	if (!assigneeIds || assigneeIds.length === 0) return null;

	const sizeClasses =
		size === "small" ? "w-5 h-5 text-xs" : "w-6 h-6 text-sm";

	// Profile picture mapping
	const profilePictureMap = {
		CAT: catDP,
		DOG: dogDP,
		DOLPHIN: dolphinDP,
		DRAGON: dragonDP,
		ELEPHANT: elephantDP,
		FOX: foxDP,
		LION: lionDP,
		OWL: owlDP,
		PENGUIN: penguinDP,
		WOLF: wolfDP,
	};

	const getProfilePicture = (profilePicId) => {
		if (!profilePicId) return null;

		// Check if it's a custom uploaded image (URL starts with https://)
		if (profilePicId.startsWith("https://")) {
			return profilePicId;
		}

		// Handle predefined avatars
		if (profilePictureMap[profilePicId]) {
			return profilePictureMap[profilePicId];
		}
		return null;
	};

	const getMemberInitial = (member) => {
		if (!member) return "U";

		const name = member.name || "";
		if (name) return name.charAt(0).toUpperCase();

		const email = member.email || "";
		if (email) return email.charAt(0).toUpperCase();

		return "U";
	};

	const ProfileImage = ({ member, sizeClasses }) => {
		const [imageLoadError, setImageLoadError] = useState(false);
		const profilePicture = getProfilePicture(member.profile_picture);

		const handleImageError = () => {
			setImageLoadError(true);
		};

		const handleImageLoad = () => {
			setImageLoadError(false);
		};

		return (
			<div
				className={`${sizeClasses} rounded-full border-2 border-white dark:border-gray-800 midnight:border-gray-900 
          flex items-center justify-center font-medium shadow-sm
          transition-transform duration-200 hover:scale-110 hover:z-10 overflow-hidden`}
				title={member.name || member.email || "Member"}
			>
				{profilePicture && !imageLoadError ? (
					<img
						src={profilePicture}
						alt={member.name || member.email || "Member"}
						className="w-full h-full object-cover"
						onError={handleImageError}
						onLoad={handleImageLoad}
					/>
				) : (
					<div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-medium">
						{getMemberInitial(member)}
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="flex -space-x-1">
			{isLoadingAssignees ? (
				<div
					className={`${sizeClasses} rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse`}
				></div>
			) : (
				<>
					{assigneeIds.slice(0, 3).map((assigneeId) => {
						const id =
							typeof assigneeId === "object"
								? assigneeId.id
								: assigneeId;
						const member = assigneeDetails[id];

						if (!member) return null;

						return (
							<ProfileImage
								key={id}
								member={member}
								sizeClasses={sizeClasses}
							/>
						);
					})}

					{assigneeIds.length > 3 && (
						<div
							className={`${sizeClasses} rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 border-2 border-white dark:border-gray-800 midnight:border-gray-900 flex items-center justify-center text-gray-600 dark:text-gray-400 midnight:text-gray-500 font-medium shadow-sm`}
						>
							+{assigneeIds.length - 3}
						</div>
					)}
				</>
			)}
		</div>
	);
};

const GanttView = ({ selectedProject }) => {
	const { columns, isLoading, error } = useColumnContext();
	const { setSelectedCard } = useCardContext();

	// Refs
	const unifiedScrollRef = useRef(null);
	const timelineContainerRef = useRef(null);

	// State
	const [cards, setCards] = useState([]);
	const [viewType, setViewType] = useState("week"); // "week", "month", "quarter"
	const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
	const [visibleRange, setVisibleRange] = useState({
		startDate: null,
		endDate: null,
		days: 0,
	});
	const [timelineScale, setTimelineScale] = useState(1);
	const [searchTerm, setSearchTerm] = useState("");
	const [sortConfig, setSortConfig] = useState({
		key: "dueDate",
		direction: "asc",
	});
	const [filterConfig, setFilterConfig] = useState({
		priority: [],
		dueStatus: [],
		completed: false,
	});
	const [assigneeDetails, setAssigneeDetails] = useState({});
	const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
	const [showCreateTask, setShowCreateTask] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);

	// Search overlay state
	const [searchOverlay, setSearchOverlay] = useState({
		isVisible: false,
		isCollapsed: false,
		results: [],
		resultsByPeriod: new Map(),
		totalResults: 0,
		highlightedTaskId: null,
	});

	// Constants
	const baseCellWidth = 120;

	// Helper function to get week start (Monday)
	const getWeekStart = (date) => {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		d.setDate(diff);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	// Helper function to get month start
	const getMonthStart = (date) => {
		const d = new Date(date);
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	// NEW: Helper function to get quarter start
	const getQuarterStart = (date) => {
		const d = new Date(date);
		const quarter = Math.floor(d.getMonth() / 3);
		const quarterStartMonth = quarter * 3;
		d.setMonth(quarterStartMonth);
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	// NEW: Helper function to get quarter info
	const getQuarterInfo = (date) => {
		const quarter = Math.floor(date.getMonth() / 3) + 1;
		const year = date.getFullYear();
		return { quarter, year };
	};

	// Helper function to get period key for grouping
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

	// Helper function to calculate date range
	const calculateDateRange = useCallback((currentDate, viewType) => {
		if (viewType === "week") {
			const weekStart = getWeekStart(currentDate);
			return {
				startDate: weekStart,
				endDate: addDays(weekStart, 6),
				days: 7,
			};
		} else if (viewType === "quarter") {
			const quarterStart = getQuarterStart(currentDate);
			const quarterEnd = new Date(quarterStart);
			quarterEnd.setMonth(quarterStart.getMonth() + 3);
			quarterEnd.setDate(quarterEnd.getDate() - 1);
			return {
				startDate: quarterStart,
				endDate: quarterEnd,
				days: daysBetween(quarterStart, quarterEnd) + 1,
			};
		} else {
			const monthStart = getMonthStart(currentDate);
			const monthEnd = new Date(
				monthStart.getFullYear(),
				monthStart.getMonth() + 1,
				0
			);
			return {
				startDate: monthStart,
				endDate: monthEnd,
				days: daysBetween(monthStart, monthEnd) + 1,
			};
		}
	}, []);

	// Helper function to calculate cell width
	const calculateCellWidth = useCallback(
		(containerWidth, timelineScale, viewType, numColumns) => {
			if (containerWidth > 0 && timelineScale === 1) {
				const calculatedCellWidth =
					numColumns > 0
						? containerWidth / numColumns
						: baseCellWidth;
				if (viewType === "month" || viewType === "quarter") {
					return calculatedCellWidth;
				} else {
					return Math.max(80, calculatedCellWidth);
				}
			} else {
				return baseCellWidth * timelineScale;
			}
		},
		[]
	);

	// Initialize current period on component mount
	useEffect(() => {
		const today = new Date();
		if (viewType === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (viewType === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	}, [viewType]);

	// Update visible range when viewType or currentPeriodStart changes
	useEffect(() => {
		if (!currentPeriodStart) return;
		const range = calculateDateRange(currentPeriodStart, viewType);
		setVisibleRange(range);
	}, [viewType, currentPeriodStart, calculateDateRange]);

	// Extract all cards from columns
	useEffect(() => {
		if (!columns || !Array.isArray(columns)) return;

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
				dueDate: card.dueDate || processedEndDate,
			};
		});

		setCards(processedCards);
	}, [columns]);

	// Fetch administrator details
	useEffect(() => {
		const fetchAllAssigneeDetails = async () => {
			const allAssigneeIds = new Set();

			// Collect administrator IDs from cards
			cards.forEach((card) => {
				if (card.administrator_id) {
					const adminId =
						typeof card.administrator_id === "object"
							? card.administrator_id.id
							: card.administrator_id;
					allAssigneeIds.add(adminId);
				}
			});

			if (allAssigneeIds.size === 0) return;

			try {
				setIsLoadingAssignees(true);
				const detailsPromises = Array.from(allAssigneeIds).map(
					async (id) => {
						try {
							const data = await viewsApi.user.getUserById(id);
							return data.data;
						} catch (error) {
							console.error(`Failed to fetch user ${id}:`, error);
							return { id: id };
						}
					}
				);

				const results = await Promise.all(detailsPromises);
				const assigneeMap = {};
				results.filter(Boolean).forEach((assignee) => {
					assigneeMap[assignee.id] = assignee;
				});

				setAssigneeDetails(assigneeMap);
			} catch (error) {
				console.error("Error fetching assignee details:", error);
			} finally {
				setIsLoadingAssignees(false);
			}
		};

		fetchAllAssigneeDetails();
	}, [cards]);

	// Observe timeline container width for dynamic sizing
	useEffect(() => {
		const observeWidth = () => {
			if (timelineContainerRef.current) {
				const { width } =
					timelineContainerRef.current.getBoundingClientRect();
				if (width > 0) {
					setContainerWidth(width);
				}
			}
		};

		// Immediate measurement
		observeWidth();

		// Delayed measurement for layout changes
		const timeoutId = setTimeout(observeWidth, 100);

		const resizeObserver = new ResizeObserver(() => {
			clearTimeout(window.ganttResizeTimeout);
			window.ganttResizeTimeout = setTimeout(observeWidth, 50);
		});

		if (timelineContainerRef.current) {
			resizeObserver.observe(timelineContainerRef.current);
		}

		window.addEventListener("resize", observeWidth);

		return () => {
			clearTimeout(timeoutId);
			clearTimeout(window.ganttResizeTimeout);
			resizeObserver.disconnect();
			window.removeEventListener("resize", observeWidth);
		};
	}, [viewType, visibleRange]);

	// Force layout recalculation after view changes to prevent alignment issues
	useEffect(() => {
		const forceLayoutRecalc = () => {
			if (timelineContainerRef.current) {
				const { width } =
					timelineContainerRef.current.getBoundingClientRect();
				if (width > 0) {
					setContainerWidth(width);
				}
			}
		};

		// Force recalculation after a delay when key layout-affecting properties change
		const recalcTimeoutId = setTimeout(forceLayoutRecalc, 500);

		return () => {
			clearTimeout(recalcTimeoutId);
		};
	}, [viewType, visibleRange.startDate, visibleRange.endDate]);

	// Calculate timeline dimensions
	const timelineHeaders = generateTimelineHeaders(visibleRange, viewType);
	const safeDays =
		timelineHeaders?.days?.filter((day) => day && day.date) || [];
	const numColumns = Math.max(
		safeDays.length,
		viewType === "week" ? 7 : viewType === "quarter" ? 90 : 1
	);

	// Cell width calculation
	const finalCellWidth = calculateCellWidth(
		containerWidth,
		timelineScale,
		viewType,
		numColumns
	);

	let totalTimelineWidth;
	if (containerWidth > 0 && timelineScale === 1) {
		totalTimelineWidth = containerWidth;
	} else {
		totalTimelineWidth = numColumns * finalCellWidth;
	}

	// Enhanced search function - handles search overlay
	const performSearch = useCallback(
		(searchTerm, cards, assigneeDetails) => {
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

				// Search in administrator name for cards
				if (card.administrator_id) {
					const adminId =
						typeof card.administrator_id === "object"
							? card.administrator_id.id
							: card.administrator_id;
					const admin = assigneeDetails[adminId];
					if (admin?.name) {
						searchableFields.push(admin.name.toLowerCase());
					}
				}

				return searchableFields.some((field) => field.includes(search));
			});

			// Group results by time period
			const resultsByPeriod = new Map();
			results.forEach((card) => {
				const periodKey = getPeriodKey(card.startDate, viewType);
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
		[viewType, getPeriodKey]
	);

	// Update search when search term, cards, or view changes
	useEffect(() => {
		performSearch(searchTerm, cards, assigneeDetails);
	}, [searchTerm, cards, assigneeDetails, performSearch]);

	// Get sorted and filtered cards for current view (normal time-based filtering)
	const getSortedFilteredCards = useCallback(() => {
		if (!visibleRange.startDate || !visibleRange.endDate) return [];

		let filtered = cards;

		// Time-based filtering (always applied)
		filtered = filtered.filter((card) => {
			const cardStart = new Date(card.startDate);
			const cardEnd = new Date(card.endDate);
			return !(
				cardEnd < visibleRange.startDate ||
				cardStart > visibleRange.endDate
			);
		});

		// Apply other filters
		if (filterConfig.completed) {
			filtered = filtered.filter(
				(card) => card.progress === 100 || card.isCompletionColumn
			);
		}

		if (filterConfig.priority.length > 0) {
			filtered = filtered.filter((card) =>
				filterConfig.priority.includes(card.priority)
			);
		}

		// Apply due status filters
		if (filterConfig.dueStatus.length > 0) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const tomorrow = new Date(today);
			tomorrow.setDate(today.getDate() + 1);

			// Get start of current week (Monday)
			const currentWeekStart = new Date(today);
			const day = currentWeekStart.getDay();
			const diff =
				currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
			currentWeekStart.setDate(diff);

			const nextWeekStart = new Date(currentWeekStart);
			nextWeekStart.setDate(currentWeekStart.getDate() + 7);

			filtered = filtered.filter((card) => {
				const cardEndDate = new Date(card.endDate);
				cardEndDate.setHours(0, 0, 0, 0);

				return filterConfig.dueStatus.some((status) => {
					switch (status) {
						case "overdue":
							return (
								cardEndDate < today &&
								!(
									card.progress === 100 ||
									card.isCompletionColumn
								)
							);
						case "today":
							return (
								cardEndDate >= today && cardEndDate < tomorrow
							);
						case "thisWeek":
							return (
								cardEndDate >= currentWeekStart &&
								cardEndDate < nextWeekStart
							);
						default:
							return false;
					}
				});
			});
		}

		// Apply sorting
		filtered.sort((a, b) => {
			const { key, direction } = sortConfig;
			let valueA, valueB;

			switch (key) {
				case "title":
					valueA = a.title?.toLowerCase() || "";
					valueB = b.title?.toLowerCase() || "";
					break;
				case "dueDate":
					valueA = a.startDate
						? new Date(a.startDate).getTime()
						: Infinity;
					valueB = b.startDate
						? new Date(b.startDate).getTime()
						: Infinity;
					break;
				case "priority": {
					const priorityValue = { High: 3, Medium: 2, Low: 1 };
					valueA = priorityValue[a.priority] || 0;
					valueB = priorityValue[b.priority] || 0;
					break;
				}
				case "progress":
					valueA = a.progress || 0;
					valueB = b.progress || 0;
					break;
				default:
					valueA = a[key] || "";
					valueB = b[key] || "";
			}

			if (valueA < valueB) return direction === "asc" ? -1 : 1;
			if (valueA > valueB) return direction === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [cards, filterConfig, sortConfig, visibleRange]);

	const sortedFilteredCards = getSortedFilteredCards();

	// Enhanced function to handle scrolling to task position
	const scrollToTask = useCallback(
		(card, taskRowIndex) => {
			if (!unifiedScrollRef.current) return;

			// Calculate vertical position (row position)
			const rowHeight = 140; // Height of each task row
			const targetY = taskRowIndex * rowHeight;

			// Calculate horizontal position (timeline position)
			let targetX = 0;

			if (visibleRange.startDate && card.startDate) {
				const taskStartDate = new Date(card.startDate);
				const rangeStartDate = new Date(visibleRange.startDate);

				// Calculate days from range start to task start
				const daysDiff = Math.floor(
					(taskStartDate - rangeStartDate) / (1000 * 60 * 60 * 24)
				);

				if (daysDiff >= 0) {
					// Task is within or after the visible range
					if (containerWidth > 0 && timelineScale === 1) {
						// Flexible width mode
						const totalDays =
							daysBetween(
								visibleRange.startDate,
								visibleRange.endDate
							) + 1;
						targetX = (daysDiff / totalDays) * containerWidth;
					} else {
						// Fixed width mode - calculate cell width here
						const cellWidth = calculateCellWidth(
							containerWidth,
							timelineScale,
							viewType,
							numColumns
						);
						targetX = daysDiff * cellWidth;
					}
				}
			}

			// Scroll to the calculated position with smooth animation
			unifiedScrollRef.current.scrollTo({
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
		[
			visibleRange,
			containerWidth,
			timelineScale,
			viewType,
			numColumns,
			calculateCellWidth,
		]
	);

	// Enhanced Navigate to task function with automatic scrolling
	const navigateToTask = useCallback(
		(card) => {
			if (!card.startDate) return;

			const taskDate = new Date(card.startDate);
			const currentRangeStart = visibleRange.startDate;
			const currentRangeEnd = visibleRange.endDate;

			// Check if task is already in current visible range
			const isTaskInCurrentRange =
				currentRangeStart &&
				currentRangeEnd &&
				taskDate >= currentRangeStart &&
				taskDate <= currentRangeEnd;

			if (isTaskInCurrentRange) {
				// Task is in current view, just scroll to it
				const taskRowIndex = sortedFilteredCards.findIndex(
					(c) => c.id === card.id
				);
				setSearchOverlay((prev) => ({
					...prev,
					highlightedTaskId: card.id,
				}));

				setTimeout(() => {
					scrollToTask(card, taskRowIndex);
				}, 100);

				setTimeout(() => {
					setSearchOverlay((prev) => ({
						...prev,
						highlightedTaskId: null,
					}));
				}, 3000);
			} else {
				// Task is outside current view, navigate to its time period
				if (viewType === "week") {
					setCurrentPeriodStart(getWeekStart(taskDate));
				} else if (viewType === "quarter") {
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
					const taskRowIndex = sortedFilteredCards.findIndex(
						(c) => c.id === card.id
					);
					scrollToTask(card, taskRowIndex);
				}, 400); // Longer wait for view change

				setTimeout(() => {
					setSearchOverlay((prev) => ({
						...prev,
						highlightedTaskId: null,
					}));
				}, 3000);
			}
		},
		[viewType, visibleRange, sortedFilteredCards, scrollToTask]
	);

	// Enhanced function to handle search result clicks
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

	// Navigation handlers
	const navigatePrevious = () => {
		if (!currentPeriodStart) return;
		if (viewType === "week") {
			setCurrentPeriodStart(addDays(currentPeriodStart, -7));
		} else if (viewType === "quarter") {
			const prevQuarter = new Date(currentPeriodStart);
			prevQuarter.setMonth(prevQuarter.getMonth() - 3);
			setCurrentPeriodStart(getQuarterStart(prevQuarter));
		} else {
			const prevMonth = new Date(currentPeriodStart);
			prevMonth.setMonth(prevMonth.getMonth() - 1);
			setCurrentPeriodStart(getMonthStart(prevMonth));
		}
	};

	const navigateNext = () => {
		if (!currentPeriodStart) return;
		if (viewType === "week") {
			setCurrentPeriodStart(addDays(currentPeriodStart, 7));
		} else if (viewType === "quarter") {
			const nextQuarter = new Date(currentPeriodStart);
			nextQuarter.setMonth(nextQuarter.getMonth() + 3);
			setCurrentPeriodStart(getQuarterStart(nextQuarter));
		} else {
			const nextMonth = new Date(currentPeriodStart);
			nextMonth.setMonth(nextMonth.getMonth() + 1);
			setCurrentPeriodStart(getMonthStart(nextMonth));
		}
	};

	const resetToToday = () => {
		const today = new Date();
		if (viewType === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (viewType === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	};

	const toggleViewType = () => {
		const viewTypes = ["week", "month", "quarter"];
		const currentIndex = viewTypes.indexOf(viewType);
		const nextIndex = (currentIndex + 1) % viewTypes.length;
		const newViewType = viewTypes[nextIndex];

		setViewType(newViewType);
		const today = new Date();
		if (newViewType === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (newViewType === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	};

	// NEW: Function to set specific view type
	const setSpecificViewType = (newViewType) => {
		if (newViewType === viewType) return; // No change needed

		setViewType(newViewType);
		const today = new Date();
		if (newViewType === "week") {
			setCurrentPeriodStart(getWeekStart(today));
		} else if (newViewType === "quarter") {
			setCurrentPeriodStart(getQuarterStart(today));
		} else {
			setCurrentPeriodStart(getMonthStart(today));
		}
	};

	// Zoom handlers
	const zoomIn = () => {
		if (timelineScale < 2) {
			setTimelineScale((prev) => prev + 0.25);
		}
	};

	const zoomOut = () => {
		if (timelineScale > 0.5) {
			setTimelineScale((prev) => prev - 0.25);
		}
	};

	// Sort handler
	const handleSort = (key) => {
		const direction =
			sortConfig.key === key && sortConfig.direction === "asc"
				? "desc"
				: "asc";
		setSortConfig({ key, direction });
	};

	// Filter handlers
	const togglePriorityFilter = (priority) => {
		setFilterConfig((prev) => ({
			...prev,
			priority: prev.priority.includes(priority)
				? prev.priority.filter((p) => p !== priority)
				: [...prev.priority, priority],
		}));
	};

	const toggleCompletedFilter = () => {
		setFilterConfig((prev) => ({
			...prev,
			completed: !prev.completed,
		}));
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

	// Clear filters function
	const clearFilters = () => {
		setFilterConfig({
			priority: [],
			dueStatus: [],
			completed: false,
		});
	};

	// Update progress handler
	const { handleCardUpdate } = useCardActions();

	const handleUpdateProgress = useCallback(
		async (cardId, progress) => {
			const card = cards.find((c) => c.id === cardId);
			if (!card) return;

			try {
				setCards((prev) =>
					prev.map((c) => (c.id === cardId ? { ...c, progress } : c))
				);
				await handleCardUpdate(card.columnId, cardId, { progress });
			} catch (error) {
				console.error("Failed to update progress:", error);
				setCards((prev) =>
					prev.map((c) =>
						c.id === cardId ? { ...c, progress: card.progress } : c
					)
				);
			}
		},
		[cards, handleCardUpdate]
	);

	// Helper function to check if a task is highlighted
	const isTaskHighlighted = useCallback(
		(card) => {
			return searchOverlay.highlightedTaskId === card.id;
		},
		[searchOverlay.highlightedTaskId]
	);

	// Error state - using Lucide icon
	if (error) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="text-center p-8 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-xl">
					<div className="text-red-500 mb-4">
						<AlertCircle className="w-12 h-12 mx-auto" />
					</div>
					<h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
						Error Loading Gantt Chart
					</h3>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						{error}
					</p>
				</div>
			</div>
		);
	}

	// No project selected - using Lucide icon
	if (!selectedProject?.id) {
		return (
			<div className="h-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950">
				<div className="text-center p-8 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-xl">
					<div className="text-gray-400 dark:text-gray-500 midnight:text-gray-600 mb-4">
						<Calendar className="w-16 h-16 mx-auto" />
					</div>
					<h2 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
						No Project Selected
					</h2>
					<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						Please select a project to view its Gantt chart.
					</p>
				</div>
			</div>
		);
	}

	// NEW: If no tasks at all, show the single centered empty state
	if (sortedFilteredCards.length === 0) {
		return (
			<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
				{/* Filters */}
				<GanttFilters
					searchTerm={searchTerm}
					setSearchTerm={setSearchTerm}
					filterConfig={filterConfig}
					toggleCompletedFilter={toggleCompletedFilter}
					togglePriorityFilter={togglePriorityFilter}
					toggleDueStatusFilter={toggleDueStatusFilter}
					onClearFilters={clearFilters}
					onCreateTask={() => setShowCreateTask(true)}
					visibleRange={visibleRange}
					navigatePrevious={navigatePrevious}
					navigateNext={navigateNext}
					resetToToday={resetToToday}
					timelineScale={timelineScale}
					zoomIn={zoomIn}
					zoomOut={zoomOut}
					viewType={viewType}
					toggleViewType={toggleViewType}
					setSpecificViewType={setSpecificViewType}
					searchContext={{
						isSearchActive: searchOverlay.isVisible,
						totalResults: searchOverlay.totalResults,
						visibleResults: 0,
						outsideCurrentView: 0,
					}}
				/>

				{/* Search Results Overlay - using Lucide icons */}
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
											No tasks found matching "
											{searchTerm}"
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
											<div
												key={periodKey}
												className="p-4"
											>
												{/* Period Header */}
												<div className="flex items-center justify-between mb-3">
													<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400">
														{formatPeriodName(
															periodKey,
															viewType
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
																			<StatusBadge
																				columnTitle={
																					task.columnTitle
																				}
																				isCompletionColumn={
																					task.isCompletionColumn
																				}
																			/>
																		</div>

																		{/* Administrator */}
																		<div className="flex items-center">
																			{task.administrator_id ? (
																				<div className="flex items-center">
																					<User className="w-3 h-3 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mr-2" />
																					<AssigneeAvatars
																						assigneeIds={[
																							task.administrator_id,
																						]}
																						assigneeDetails={
																							assigneeDetails
																						}
																						isLoadingAssignees={
																							isLoadingAssignees
																						}
																						size="small"
																					/>
																				</div>
																			) : (
																				<span className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600">
																					No
																					administrator
																				</span>
																			)}
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

				{/* Single Centered Empty State */}
				<div className="flex-1">
					<GanttEmptyState
						viewType={viewType}
						onCreateTask={() => setShowCreateTask(true)}
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
	}

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950">
			{/* Filters */}
			<GanttFilters
				searchTerm={searchTerm}
				setSearchTerm={setSearchTerm}
				filterConfig={filterConfig}
				toggleCompletedFilter={toggleCompletedFilter}
				togglePriorityFilter={togglePriorityFilter}
				toggleDueStatusFilter={toggleDueStatusFilter}
				onClearFilters={clearFilters}
				onCreateTask={() => setShowCreateTask(true)}
				visibleRange={visibleRange}
				navigatePrevious={navigatePrevious}
				navigateNext={navigateNext}
				resetToToday={resetToToday}
				timelineScale={timelineScale}
				zoomIn={zoomIn}
				zoomOut={zoomOut}
				viewType={viewType}
				toggleViewType={toggleViewType}
				setSpecificViewType={setSpecificViewType}
				searchContext={{
					isSearchActive: searchOverlay.isVisible,
					totalResults: searchOverlay.totalResults,
					visibleResults: 0,
					outsideCurrentView: 0,
				}}
			/>

			{/* Search Results Overlay */}
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
														viewType
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
																		<StatusBadge
																			columnTitle={
																				task.columnTitle
																			}
																			isCompletionColumn={
																				task.isCompletionColumn
																			}
																		/>
																	</div>

																	{/* Administrator */}
																	<div className="flex items-center">
																		{task.administrator_id ? (
																			<div className="flex items-center">
																				<span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mr-2 flex items-center">
																					<User className="w-3 h-3 mr-1" />
																					Administrator
																				</span>
																				<AssigneeAvatars
																					assigneeIds={[
																						task.administrator_id,
																					]}
																					assigneeDetails={
																						assigneeDetails
																					}
																					isLoadingAssignees={
																						isLoadingAssignees
																					}
																					size="small"
																				/>
																			</div>
																		) : (
																			<span className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600">
																				No
																				administrator
																			</span>
																		)}
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

			{/* Fixed Header Row - Contains both task list header and timeline header */}
			<div className="flex flex-shrink-0 z-30 bg-white dark:bg-gray-900 midnight:bg-gray-950">
				{/* Task List Header */}
				<div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 midnight:border-gray-800">
					<GanttTaskListHeader
						cards={sortedFilteredCards}
						handleSort={handleSort}
						sortConfig={sortConfig}
					/>
				</div>

				{/* Timeline Header */}
				<div className="flex-1 min-w-0" ref={timelineContainerRef}>
					<GanttTimeline
						timelineHeaders={{ ...timelineHeaders, days: safeDays }}
						cellWidth={finalCellWidth}
						containerWidth={totalTimelineWidth}
						viewType={viewType}
					/>
				</div>
			</div>

			{/* Unified Scrollable Content Area */}
			<div className="flex-1 flex overflow-hidden">
				<div
					className="flex-1 overflow-auto bg-white dark:bg-gray-900 midnight:bg-slate-950"
					ref={unifiedScrollRef}
				>
					<div className="flex">
						{/* Task List Content */}
						<div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 midnight:border-gray-800 bg-gray-50/50 dark:bg-gray-900 midnight:bg-gray-900/50">
							<GanttTaskList
								cards={sortedFilteredCards}
								assigneeDetails={assigneeDetails}
								isLoadingAssignees={isLoadingAssignees}
								setSelectedCard={setSelectedCard}
								renderHeaderOnly={false}
								handleSort={handleSort}
								sortConfig={sortConfig}
							/>
						</div>

						{/* Timeline Content */}
						<div
							className="flex-1 min-w-0 relative"
							style={{
								width: `${totalTimelineWidth}px`,
								minWidth: `${totalTimelineWidth}px`,
							}}
						>
							{/* Background Grid */}
							<div
								className="absolute inset-0"
								style={{
									width: `${totalTimelineWidth}px`,
									minWidth: `${totalTimelineWidth}px`,
									minHeight:
										sortedFilteredCards.length > 0
											? `${
													sortedFilteredCards.length *
													140
											  }px`
											: "400px",
								}}
							>
								{Array.from({
									length: sortedFilteredCards.length,
								}).map((_, rowIndex) => (
									<div
										key={`background-row-${rowIndex}`}
										className={`relative h-[140px] border-b border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 ${
											rowIndex % 2 === 0
												? "bg-white dark:bg-gray-900 midnight:bg-gray-950"
												: "bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-900/80"
										}`}
										style={{
											width: `${totalTimelineWidth}px`,
											minWidth: `${totalTimelineWidth}px`,
										}}
									>
										<div className="absolute inset-0 flex">
											{safeDays.map((day, dayIndex) => {
												const isToday = day.isToday;
												const isWeekend = day.isWeekend;

												let columnWidth;
												if (
													timelineScale === 1 &&
													containerWidth > 0
												) {
													// Use the same calculation as GanttTimeline header for consistency
													columnWidth = `${
														containerWidth /
														safeDays.length
													}px`;
												} else {
													columnWidth = `${finalCellWidth}px`;
												}

												return (
													<div
														key={`grid-cell-${rowIndex}-${dayIndex}-${day.date.toISOString()}`}
														className={`flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 relative ${
															isToday
																? "bg-blue-500/8 dark:bg-blue-500/8 midnight:bg-blue-500/5"
																: isWeekend
																? "bg-gray-100/20 dark:bg-gray-800/20 midnight:bg-gray-900/20"
																: ""
														}`}
														style={{
															width: columnWidth,
															minWidth:
																timelineScale ===
																	1 &&
																containerWidth >
																	0
																	? `${
																			containerWidth /
																			safeDays.length
																	  }px`
																	: `${finalCellWidth}px`,
															maxWidth:
																timelineScale ===
																	1 &&
																containerWidth >
																	0
																	? `${
																			containerWidth /
																			safeDays.length
																	  }px`
																	: `${finalCellWidth}px`,
															height: "140px",
														}}
													>
														{isToday && (
															<div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-blue-500 dark:bg-blue-400 midnight:bg-blue-300 opacity-80 z-20"></div>
														)}
													</div>
												);
											})}
										</div>
									</div>
								))}
							</div>

							{/* Task Bars Overlay */}
							<div className="relative z-10">
								{sortedFilteredCards.map((card, rowIndex) => {
									const isHighlighted =
										isTaskHighlighted(card);
									const taskBar = getTaskBarStyle(
										card,
										visibleRange,
										finalCellWidth,
										containerWidth,
										timelineScale,
										viewType,
										false
									);

									if (!taskBar) return null;

									const keyDate = visibleRange.startDate
										? visibleRange.startDate.toISOString()
										: `range-${rowIndex}`;

									return (
										<div
											key={`${card.id}-${keyDate}`}
											className={`absolute left-0 right-0 transition-all duration-500 ${
												isHighlighted
													? "ring-4 ring-blue-400 ring-offset-2 scale-105 z-20"
													: ""
											}`}
											style={{
												top: `${rowIndex * 140}px`,
												height: "140px",
												width: `${totalTimelineWidth}px`,
												minWidth: `${totalTimelineWidth}px`,
												pointerEvents: "none",
											}}
										>
											<div
												className="relative w-full h-full hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-800/20 transition-all duration-200 cursor-pointer"
												style={{
													pointerEvents: "auto",
												}}
											>
												<GanttTaskBar
													card={card}
													taskBar={taskBar}
													cellWidth={finalCellWidth}
													setSelectedCard={
														setSelectedCard
													}
													onUpdateProgress={
														handleUpdateProgress
													}
													columns={columns}
													viewType={viewType}
													isSearchResult={false}
												/>

												{/* Highlight pulse effect */}
												{isHighlighted && (
													<div className="absolute inset-0 bg-blue-400/20 rounded animate-pulse pointer-events-none"></div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</div>
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

export default GanttView;
