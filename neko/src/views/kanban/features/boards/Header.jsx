import { useState, useEffect, useRef } from "react";
import { useSearch } from "../shared/hooks/useSearch";
import KanbanFilters from "../shared/components/KanbanFilters";
import { useCardContext } from "../../../context/CardContext";

// Function to generate project-specific filter storage key
const getFilterStorageKey = (projectId) =>
	`kanban-filters-project-${projectId || "default"}`;

// Function to load filters from localStorage for a specific project
function loadLocalFilters(projectId) {
	try {
		const storedFilters = localStorage.getItem(
			getFilterStorageKey(projectId)
		);
		if (storedFilters) {
			return JSON.parse(storedFilters);
		}
	} catch (error) {
		console.error("Error loading filters from localStorage:", error);
	}
	// Default empty filters if none found
	return {
		priority: [],
		dueDates: [],
		assignments: [],
	};
}

// Function to save filters to localStorage for a specific project
function saveLocalFilters(filters, projectId) {
	try {
		localStorage.setItem(
			getFilterStorageKey(projectId),
			JSON.stringify(filters)
		);
		return true;
	} catch (error) {
		console.error("Error saving filters to localStorage:", error);
		return false;
	}
}

// Function to clear filters from localStorage for a specific project
function clearLocalFilters(projectId) {
	try {
		localStorage.removeItem(getFilterStorageKey(projectId));
		return true;
	} catch (error) {
		console.error("Error clearing filters from localStorage:", error);
		return false;
	}
}

// Helper function to check if a date is due today
const isDueToday = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);

	return due.getTime() === today.getTime();
};

// Helper function to check if a date is due this week
const isDueThisWeek = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);

	// Calculate the start and end of the current week
	const startOfWeek = new Date(today);
	startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

	return due >= startOfWeek && due <= endOfWeek;
};

// Helper function to check if a date is due next week
const isDueNextWeek = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);

	// Calculate the start and end of next week
	const startOfNextWeek = new Date(today);
	startOfNextWeek.setDate(today.getDate() - today.getDay() + 7); // Next Sunday

	const endOfNextWeek = new Date(startOfNextWeek);
	endOfNextWeek.setDate(startOfNextWeek.getDate() + 6); // Next Saturday

	return due >= startOfNextWeek && due <= endOfNextWeek;
};

// Helper function to check if a date is due this month
const isDueThisMonth = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	const due = new Date(dueDate);

	return (
		due.getMonth() === today.getMonth() &&
		due.getFullYear() === today.getFullYear()
	);
};

// Helper function to check if a date is due next month
const isDueNextMonth = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	const nextMonth = new Date(today);
	nextMonth.setMonth(today.getMonth() + 1);

	const due = new Date(dueDate);

	return (
		due.getMonth() === nextMonth.getMonth() &&
		due.getFullYear() === nextMonth.getFullYear()
	);
};

// Helper function to check if a date is due this year
const isDueThisYear = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	const due = new Date(dueDate);

	return due.getFullYear() === today.getFullYear();
};

// Helper function to check if a date is due next year
const isDueNextYear = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	const due = new Date(dueDate);

	return due.getFullYear() === today.getFullYear() + 1;
};

// Helper function to check if a date is overdue
const isOverdue = (dueDate) => {
	if (!dueDate) return false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);

	return due < today;
};

