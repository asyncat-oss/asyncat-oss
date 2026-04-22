import {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { createPortal } from "react-dom";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	MeasuringStrategy,
	pointerWithin,
	getClientRect,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";

import Column from "../columns/components/Column";
import LoadingColumn from "../shared/components/LoadingColumn";
import { useColumnActions } from "../columns/hooks/useColumnActions";
import viewsApi from "../../../viewsApi";

import Card from "../cards/Card";
import AddColumnModal from "../columns/components/AddColumnModal";

import Header from "./Header";
import { Plus, Filter, AlertTriangle } from "lucide-react";

import { useColumnContext } from "../../../context/ColumnContext";
import { useCardContext } from "../../../context/CardContext";
import { useCardActions } from "../../../hooks/useCardActions";
import { keyframes } from "framer-motion";

import { BoardSkeleton } from "../../../context/ColumnProvider";
import { useUser } from "../../../../contexts/UserContext";
import { useParams } from "react-router-dom";

const KanbanBoard = () => {
	const {
		columns: allColumns = [],
		setColumns,
		error,
		loadColumns,
		selectedProject,
	} = useColumnContext();
	const { setSelectedCard, deletingCards } = useCardContext();
	const { moveCard } = useCardActions();
	const { getUserRole, hasPermission, userId } = useUser();
	keyframes;
	const { handleColumnDelete: deleteColumn } = useColumnActions();

	const [showAddColumnModal, setShowAddColumnModal] = useState(false);
	const [zoomLevel, setZoomLevel] = useState(80);
	const [activeItemId, setActiveItemId] = useState(null);
	const [activeDragItem, setActiveDragItem] = useState(null);
	const [filteredColumns, setFilteredColumns] = useState();
	const [isFilterLoading, setIsFilterLoading] = useState(true);
	const [draggingCardId, setDraggingCardId] = useState(null);
	const [draggingOverColumnId, setDraggingOverColumnId] = useState(null);
	const [dropIndicator, setDropIndicator] = useState(null); // { columnId, position }
	const [pendingOperations, setPendingOperations] = useState({
		addingColumn: false,
		addingCard: null,
		deletingColumns: [],
		movingCardId: null,
		moveCardError: null,
	});

	const previousColumnsRef = useRef(null);
	// Store original columns arrangement before drag
	const originalColumnsRef = useRef(null);
	// Store the original active column index and data
	const activeDragInfoRef = useRef(null);
	// Ref to the kanban container
	const kanbanContainerRef = useRef(null);

	// Extract project ID - prefer URL param, then columns, then session storage.
	const params = useParams();
	const projectId = useMemo(() => {
		// 1) Prefer explicit :projectId from the route if available (this is set immediately after creating/selecting a project)
		if (params?.projectId) return params.projectId;

		// 2) Fallback to columns data when they exist
		if (
			Array.isArray(allColumns) &&
			allColumns.length > 0 &&
			allColumns[0].projectId
		) {
			return allColumns[0].projectId;
		}

		// 3) Last resort: session storage (keeps value across reloads)
		return sessionStorage.getItem("projectId");
	}, [params?.projectId, allColumns?.length > 0 ? allColumns[0]?.projectId : null]);

	// Persist projectId so other parts of the app that still rely on sessionStorage update immediately
	useEffect(() => {
		if (projectId) {
			try {
				sessionStorage.setItem("projectId", String(projectId));
			} catch (e) {
				// ignore storage errors
			}
		}
	}, [projectId]);

	// Derive user role: prefer selectedProject metadata, then user context
	const derivedUserRole = useMemo(() => {
		if (selectedProject) {
			// Prefer owner_id match (most reliable for newly created projects)
			if (
				selectedProject.owner_id &&
				userId &&
				String(selectedProject.owner_id) === String(userId)
			) {
				return "owner";
			}
			// Use user_role if available
			if (selectedProject.user_role) return selectedProject.user_role;
		}

		// Fallback to global user role mapping
		return getUserRole(projectId);
	}, [
		selectedProject,
		userId,
		getUserRole,
		projectId,
	]);

	const canManageColumns = useMemo(() => {
		if (derivedUserRole === "owner") return true;
		return hasPermission("canManageFeatures", projectId);
	}, [derivedUserRole, hasPermission, projectId]);

	const isOwner = derivedUserRole === "owner";

	useEffect(() => {
		// Reset filtered columns when switching projects so the filter state doesn't bleed between projects
		setFilteredColumns((prev) => {
			// If this is a different project or there is no previous filter, initialize to the current columns
			return Array.isArray(allColumns) ? allColumns : undefined;
		});
		// Ensure ColumnContext has loaded columns (no-op if already loaded)
		if (!Array.isArray(allColumns)) {
			setColumns();
		}
	}, [allColumns, setColumns, filteredColumns]);

	useEffect(() => {
		setPendingOperations((previousOperations) => {
			const updatedDeletingColumns =
				previousOperations.deletingColumns.filter((deletingId) =>
					allColumns.some((column) => column.id === deletingId)
				);
			if (
				updatedDeletingColumns.length !==
				previousOperations.deletingColumns.length
			) {
				return {
					...previousOperations,
					deletingColumns: updatedDeletingColumns,
				};
			}
			return previousOperations;
		});
	}, [allColumns]);


	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			scrollBehavior: "smooth",
		})
	);

	const findContainer = useCallback(
		(id) => {
			if (!Array.isArray(allColumns)) return null;

			const targetColumn = allColumns.find((column) => column.id === id);
			if (targetColumn) return targetColumn;

			return allColumns.find((column) => {
				const columnCards = Array.isArray(column.Cards)
					? column.Cards
					: [];
				return columnCards.some((card) => card.id === id);
			});
		},
		[allColumns]
	);

	const handleDragStart = (event) => {
		const { active } = event;
		const activeContainer = findContainer(active.id);


		// Store the current columns state
		if (Array.isArray(allColumns)) {
			originalColumnsRef.current = [...allColumns];

			// When dragging a column, store its original index and ID for later use
			if (active.data.current?.type === "column") {
				const activeIndex = allColumns.findIndex(
					(col) => col.id === active.id
				);
				activeDragInfoRef.current = {
					id: active.id,
					index: activeIndex,
					columnData: allColumns[activeIndex],
				};
			}
		}

		setActiveItemId(active.id);
		if (activeContainer) {
			if (active.data.current?.type === "column") {
				setActiveDragItem({
					...activeContainer,
					type: "column",
					zoomLevel,
				});
				// Clear draggingCardId when dragging columns
				setDraggingCardId(null);
			} else {
				const activeCards = Array.isArray(activeContainer.Cards)
					? [...activeContainer.Cards]
					: [];
				const activeCard = activeCards.find(
					(card) => card.id === active.id
				);
				if (activeCard) {
					setActiveDragItem({
						...activeCard,
						type: "card",
						zoomLevel,
					});
					previousColumnsRef.current = [...allColumns];
					setPendingOperations((prev) => ({
						...prev,
						movingCardId: active.id,
						moveCardError: null,
					}));
					setDraggingCardId(active.id);
				}
			}
		}
	};

	const handleDragOver = (event) => {
		const { active, over, activatorEvent, delta } = event;
		if (!over || !Array.isArray(allColumns)) return;

		// Track which column we're dragging over
		if (draggingCardId && over) {
			let targetColumnId = null;
			let dropPosition = null;

			// Use the active element's translated position (center Y coordinate)
			const activeRect = active?.rect?.current?.translated;
			const pointerPosition = activeRect ? activeRect.top + (activeRect.height / 2) : 0;

			// If over a column directly
			if (over.data.current?.type === "column") {
				targetColumnId = over.id;

				// Calculate drop position for visual feedback (using live pointer Y)
				const columnElement = document.getElementById(
					`column-${over.id}`
				);
				const targetColumn = allColumns.find(
					(col) => col.id === over.id
				);
				const destCards = Array.isArray(targetColumn?.Cards)
					? targetColumn.Cards
					: [];

				if (columnElement && destCards.length > 0) {
					// Filter out the dragged card from visible cards for position calculation
					const visibleCards = destCards.filter(
						(card) => card.id !== draggingCardId
					);
					const cardElements = visibleCards
						.map((card) =>
							document.getElementById(`card-${card.id}`)
						)
						.filter(Boolean);

					if (cardElements.length === 0) {
						dropPosition = 0;
					} else {
						let insertIndex = visibleCards.length; // Default to end

						// Get column content area (excluding header) - using viewport coordinates
						const columnRect =
							columnElement.getBoundingClientRect();
						const columnHeaderHeight = 80; // Approximate header height
						const columnContentTop =
							columnRect.top + columnHeaderHeight;
						const topDropZone = columnContentTop + 40; // Top 40px of content area

						// Get the last card's position for bottom drop zone - using viewport coordinates
						const lastCardElement =
							cardElements[cardElements.length - 1];
						const lastCardRect = lastCardElement
							? lastCardElement.getBoundingClientRect()
							: null;
						const bottomDropZone = lastCardRect
							? lastCardRect.bottom + 20
							: columnRect.bottom - 60;

						// If pointer is in the top drop zone, always place at beginning
						if (pointerPosition <= topDropZone) {
							insertIndex = 0;
						}
						// If pointer is in the bottom drop zone, always place at end
						else if (pointerPosition >= bottomDropZone) {
							insertIndex = visibleCards.length;
						} else {
							// Otherwise, find position based on card boundaries
							for (let i = 0; i < cardElements.length; i++) {
								const cardRect =
									cardElements[i].getBoundingClientRect();
								const cardCenterY =
									cardRect.top + cardRect.height / 2;

								if (pointerPosition < cardCenterY) {
									insertIndex = i;
									break;
								}
							}
						}

						// Convert visible card index back to original card index
						// This accounts for the dragged card's original position
						// Convert visible index back to original: for same column no +1 offset; we already excluded dragged card
						dropPosition = insertIndex;
					}
				} else {
					dropPosition = 0;
				}
			}
			// If over a card, find its column
			else if (over.data.current?.type === "card") {
				// Find the column that contains this card
				const overColumn = findContainer(over.id);
				if (overColumn) {
					targetColumnId = overColumn.id;

					// Calculate drop position relative to the card
					const destCards = Array.isArray(overColumn.Cards)
						? overColumn.Cards
						: [];
					const overCardIndex = destCards.findIndex(
						(card) => card.id === over.id
					);

					if (overCardIndex !== -1) {
						const overElement = document.getElementById(
							`card-${over.id}`
						);

						if (overElement) {
							const rect = overElement.getBoundingClientRect();
							const centerY = rect.top + rect.height / 2;

							dropPosition =
								pointerPosition < centerY
									? overCardIndex
									: overCardIndex + 1;
						} else {
							dropPosition = overCardIndex;
						}
					}
				}
			}

			if (targetColumnId) {
				setDraggingOverColumnId(targetColumnId);

				// Set drop indicator for visual feedback
				setDropIndicator({
					columnId: targetColumnId,
					position: dropPosition,
				});

				// Check if this would be an invalid move to a completion column
				const targetColumn = allColumns.find(
					(col) => col.id === targetColumnId
				);
				const activeContainer = findContainer(active.id);
				const activeCards = Array.isArray(activeContainer?.Cards)
					? activeContainer.Cards
					: [];
				const activeCard = activeCards.find(
					(card) => card.id === active.id
				);

				if (targetColumn?.isCompletionColumn && activeCard) {
					// Check if card has incomplete subtasks
					const hasIncompleteSubtasks =
						activeCard.checklist &&
						Array.isArray(activeCard.checklist) &&
						activeCard.checklist.length > 0 &&
						!activeCard.checklist.every((task) => task.completed);

					// Store this information for visual feedback
					setPendingOperations((prev) => ({
						...prev,
						wouldBeBlocked: hasIncompleteSubtasks,
						blockReason: hasIncompleteSubtasks
							? "Complete all subtasks before moving to completion column"
							: null,
					}));
				} else {
					// Clear the would-be-blocked state
					setPendingOperations((prev) => ({
						...prev,
						wouldBeBlocked: false,
						blockReason: null,
					}));
				}
			}
		}

		// Handle column dragging
		if (active.data.current?.type === "column") {
			const activeColumnIndex = allColumns.findIndex(
				(column) => column.id === active.id
			);
			const overColumnIndex = allColumns.findIndex(
				(column) => column.id === over.id
			);

			// Skip invalid or same position
			if (
				activeColumnIndex === -1 ||
				overColumnIndex === -1 ||
				activeColumnIndex === overColumnIndex
			) {
				return;
			}

			// This is critical: Update columns during drag for visual feedback
			setColumns((columns) => {
				return arrayMove(columns, activeColumnIndex, overColumnIndex);
			});
		}
	};

	const handleDragEnd = async (event) => {
		const { active, over } = event;

		// Reset all drag state
		setActiveItemId(null);
		setActiveDragItem(null);
		setDraggingCardId(null);
		setDraggingOverColumnId(null);
		setDropIndicator(null); // Clear drop indicator

		// Clear would-be-blocked state
		setPendingOperations((prev) => ({
			...prev,
			wouldBeBlocked: false,
			blockReason: null,
		}));

		if (!over || !Array.isArray(allColumns)) {
			setPendingOperations((prev) => ({ ...prev, movingCardId: null }));
			return;
		}

		if (active.data.current?.type === "column") {
			const visibleColumnsOrder = safeFilteredColumns.map(
				(col) => col.id
			);

			const originalDragInfo = activeDragInfoRef.current;
			if (!originalDragInfo) {
				console.error("Missing original drag information");
				return;
			}

			const originalColumns = originalColumnsRef.current || [];
			const originalColumnById = {};
			originalColumns.forEach((col) => {
				originalColumnById[col.id] = col;
			});

			const orderData = visibleColumnsOrder.map((columnId, index) => ({
				id: columnId,
				order: index,
			}));

			const projectId =
				originalColumns.length > 0
					? originalColumns[0].projectId
					: null;

			try {
				await viewsApi.column.updateOrder(projectId, orderData);
			} catch (error) {
				console.error("Failed to save column order:", error);
				loadColumns();
			}

			activeDragInfoRef.current = null;

			return;
		}

		// Handle card reordering/moving
		const activeContainer = findContainer(active.id);
		const overContainer = findContainer(over.id);

		if (!activeContainer || !overContainer) {
			setPendingOperations((prev) => ({ ...prev, movingCardId: null }));
			return;
		}

		try {
			// Handle card reordering
			const sourceColumnIndex = allColumns.findIndex(
				(column) => column.id === activeContainer.id
			);
			const destColumnIndex = allColumns.findIndex(
				(column) => column.id === overContainer.id
			);

			if (sourceColumnIndex === -1 || destColumnIndex === -1) {
				console.error("Column not found");
				setPendingOperations((prev) => ({
					...prev,
					movingCardId: null,
				}));
				return;
			}

			// IMPORTANT: Sort cards by their order field to ensure consistency
			const sourceCards = Array.isArray(
				allColumns[sourceColumnIndex].Cards
			)
				? [...allColumns[sourceColumnIndex].Cards].sort((a, b) => a.order - b.order)
				: [];

			const destCards =
				sourceColumnIndex === destColumnIndex
					? sourceCards
					: Array.isArray(allColumns[destColumnIndex].Cards)
					? [...allColumns[destColumnIndex].Cards].sort((a, b) => a.order - b.order)
					: [];

			const cardIndex = sourceCards.findIndex(
				(card) => card.id === active.id
			);
			if (cardIndex === -1) {
				console.error("Card not found in source column");
				setPendingOperations((prev) => ({
					...prev,
					movingCardId: null,
				}));
				return;
			}

			const movingCard = sourceCards[cardIndex];
			let destIndex;
			const isSameColumn = sourceColumnIndex === destColumnIndex;

			if (over.id === overContainer.id) {
				// Dropping onto the column itself - calculate position based on pointer location
				const activeRect = active?.rect?.current?.translated;
				const pointerPosition = activeRect ? activeRect.top + (activeRect.height / 2) : 0;
				const columnElement = document.getElementById(
					`column-${over.id}`
				);

				if (columnElement && destCards.length > 0) {
					// Filter out the dragged card ONLY if moving within same column
					const visibleCards = isSameColumn
						? destCards.filter((card) => card.id !== active.id)
						: destCards;

					const cardElements = visibleCards
						.map((card) =>
							document.getElementById(`card-${card.id}`)
						)
						.filter(Boolean);

					if (cardElements.length === 0) {
						// No cards visible, place at the beginning
						destIndex = 0;
					} else {
						// Get column content area (excluding header) - using viewport coordinates
						const columnRect =
							columnElement.getBoundingClientRect();
						const columnHeaderHeight = 80; // Approximate header height
						const columnContentTop =
							columnRect.top + columnHeaderHeight;
						const topDropZone = columnContentTop + 40; // Top 40px of content area

						// Get the last card's position for bottom drop zone - using viewport coordinates
						const lastCardElement =
							cardElements[cardElements.length - 1];
						const lastCardRect = lastCardElement
							? lastCardElement.getBoundingClientRect()
							: null;
						const bottomDropZone = lastCardRect
							? lastCardRect.bottom + 20
							: columnRect.bottom - 60;

						// If pointer is in the top drop zone, always place at beginning
						if (pointerPosition <= topDropZone) {
							destIndex = 0;
						}
						// If pointer is in the bottom drop zone, always place at end
						else if (pointerPosition >= bottomDropZone) {
							// Place at the end of visible cards
							destIndex = visibleCards.length;
						} else {
							// Find the best position based on card boundaries
							let insertIndex = visibleCards.length; // Default to end

							for (let i = 0; i < cardElements.length; i++) {
								const cardRect =
									cardElements[i].getBoundingClientRect();
								const cardCenterY =
									cardRect.top + cardRect.height / 2;

								// If pointer is above the center of this card, insert before it
								if (pointerPosition < cardCenterY) {
									insertIndex = i;
									break;
								}
							}

							destIndex = insertIndex;
						}

						// For same column: destIndex from visibleCards is perfect for splice
						// For different column: destIndex is the direct insert position
					}
				} else {
					// No column element found or empty column, place at the beginning
					destIndex = 0;
				}
			} else {
				// Dropping onto a specific card - calculate position relative to that card
				const overCardIndex = destCards.findIndex(
					(card) => card.id === over.id
				);

				if (overCardIndex === -1) {
					console.error("Destination card not found");
					destIndex = destCards.length;
				} else {
					const activeRect = active?.rect?.current?.translated;
					const pointerPosition = activeRect ? activeRect.top + (activeRect.height / 2) : 0;
					const overElement = document.getElementById(
						`card-${over.id}`
					);

					if (overElement) {
						const rect = overElement.getBoundingClientRect();
						const centerY = rect.top + rect.height / 2;

						// Determine if we should place before or after the target card
						if (pointerPosition < centerY) {
							// Place before the target card
							destIndex = overCardIndex;
						} else {
							// Place after the target card
							destIndex = overCardIndex + 1;
						}

						// For same column: adjust because we're working with full array
						// For different column: no adjustment needed
						if (isSameColumn && destIndex > cardIndex) {
							destIndex -= 1;
						}
					} else {
						// Fallback if element not found
						destIndex = overCardIndex;
					}
				}
			}

			const newColumns = [...allColumns];

			if (sourceColumnIndex === destColumnIndex) {
				const newCards = [...sourceCards];
				newCards.splice(cardIndex, 1);
				newCards.splice(destIndex, 0, movingCard);
				newColumns[sourceColumnIndex] = {
					...newColumns[sourceColumnIndex],
					Cards: newCards,
				};
			} else {
				const newSourceCards = [...sourceCards];
				newSourceCards.splice(cardIndex, 1);
				newColumns[sourceColumnIndex] = {
					...newColumns[sourceColumnIndex],
					Cards: newSourceCards,
				};

				const newDestCards = [...destCards];
				newDestCards.splice(destIndex, 0, movingCard);
				newColumns[destColumnIndex] = {
					...newColumns[destColumnIndex],
					Cards: newDestCards,
				};
			}

			// Optimistic update: Update the UI immediately
			setColumns(newColumns);

			try {
				// Use the moveCard function from useCardActions which includes dependency validation
				const result = await moveCard(
					active.id,
					activeContainer.id,
					overContainer.id,
					destIndex
				);

				// Check if the move was blocked due to dependencies
				if (result && result.blocked) {
					// Revert to the original state
					if (previousColumnsRef.current) {
						setColumns(previousColumnsRef.current);
						previousColumnsRef.current = null;
					} else {
						loadColumns();
					}

					// Show the dependency error message
					setPendingOperations((prev) => ({
						...prev,
						movingCardId: null,
						moveCardError:
							result.reason ||
							"Cannot move card due to unmet dependencies",
					}));

					// Clear the error after a few seconds
					setTimeout(() => {
						setPendingOperations((prev) => ({
							...prev,
							moveCardError: null,
						}));
					}, 5000);

					return;
				}

				// Backend call successful, clear the movingCardId and any error
				setPendingOperations((prev) => ({
					...prev,
					movingCardId: null,
					moveCardError: null,
				}));
			} catch (error) {
				// Check if this is a business logic validation rather than a technical error
				if (
					error.message &&
					error.message.includes("subtasks must be completed")
				) {
					// Business logic validation
				} else {
					console.error("Error moving card:", error);
				}

				// Extract user-friendly error message
				let errorMessage = "Failed to move card. Please try again.";
				if (error.message) {
					if (
						error.message.includes("All subtasks must be completed")
					) {
						errorMessage =
							"Complete all subtasks before moving to completion column";
					} else if (error.message.includes("dependencies")) {
						errorMessage = error.message;
					} else if (error.message.includes("permission")) {
						errorMessage =
							"You don't have permission to move this card";
					} else {
						errorMessage = error.message;
					}
				}

				// Revert to the original state on error
				if (previousColumnsRef.current) {
					setColumns(previousColumnsRef.current);
					previousColumnsRef.current = null;
				} else {
					// Fallback to reloading columns if original state is not available
					loadColumns();
				}

				// Show user-friendly error message
				setPendingOperations((prev) => ({
					...prev,
					movingCardId: active.id, // Keep the card ID to show the error
					moveCardError: errorMessage,
				}));

				// Clear the error after 6 seconds (slightly longer for user to read)
				setTimeout(() => {
					setPendingOperations((prev) => ({
						...prev,
						movingCardId: null,
						moveCardError: null,
					}));
				}, 6000);
			}
		} finally {
			// Ensure activeItemId is reset
		}
	};

	const handleZoomIn = () =>
		setZoomLevel((previousLevel) => Math.min(previousLevel + 10, 200));
	const handleZoomOut = () =>
		setZoomLevel((previousLevel) => Math.max(previousLevel - 10, 50));
	const handleResetZoom = () => setZoomLevel(80);

	const handleAddColumn = () => {
		setPendingOperations((previousOperations) => ({
			...previousOperations,
			addingColumn: true,
		}));
		setShowAddColumnModal(true);
	};

	const handleColumnAdded = () => {
		setPendingOperations((previousOperations) => ({
			...previousOperations,
			addingColumn: false,
		}));
		setShowAddColumnModal(false);
	};

	if (error) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="text-xl font-semibold text-red-500 dark:text-red-400 midnight:text-red-300">
					Error: {error}
				</div>
			</div>
		);
	}

	const safeFilteredColumns = Array.isArray(filteredColumns)
		? filteredColumns
		: [];

	const hasActiveFilters =
		safeFilteredColumns.length !== allColumns.length ||
		safeFilteredColumns.some((col, idx) => {
			// Check if this column exists in original columns but with different cards
			const originalCol = allColumns.find((c) => c.id === col.id);
			return (
				originalCol && originalCol.Cards?.length !== col.Cards?.length
			);
		});

	// Add this new check for card-specific filters
	const hasCardFilters =
		filteredColumns &&
		(() => {
			// Get the filters from the Header component
			const activeFilters = document.querySelector(
				"[data-active-filters]"
			)?.dataset?.activeFilters;
			if (!activeFilters) return false;

			try {
				const filters = JSON.parse(activeFilters);
				return (
					(filters.priority && filters.priority.length > 0) ||
					(filters.tags && filters.tags.length > 0)
				);
			} catch (e) {
				return false;
			}
		})();
	// Check if we should show the Add Column button based on filter state and permissions
	const shouldShowAddColumnButton =
		(canManageColumns || isOwner) &&
		(!hasActiveFilters || safeFilteredColumns.length > 0);

	return (
		<div className="h-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200" style={{ position: 'relative' }}>
			<Header
				zoomLevel={zoomLevel}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetZoom={handleResetZoom}
				columns={allColumns}
				onFiltersChanged={setFilteredColumns}
				onFilterLoadingChange={setIsFilterLoading}
				projectId={projectId} // Pass projectId to Header
			/>
			{/* Show the imported KanbanSkeleton during filter loading */}
			{isFilterLoading ? (
				<BoardSkeleton />
			) : (
				<div className="flex-1 overflow-auto">
					{/* Global Move Error Notification */}
					{pendingOperations.moveCardError && (
						<div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md">
							<div
								className="bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800 rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
								onClick={() =>
									setPendingOperations((prev) => ({
										...prev,
										movingCardId: null,
										moveCardError: null,
									}))
								}
								title="Click to dismiss"
							>
								<div className="flex items-start">
									<AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 midnight:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
									<div>
										<h3 className="text-sm font-medium text-red-800 dark:text-red-300 midnight:text-red-300 mb-1">
											Cannot Move Card
										</h3>
										<p className="text-sm text-red-700 dark:text-red-400 midnight:text-red-400">
											{pendingOperations.moveCardError}
										</p>
										<p className="text-xs text-red-600 dark:text-red-500 midnight:text-red-500 mt-1 italic">
											Click to dismiss
										</p>
									</div>
								</div>
							</div>
						</div>
					)}

					<DndContext
						sensors={sensors}
						collisionDetection={pointerWithin}
						onDragStart={handleDragStart}
						onDragOver={handleDragOver}
						onDragEnd={handleDragEnd}
						measuring={{
							droppable: {
								strategy: MeasuringStrategy.Always,
							},
							draggable: {
								measure: getClientRect,
							},
						}}
					>
						<div className="flex-1 overflow-x-auto p-8">
							<div
								ref={kanbanContainerRef}
								className="flex gap-6"
								style={{
									transform: `scale(${zoomLevel / 100})`,
									transformOrigin: "0 0",
									width: `${100 * (100 / zoomLevel)}%`,
									height: `${100 * (100 / zoomLevel)}%`,
									minHeight: "100%",
									transition:
										"all 500ms cubic-bezier(0.4, 0, 0.2, 1)",
								}}
							>
								<SortableContext
									items={safeFilteredColumns.map(
										(column) => column.id
									)}
									strategy={horizontalListSortingStrategy}
								>
									{safeFilteredColumns.map((column) => (
										<Column
											key={column.id}
											column={column}
											isDeleting={pendingOperations.deletingColumns.includes(
												column.id
											)}
											isAddingCard={
												pendingOperations.addingCard ===
												column.id
											}
											isOver={
												draggingOverColumnId ===
												column.id
											}
											draggingCardId={draggingCardId}
											wouldBeBlocked={
												draggingOverColumnId ===
													column.id &&
												pendingOperations.wouldBeBlocked
											}
											blockReason={
												pendingOperations.blockReason
											}
											dropIndicator={
												dropIndicator?.columnId ===
												column.id
													? dropIndicator
													: null
											}
										>
											{pendingOperations.moveCardError &&
												pendingOperations.movingCardId ===
													column.Cards?.find(
														(c) =>
															c.id ===
															pendingOperations.movingCardId
													)?.id && (
													<div className="absolute top-0 left-0 w-full bg-red-100 text-red-700 p-1 text-sm rounded-sm">
														<AlertTriangle
															className="inline-block mr-1 align-text-top"
															size={14}
														/>
														{
															pendingOperations.moveCardError
														}
													</div>
												)}
										</Column>
									))}
								</SortableContext>
								{pendingOperations.addingColumn && (
									<LoadingColumn />
								)}{" "}
								{/* Only show Add Column button if user has permissions and no conflicting filters */}
								{shouldShowAddColumnButton &&
									(isOwner ? (
										<button
											onClick={handleAddColumn}
											className="flex-shrink-0 w-72 h-16 rounded-xl flex items-center justify-center
                        text-gray-500 dark:text-gray-400 midnight:text-gray-500
                        hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300
                        hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900
                        transition-all duration-200 group"
										>
											<Plus className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200" />
											<span className="font-medium">
												Add Column
											</span>
										</button>
									) : (
										<div
											className="flex-shrink-0 w-72 h-16 rounded-xl flex items-center justify-center
                        text-gray-300 dark:text-gray-600 midnight:text-gray-700
                        bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900
                        cursor-not-allowed opacity-50"
											title={`Only owners can add columns. Your role: ${derivedUserRole}`}
										>
											<Plus className="w-5 h-5 mr-2" />
											<span className="font-medium">
												Add Column
											</span>
										</div>
									))}
							</div>
						</div>
						{createPortal(
							<DragOverlay
								dropAnimation={null}
							>
								{activeDragItem && activeItemId ? (
									<div
										style={{
											transform: `scale(${zoomLevel / 100})`,
											transformOrigin: "0 0",
											width:
												activeDragItem.type === "column"
													? "20rem"
													: "18rem",
											maxHeight:
												activeDragItem.type === "column"
													? "90vh"
													: "auto",
											filter: "drop-shadow(0 25px 25px rgba(0, 0, 0, 0.15))",
											overflow:
												activeDragItem.type === "column"
													? "hidden"
													: "visible",
										}}
									>
										{activeDragItem.type === "column" ? (
											<Column
												column={activeDragItem}
												dragOverlay
											/>
										) : (
											<Card
												card={activeDragItem}
												columnId={
													findContainer(activeItemId)?.id
												}
												dragOverlay
											/>
										)}
									</div>
								) : null}
							</DragOverlay>,
							document.body
						)}
					</DndContext>
				</div>
			)}
			{safeFilteredColumns.length === 0 &&
				hasActiveFilters &&
				!isFilterLoading && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 p-8 rounded-2xl shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10 midnight:ring-white/5 text-center max-w-md">
							<div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-4">
								<Filter className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
							</div>
							<h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
								No matching columns
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								No columns match your current filter criteria.
								Try adjusting your filters.
							</p>
						</div>
					</div>
				)}
			{safeFilteredColumns.length > 0 &&
				safeFilteredColumns.every(
					(column) => column.Cards?.length === 0
				) &&
				hasActiveFilters &&
				hasCardFilters && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 p-8 rounded-2xl shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10 midnight:ring-white/5 text-center max-w-md">
							<div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-4">
								<Filter className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
							</div>
							<h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
								No matching cards
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								None of your cards match the current filter
								criteria. Try adjusting your filters or create
								new cards that match.
							</p>
						</div>
					</div>
				)}{" "}
			{showAddColumnModal && (
				<AddColumnModal
					projectId={projectId}
					onClose={() => {
						setShowAddColumnModal(false);
						setPendingOperations((previousOperations) => ({
							...previousOperations,
							addingColumn: false,
						}));
					}}
					onSuccess={handleColumnAdded}
				/>
			)}
		</div>
	);
};

export default KanbanBoard;
