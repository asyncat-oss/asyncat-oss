import React, { useState, useRef, useCallback } from "react";
import {
	SortableContext,
	verticalListSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Settings, CheckCircle, AlertTriangle } from "lucide-react";
import Card from "../../cards/Card";
import { useColumnContext } from "../../../../context/ColumnContext";
import LoadingCard from "../../shared/components/LoadingCard";
import ColumnSettingsModal from "./ColumnSettingsModal";
import AddCardModal from "../../cards/AddCardModal";
import { useColumnActions } from "../hooks/useColumnActions";

const Column = ({
	column,
	isDragging = false,
	isDeleting = false,
	isAddingCard = false,
	zoomLevel = 90,
	draggingCardId = null, // Add this prop to distinguish between card and column dragging
	isOver = false,
	wouldBeBlocked = false, // New prop to indicate if drop would be blocked
	blockReason = null, // New prop for block reason
	dropIndicator = null, // New prop for drop position indicator
	dragOverlay = false, // New prop to indicate if this is a drag overlay
}) => {
	const { columns } = useColumnContext();
	const { handleColumnDelete } = useColumnActions();
	const [showSettings, setShowSettings] = useState(false);
	const [showAddCard, setShowAddCard] = useState(false);

	const canManageColumn = true;

	// Create a single ref for the entire column element
	const columnRef = useRef(null);

	// Use the sortable hook with a single node ref
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging: isSortableDragging,
	} = useSortable({
		id: column.id,
		data: {
			type: "column",
			column,
		},
	});

	// Set up the ref for the column container
	const setColumnRef = useCallback(
		(node) => {
			// Store a ref locally
			columnRef.current = node;
			// Pass to the sortable's setNodeRef
			setNodeRef(node);
		},
		[setNodeRef]
	);

	const style = {
		opacity: isDeleting
			? 0
			: dragOverlay
			? 1
			: isDragging || isSortableDragging
			? 0
			: undefined,
		transform: isDeleting
			? "scale(0.95)"
			: dragOverlay
			? undefined // No transform for drag overlay
			: isDragging && typeof zoomLevel === "number"
			? `${CSS.Transform.toString(transform)}`
			: CSS.Transform.toString(transform),
		transition: isDeleting
			? "opacity 300ms, transform 300ms"
			: dragOverlay
			? "none"
			: transition,
		width: isDragging || dragOverlay ? "20rem" : undefined,
	};

	// Ensure Cards array is always initialized
	const cards = Array.isArray(column.Cards) ? column.Cards : [];

	// Modified title style to respect dark mode
	const getTitleStyle = () => {
		const isDarkMode = document.documentElement.classList.contains("dark");
		const isMidnightMode =
			document.documentElement.classList.contains("midnight");

		const baseStyles = {
			fontFamily: column.styles?.headerFontFamily || "sans-serif",
			fontSize: column.styles?.headerFontSize || "16px",
			fontWeight: column.styles?.headerFontWeight || "normal",
			fontStyle: column.styles?.headerFontStyle || "normal",
			textDecoration: column.styles?.headerTextDecoration || "none",
		};

		return baseStyles;
	};

	const handleShowSettings = (e) => {
		e.stopPropagation();
		setShowSettings(true);
	};

	const handleColumnDeleteStart = (columnId) => {
		setShowSettings(false);
		setTimeout(() => {
			handleColumnDelete(columnId);
		}, 400);
	};

	return (
		<>
			<div
				id={`column-${column.id}`} // For search feature
				ref={setColumnRef} // Use the single ref for the entire column
				style={style}
				data-column-id={column.id}
				className={`flex-shrink-0 w-80 transition-all duration-300 relative z-0 ${
					isDeleting ? "pointer-events-none" : ""
				} ${isDragging || isSortableDragging ? "z-10" : ""}`}
			>
				{" "}
				<div
					className={`rounded-xl ${
						dragOverlay
							? "max-h-[90vh] overflow-hidden"
							: "min-h-[97vh]"
					} flex flex-col touch-none 
            bg-white dark:bg-gray-900 midnight:bg-gray-950 
            ${
				isDragging || isSortableDragging
					? "shadow-xl ring-2 ring-blue-300/50 dark:ring-blue-600/50 midnight:ring-blue-600/50"
					: "shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10 midnight:ring-white/5 hover:shadow-md"
			} 
            ${
				column.isCompletionColumn
					? "ring-2 ring-green-200 dark:ring-green-800 midnight:ring-green-900"
					: ""
			}
            ${
				// Enhanced visual feedback when cards are being dragged over this column
				isOver && draggingCardId
					? wouldBeBlocked
						? "ring-2 ring-red-400/60 dark:ring-red-600/60 midnight:ring-red-700/60"
						: "ring-2 ring-blue-400/60 dark:ring-blue-600/60 midnight:ring-blue-600/60 shadow-lg"
					: ""
			}
            transition-all duration-300 ease-out`}
				>
					{/* Column Header - only header gets the drag handle listeners */}{" "}
					<div
						className={`p-4 rounded-t-xl flex items-center justify-between cursor-grab active:cursor-grabbing 
              ${
					column.isCompletionColumn
						? "bg-green-50/50 dark:bg-green-900/10 midnight:bg-green-900/5"
						: "bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-gray-900/50"
				}`}
						{...attributes}
						{...listeners}
					>
						<div className="flex items-center">
							{" "}
							<h2
								className="text-[16px] font-semibold text-gray-900 dark:text-white midnight:text-gray-100"
								style={getTitleStyle()}
							>
								{column.title}
							</h2>
							{/* Completion column indicator */}
							{column.isCompletionColumn && (
								<div
									className="ml-2 flex items-center text-green-600 dark:text-green-500 midnight:text-green-400"
									title="Completion Column - Cards here are considered done"
								>
									<CheckCircle className="w-4 h-4" />
								</div>
							)}
						</div>

						<div className="flex items-center gap-2">
							{" "}
							{canManageColumn && (
								<button
									onClick={handleShowSettings}
									className="p-2 rounded-lg
                  hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800
                  text-gray-500 dark:text-gray-400 midnight:text-gray-500
                  transition-colors"
									title="Column settings"
								>
									<Settings className="w-4 h-4" />
								</button>
							)}
							<span className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								{cards.length}
							</span>
						</div>
					</div>
					{/* Cards Container */}{" "}
					<div
						className={`p-4 flex-1 min-h-0 relative
    bg-white dark:bg-gray-900 midnight:bg-gray-950
    ${
		cards.length === 0 && !isAddingCard
			? "flex flex-col justify-center"
			: "space-y-3"
	}
    ${
		// Enhanced styling based on drag state with better visual hierarchy
		isOver && draggingCardId && wouldBeBlocked
			? "bg-red-50/70 dark:bg-red-900/15 midnight:bg-red-900/10 ring-2 ring-red-400/60 dark:ring-red-600/60 midnight:ring-red-700/60 ring-inset rounded-lg backdrop-blur-sm"
			: isOver && draggingCardId
			? "bg-blue-50/70 dark:bg-blue-900/15 midnight:bg-indigo-900/10 ring-2 ring-blue-300/60 dark:ring-blue-700/60 midnight:ring-indigo-700/60 ring-inset rounded-lg backdrop-blur-sm"
			: draggingCardId
			? "bg-gray-50/30 dark:bg-gray-800/30 midnight:bg-gray-900/30" // Subtle background when any card is being dragged
			: ""
	}
    transition-all duration-300 ease-out`}
					>
						{/* Block reason message when dragging incompatible card */}
						{isOver && wouldBeBlocked && blockReason && (
							<div className="mb-3 p-3 bg-red-100 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-300 dark:border-red-700 midnight:border-red-800 rounded-lg">
								<div className="flex items-center text-red-700 dark:text-red-400 midnight:text-red-400">
									<AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
									<span className="text-sm font-medium">
										{blockReason}
									</span>
								</div>
							</div>
						)}
						{cards.length > 0 || isAddingCard ? (
							<>
								<SortableContext
									items={cards
										.filter(
											(card) => card.id !== draggingCardId
										)
										.map((card) => card.id)}
									strategy={verticalListSortingStrategy}
								>
									{cards.map((card, index) => {
										// Skip rendering the dragged card but keep proper indexing for drop indicators
										const isDraggedCard =
											draggingCardId === card.id;

										return (
											<React.Fragment
												key={`${column.id}-${card.id}-${
													card.lastUpdated ||
													card.forceRefresh ||
													index
												}`}
											>
												{/* Top drop indicator - only show once at the beginning */}
												{dropIndicator &&
													dropIndicator.position ===
														0 &&
													index === 0 && (
														<div className="relative">
															<div className="absolute -top-1 left-0 right-0 h-2 bg-blue-400 dark:bg-blue-500 midnight:bg-blue-500 rounded-full mx-2 opacity-80 animate-pulse shadow-sm z-10" />
														</div>
													)}

												{/* Show drop indicator before this card (but not at position 0) */}
												{dropIndicator &&
													dropIndicator.position ===
														index &&
													dropIndicator.position >
														0 && (
														<div className="relative my-1">
															<div className="h-2 bg-blue-400 dark:bg-blue-500 midnight:bg-blue-500 rounded-full mx-2 opacity-80 animate-pulse shadow-sm z-10" />
														</div>
													)}

												{/* Only render the card if it's not being dragged */}
												{!isDraggedCard && (
													<div className="relative">
														<Card
															card={card}
															index={index}
															columnId={column.id}
														/>
													</div>
												)}
											</React.Fragment>
										);
									})}

									{/* Show drop indicator at the end if needed */}
									{dropIndicator &&
										dropIndicator.position >=
											cards.filter(
												(card) =>
													card.id !== draggingCardId
											).length && (
											<div className="relative mt-2 mb-1">
												<div className="h-2 bg-blue-400 dark:bg-blue-500 midnight:bg-blue-500 rounded-full mx-2 opacity-90 animate-pulse shadow-lg z-10">
													<div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-medium text-center leading-none py-0.5">
														Drop at bottom
													</div>
												</div>
											</div>
										)}
								</SortableContext>

								{/* Show loading card if a card is being added to this column */}
								{isAddingCard && <LoadingCard />}

								{/* Bottom drop zone padding - invisible area to catch bottom drops */}
								<div className="h-8 w-full" />
							</>
						) : (
							<div
								className={`p-6 flex-1 
    ${
		// Empty state container - also don't highlight when dragging columns
		isOver && draggingCardId
			? "bg-blue-50/50 dark:bg-blue-900/10 midnight:bg-indigo-900/5 ring-2 ring-blue-200 dark:ring-blue-800 midnight:ring-indigo-800 ring-inset rounded-lg"
			: ""
	}
    transition-all duration-200`}
							>
								{/* Show drop indicator for empty column */}
								{dropIndicator &&
									dropIndicator.position === 0 && (
										<div className="h-1 bg-blue-400 dark:bg-blue-500 midnight:bg-blue-500 rounded-full mx-2 mb-3 opacity-80 animate-pulse"></div>
									)}

								<div className="text-center text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									<div className="text-sm font-medium mb-1">
										Drop cards here
									</div>
									<div className="text-xs opacity-70">
										This column is empty
									</div>
								</div>
							</div>
						)}
						{/* Add Card Button */}{" "}
						<button
							className="w-full mt-4 py-3 rounded-lg flex items-center justify-center 
                text-gray-500 dark:text-gray-400 midnight:text-gray-500 
                hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900
                transition-all duration-200 group"
							onClick={() => setShowAddCard(true)}
						>
							<Plus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
							<span className="text-sm font-medium">
								Add Card
							</span>
						</button>
					</div>
				</div>
			</div>

			{/* Column Settings Modal */}
			{showSettings && (
				<ColumnSettingsModal
					column={column}
					onClose={() => setShowSettings(false)}
					onDelete={handleColumnDeleteStart}
				/>
			)}

			{/* Add Card Modal */}
			{showAddCard && (
				<AddCardModal
					onClose={() => setShowAddCard(false)}
					defaultColumnId={column.id}
					onSuccess={() => setShowAddCard(false)}
				/>
			)}
		</>
	);
};

export default Column;