const Header = ({
	zoomLevel,
	onZoomIn,
	onZoomOut,
	onResetZoom,
	columns, // Original columns from KanbanBoard
	onFiltersChanged, // Callback to send filtered columns back to KanbanBoard
	onFilterLoadingChange, // New prop to expose loading state to parent
	projectId, // Add projectId prop
}) => {
	const { userId: contextUserId } = useCardContext(); // Get userId from context
	const searchContainerRef = useRef(null);

	// Filter state
	const [activeFilters, setActiveFilters] = useState({
		priority: [],
		dueDates: [],
		assignments: [], // Add assignments filter array
	});

	// Track if we've loaded the filters from localStorage
	const [filtersLoaded, setFiltersLoaded] = useState(false);
	// Add loading state to prevent flashing unfiltered content
	const [isFilterLoading, setIsFilterLoading] = useState(true);

	const {
		searchTerm,
		setSearchTerm,
		searchResults,
		suggestions,
		isSearching,
		navigateToResult,
		handleSuggestionClick,
		clearSearch,
	} = useSearch();

	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const [showResults, setShowResults] = useState(false);

	// Reset filters when project changes
	useEffect(() => {
		// Reset the filtersLoaded state when projectId changes
		// This will trigger the filter loading effect to run again
		setFiltersLoaded(false);
	}, [projectId]);
	// Load filters from localStorage on initial mount or when projectId changes
	useEffect(() => {
		if (!filtersLoaded) {
			const loadFilters = async () => {
				// Start the loading state
				setIsFilterLoading(true);
				// Notify parent component about loading state
				if (onFilterLoadingChange) {
					onFilterLoadingChange(true);
				}

				// Record the start time
				const startTime = Date.now();

				// Load filters from localStorage for this specific project
				const savedFilters = loadLocalFilters(projectId);
				setActiveFilters(savedFilters);

				// Calculate elapsed time
				const elapsedTime = Date.now() - startTime;
				const minDisplayTime = 100; // minimum display time in ms (0.1 second)

				// If the filter loaded too quickly, wait a bit longer to prevent flashing
				if (elapsedTime < minDisplayTime) {
					await new Promise((resolve) =>
						setTimeout(resolve, minDisplayTime - elapsedTime)
					);
				}

				// Complete loading
				setFiltersLoaded(true);
				setIsFilterLoading(false);
				// Notify parent component about loading state
				if (onFilterLoadingChange) {
					onFilterLoadingChange(false);
				}
			};

			loadFilters();
		}
	}, [filtersLoaded, onFilterLoadingChange, projectId]);

	// Apply filtering when columns or filters change
	useEffect(() => {
		// Skip if columns are not ready or we're still loading filters
		if (!Array.isArray(columns) || isFilterLoading) return;

		const sessionUserId = sessionStorage.getItem("userId");

		// Use contextUserId as primary, fall back to sessionUserId
		const currentUserId = contextUserId || sessionUserId;
		const newFilteredColumns = columns
			// First, determine if a column should be visible based on its cards
			.filter((column) => {
				// For card-level filters, check if the column has ANY cards that match
				if (
					activeFilters.priority?.length > 0 ||
					activeFilters.dueDates?.length > 0 ||
					activeFilters.assignments?.length > 0 // Add assignments filter check
				) {
					// Ensure column has cards
					if (
						!Array.isArray(column.Cards) ||
						column.Cards.length === 0
					) {
						return false;
					}

					// Check if ANY card in this column matches the active filters
					return column.Cards.some((card) => {
						// Check priority filter
						if (
							activeFilters.priority?.length > 0 &&
							!activeFilters.priority.includes(card.priority)
						) {
							return false;
						}

						// Check due date filter
						if (activeFilters.dueDates?.length > 0) {
							let matchesDueDate = false;

							for (const dateFilter of activeFilters.dueDates) {
								if (
									dateFilter === "today" &&
									isDueToday(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "thisWeek" &&
									isDueThisWeek(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "nextWeek" &&
									isDueNextWeek(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "thisMonth" &&
									isDueThisMonth(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "nextMonth" &&
									isDueNextMonth(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "thisYear" &&
									isDueThisYear(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "nextYear" &&
									isDueNextYear(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								} else if (
									dateFilter === "overdue" &&
									isOverdue(card.dueDate)
								) {
									matchesDueDate = true;
									break;
								}
							}

							if (!matchesDueDate) {
								return false;
							}
						}

						// Check assignments filter - UPDATED LOGIC
						if (
							activeFilters.assignments?.length > 0 &&
							currentUserId
						) {
							// Check if "assignedToMe" filter is active
							if (
								activeFilters.assignments.includes(
									"assignedToMe"
								)
							) {
								// Check if card is assigned to current user
								let isAssignedToMe = false;

								// Check card administrator (single administrator)
								if (card.administrator_id) {
									if (
										typeof card.administrator_id ===
											"object" &&
										card.administrator_id !== null
									) {
										isAssignedToMe =
											card.administrator_id.id ===
											currentUserId;
									} else {
										isAssignedToMe =
											card.administrator_id ===
											currentUserId;
									}
								}

								// If not assigned at card level, check checklist items (multiple assignees for subtasks)
								if (
									!isAssignedToMe &&
									card.checklist &&
									Array.isArray(card.checklist) &&
									card.checklist.length > 0
								) {
									isAssignedToMe = card.checklist.some(
										(item) => {
											if (
												!item.assignees ||
												!Array.isArray(item.assignees)
											)
												return false;

											return item.assignees.some(
												(assignee) => {
													if (
														typeof assignee ===
															"object" &&
														assignee !== null
													) {
														return (
															assignee.id ===
															currentUserId
														);
													}
													return (
														assignee ===
														currentUserId
													);
												}
											);
										}
									);
								}

								// If neither card nor any checklist item is assigned to current user, filter it out
								if (!isAssignedToMe) {
									return false;
								}
							}
						}

						return true;
					});
				}

				// If no active filters, show all columns
				return true;
			})
			// Then, filter the cards in each visible column
			.map((column) => ({
				...column,
				Cards: Array.isArray(column.Cards)
					? column.Cards.filter((card) => {
							// Check priority filter
							if (
								activeFilters.priority?.length > 0 &&
								!activeFilters.priority.includes(card.priority)
							) {
								return false;
							}

							// Check due date filter
							if (activeFilters.dueDates?.length > 0) {
								let matchesDueDate = false;

								for (const dateFilter of activeFilters.dueDates) {
									if (
										dateFilter === "today" &&
										isDueToday(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "thisWeek" &&
										isDueThisWeek(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "nextWeek" &&
										isDueNextWeek(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "thisMonth" &&
										isDueThisMonth(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "nextMonth" &&
										isDueNextMonth(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "thisYear" &&
										isDueThisYear(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "nextYear" &&
										isDueNextYear(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									} else if (
										dateFilter === "overdue" &&
										isOverdue(card.dueDate)
									) {
										matchesDueDate = true;
										break;
									}
								}

								if (!matchesDueDate) {
									return false;
								}
							}

							// Check assignments filter - UPDATED LOGIC
							if (
								activeFilters.assignments?.length > 0 &&
								currentUserId
							) {
								// Check if "assignedToMe" filter is active
								if (
									activeFilters.assignments.includes(
										"assignedToMe"
									)
								) {
									// Check if card is assigned to current user
									let isAssignedToMe = false;

									// Check card administrator (single administrator)
									if (card.administrator_id) {
										if (
											typeof card.administrator_id ===
												"object" &&
											card.administrator_id !== null
										) {
											isAssignedToMe =
												card.administrator_id.id ===
												currentUserId;
										} else {
											isAssignedToMe =
												card.administrator_id ===
												currentUserId;
										}
									}

									// If not assigned at card level, check checklist items (multiple assignees for subtasks)
									if (
										!isAssignedToMe &&
										card.checklist &&
										Array.isArray(card.checklist) &&
										card.checklist.length > 0
									) {
										isAssignedToMe = card.checklist.some(
											(item) => {
												if (
													!item.assignees ||
													!Array.isArray(
														item.assignees
													)
												)
													return false;

												return item.assignees.some(
													(assignee) => {
														if (
															typeof assignee ===
																"object" &&
															assignee !== null
														) {
															return (
																assignee.id ===
																currentUserId
															);
														}
														return (
															assignee ===
															currentUserId
														);
													}
												);
											}
										);
									}

									// If neither card nor any checklist item is assigned to current user, filter it out
									if (!isAssignedToMe) {
										return false;
									}
								}
							}

							return true;
					  })
					: [],
			}));

		// Send the filtered columns back to KanbanBoard
		if (onFiltersChanged) {
			onFiltersChanged(newFilteredColumns);
		}
	}, [
		columns,
		activeFilters,
		onFiltersChanged,
		isFilterLoading,
		contextUserId,
	]);

	const handleSearchFocus = () => {
		setIsSearchFocused(true);
		setShowResults(true);
	};

	const handleSearchBlur = (e) => {
		// Don't hide results if clicking inside the results container
		if (searchContainerRef.current?.contains(e.relatedTarget)) {
			return;
		}
		setIsSearchFocused(false);
		// Add a delay before hiding to allow for clicks
		setTimeout(() => setShowResults(false), 200);
	};

	const handleSearchInput = (e) => {
		setSearchTerm(e.target.value);
		setShowResults(true);
	};

	const handleKeyDown = (e) => {
		// Handle keyboard navigation in the search results
		if (e.key === "Escape") {
			clearSearch();
			setShowResults(false);
			e.target.blur();
		} else if (e.key === "Enter" && searchResults.length > 0) {
			// Select the first result on Enter
			navigateToResult(searchResults[0]);
			setShowResults(false);
		}
	};

	// Handle clicks outside to close the search results
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (
				searchContainerRef.current &&
				!searchContainerRef.current.contains(event.target)
			) {
				setShowResults(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Modified to save filter to localStorage with project ID
	const handleApplyFilters = async (filters) => {
		setActiveFilters(filters);

		// Save filters to localStorage with project ID
		if (
			(filters.priority && filters.priority.length > 0) ||
			(filters.dueDates && filters.dueDates.length > 0) ||
			(filters.assignments && filters.assignments.length > 0)
		) {
			saveLocalFilters(filters, projectId);
		} else {
			// If no filters are selected, clear localStorage for this project
			clearLocalFilters(projectId);
		}
	};

	// Updated clear filters function to use project ID
	const handleClearFilters = () => {
		// Clear filters in the UI
		setActiveFilters({
			priority: [],
			dueDates: [],
			assignments: [], // Add assignments filter type
		});

		// Clear filters from localStorage for this project
		clearLocalFilters(projectId);
	};

	// Individual filter toggle functions
	const togglePriorityFilter = (priority) => {
		const newFilters = {
			...activeFilters,
			priority: activeFilters.priority.includes(priority)
				? activeFilters.priority.filter((p) => p !== priority)
				: [...activeFilters.priority, priority],
		};
		handleApplyFilters(newFilters);
	};

	const toggleDueDateFilter = (dateFilter) => {
		const newFilters = {
			...activeFilters,
			dueDates: activeFilters.dueDates.includes(dateFilter)
				? activeFilters.dueDates.filter((d) => d !== dateFilter)
				: [...activeFilters.dueDates, dateFilter],
		};
		handleApplyFilters(newFilters);
	};

	const toggleAssignedToMeFilter = () => {
		const currentUserId = contextUserId || sessionStorage.getItem("userId");
		if (!currentUserId) return;

		const assignedToMeValue = "assignedToMe";
		const newFilters = {
			...activeFilters,
			assignments: activeFilters.assignments.includes(assignedToMeValue)
				? activeFilters.assignments.filter(
						(a) => a !== assignedToMeValue
				  )
				: [...activeFilters.assignments, assignedToMeValue],
		};
		handleApplyFilters(newFilters);
	};

	// Calculate if any filters are active
	const hasActiveFilters =
		activeFilters &&
		((activeFilters.priority && activeFilters.priority.length > 0) ||
			(activeFilters.dueDates && activeFilters.dueDates.length > 0) ||
			(activeFilters.assignments &&
				activeFilters.assignments.length > 0)); // Add assignments check

	// Count total active filters
	const activeFilterCount =
		(activeFilters?.priority?.length || 0) +
		(activeFilters?.dueDates?.length || 0) +
		(activeFilters?.assignments?.length || 0); // Add assignments count

	return (
		<div>
			<KanbanFilters
				searchTerm={searchTerm}
				setSearchTerm={setSearchTerm}
				searchResults={searchResults}
				suggestions={suggestions}
				isSearching={isSearching}
				navigateToResult={navigateToResult}
				handleSuggestionClick={handleSuggestionClick}
				clearSearch={clearSearch}
				isSearchFocused={isSearchFocused}
				setIsSearchFocused={setIsSearchFocused}
				showResults={showResults}
				setShowResults={setShowResults}
				searchContainerRef={searchContainerRef}
				handleSearchInput={handleSearchInput}
				handleSearchFocus={handleSearchFocus}
				handleSearchBlur={handleSearchBlur}
				handleKeyDown={handleKeyDown}
				activeFilters={activeFilters}
				togglePriorityFilter={togglePriorityFilter}
				toggleDueDateFilter={toggleDueDateFilter}
				toggleAssignedToMeFilter={toggleAssignedToMeFilter}
				onClearFilters={handleClearFilters}
				session={{
					user: {
						id: contextUserId || sessionStorage.getItem("userId"),
					},
				}}
				searchContext={{
					isSearchActive: !!searchTerm,
					totalResults: searchResults.length,
				}}
				zoomLevel={zoomLevel}
				onZoomIn={onZoomIn}
				onZoomOut={onZoomOut}
				onResetZoom={onResetZoom}
			/>
		</div>
	);
};

export default Header;
