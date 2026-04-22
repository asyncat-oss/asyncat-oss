import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar as CalendarIcon } from "lucide-react";
import DraggableEvent from "./DraggableEvent";
import DraggableCard from "./DraggableCard";

const MultipleEventsModal = ({
	isOpen,
	onClose,
	events = [],
	cards = [],
	date,
	onEventClick,
	onCardClick,
	position = null,
	getEventStyle, // Add getEventStyle prop for DraggableEvent
	currentUserId = null, // Add currentUserId prop
	currentUserEmail = null, // Add currentUserEmail prop
	allProjects = [], // Add allProjects prop for permissions
}) => {
	const [filter, setFilter] = useState("all"); // 'all', 'events', 'cards'
	const modalRef = useRef(null);

	if (!isOpen) return null;

	// Handle outside click
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				onClose();
			}
		};

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		if (isOpen) {
			// Add event listener on next tick to avoid immediate closure
			setTimeout(() => {
				document.addEventListener("mousedown", handleClickOutside);
				document.addEventListener("keydown", handleEscape);
			}, 0);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen, onClose]);

	// Get filtered items based on current filter
	const getFilteredItems = () => {
		if (filter === "events") return { events, cards: [] };
		if (filter === "cards") return { events: [], cards };
		return { events, cards }; // 'all'
	};

	const { events: filteredEvents, cards: filteredCards } = getFilteredItems();
	const hasItems = filteredEvents.length > 0 || filteredCards.length > 0;
	const formattedDate = date
		? new Date(date).toLocaleDateString(undefined, {
				weekday: "long",
				month: "long",
				day: "numeric",
		  })
		: "";

	// Calculate optimal height based on content
	const calculateOptimalHeight = () => {
		const baseHeight = 160; // Header + filter tabs + padding
		const itemHeight = 85; // Average height per item (card or event)
		const maxItemsToShow = 6; // Maximum items before scrolling
		const minHeight = 250; // Minimum modal height
		const maxHeight = Math.min(600, window.innerHeight * 0.85); // Maximum modal height

		const totalFilteredItems = filteredEvents.length + filteredCards.length;

		if (totalFilteredItems === 0) {
			// Empty state height
			return Math.min(350, maxHeight);
		}

		const itemsToCalculate = Math.min(totalFilteredItems, maxItemsToShow);
		const calculatedHeight = baseHeight + itemsToCalculate * itemHeight;

		return Math.max(minHeight, Math.min(calculatedHeight, maxHeight));
	};

	// Modal animation variants
	const overlayVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1, transition: { duration: 0.15 } },
		exit: { opacity: 0, transition: { duration: 0.15 } },
	};

	const modalVariants = {
		hidden: { scale: 0.9, opacity: 0, y: -10 },
		visible: {
			scale: 1,
			opacity: 1,
			y: 0,
			transition: {
				type: "spring",
				damping: 25,
				stiffness: 400,
				duration: 0.2,
			},
		},
		exit: {
			scale: 0.9,
			opacity: 0,
			y: -10,
			transition: { duration: 0.15 },
		},
	};

	// Item animation variants
	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: (custom) => ({
			opacity: 1,
			y: 0,
			transition: {
				delay: custom * 0.05,
				type: "spring",
				stiffness: 300,
				damping: 25,
			},
		}),
		exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
	};

	// Calculate position for smart positioning
	const getModalPosition = () => {
		if (!position) {
			// Fallback to center if no position provided
			return {
				position: "fixed",
				top: "50%",
				left: "50%",
				transform: "translate(-50%, -50%)",
				arrowPosition: null,
			};
		}

		const modalWidth = Math.min(450, window.innerWidth - 40); // Responsive width
		const modalHeight = calculateOptimalHeight(); // Use content-aware height
		const padding = 12; // Distance from the trigger element

		// Get viewport dimensions
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let top = position.bottom + padding;
		let left = position.left;
		let arrowLeft = 20; // Default arrow position from left edge
		let showArrow = true;
		let arrowDirection = "up"; // 'up' or 'down'

		// Calculate trigger center for arrow positioning
		const triggerCenter =
			position.left + (position.right - position.left) / 2;

		// Adjust horizontal position if modal would overflow
		if (left + modalWidth > viewportWidth - 20) {
			left = position.right - modalWidth;
			// Ensure left doesn't go negative
			if (left < 20) {
				left = 20;
			}
		}

		// Calculate arrow position relative to modal's left edge
		arrowLeft = Math.max(
			12,
			Math.min(modalWidth - 28, triggerCenter - left)
		);

		// Adjust vertical position if modal would overflow
		if (top + modalHeight > viewportHeight - 20) {
			// Position above the trigger element
			top = position.top - modalHeight - padding;
			arrowDirection = "down";

			// If still overflowing at the top, position it with some padding from top
			if (top < 20) {
				top = 20;
				// If we're forced to the top, check if we have enough space
				if (modalHeight > viewportHeight - 40) {
					// Hide arrow if modal takes up most of the screen
					showArrow = false;
				}
			}
		}

		// On mobile devices, center the modal if positioning is problematic
		if (
			viewportWidth < 768 &&
			(left < 10 || left + modalWidth > viewportWidth - 10)
		) {
			left = (viewportWidth - modalWidth) / 2;
			arrowLeft = Math.max(
				12,
				Math.min(modalWidth - 28, triggerCenter - left)
			);
		}

		return {
			position: "fixed",
			top: `${Math.max(0, top)}px`,
			left: `${Math.max(
				0,
				Math.min(left, viewportWidth - modalWidth)
			)}px`,
			transform: "none",
			maxHeight: `${Math.min(
				modalHeight,
				viewportHeight - Math.max(0, top) - 20
			)}px`,
			width: `${modalWidth}px`,
			arrowPosition: showArrow
				? { left: `${arrowLeft}px`, direction: arrowDirection }
				: null,
		};
	};
	const modalPosition = getModalPosition();
	const { arrowPosition, ...modalStyle } = modalPosition;

	// Recalculate position when filter changes to accommodate different content sizes
	useEffect(() => {
		if (isOpen && position) {
			// Small delay to allow content to render before recalculating position
			const timeoutId = setTimeout(() => {
				// Force a re-render to update positioning based on new content
				setFilter((prevFilter) => prevFilter);
			}, 50);

			return () => clearTimeout(timeoutId);
		}
	}, [filter, isOpen, position]);

	return (
		<motion.div
			initial="hidden"
			animate="visible"
			exit="exit"
			variants={overlayVariants}
			className="fixed inset-0 z-[9999]"
		>
			<motion.div
				ref={modalRef}
				variants={modalVariants}
				style={modalStyle}
				className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl p-6 max-w-[90vw] shadow-xl dark:shadow-black/30 midnight:shadow-black/50 overflow-hidden border border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Arrow indicator when positioned relative to trigger */}
				{arrowPosition && (
					<div
						className={`absolute w-0 h-0 ${
							arrowPosition.direction === "up"
								? "-top-2 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white dark:border-b-gray-900 midnight:border-b-gray-950"
								: "-bottom-2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white dark:border-t-gray-900 midnight:border-t-gray-950"
						}`}
						style={{ left: arrowPosition.left }}
					/>
				)}

				{/* Header with date display */}
				<div className="flex justify-between items-center mb-4 flex-shrink-0">
					<div className="flex items-center space-x-3">
						<div className="bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 rounded-lg p-2.5">
							<CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 midnight:text-blue-300" />
						</div>
						<div>
							<motion.h2
								initial={{ x: -10, opacity: 0 }}
								animate={{ x: 0, opacity: 1 }}
								className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-50"
							>
								{formattedDate}
							</motion.h2>
							<motion.p
								initial={{ x: -10, opacity: 0 }}
								animate={{
									x: 0,
									opacity: 1,
									transition: { delay: 0.1 },
								}}
								className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500"
							>
								{events.length} events · {cards.length} tasks
							</motion.p>
						</div>
					</div>
					<motion.button
						initial={{ opacity: 0, rotate: -90 }}
						animate={{ opacity: 1, rotate: 0 }}
						transition={{ delay: 0.1 }}
						whileHover={{
							scale: 1.1,
							backgroundColor: "rgba(0,0,0,0.05)",
						}}
						whileTap={{ scale: 0.95 }}
						onClick={onClose}
						className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 rounded-full p-1.5 transition-colors"
					>
						<X className="w-4 h-4" />
					</motion.button>
				</div>
				{/* Filter tabs */}
				<div className="mb-4 flex-shrink-0">
					<div className="flex p-1 bg-gray-100 dark:bg-gray-700/50 midnight:bg-gray-800/50 rounded-lg">
						<button
							className={`flex-1 px-3 py-2 text-sm rounded-md transition-all ${
								filter === "all"
									? "bg-white dark:bg-gray-700 midnight:bg-gray-800 shadow-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium"
									: "text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-600/40 midnight:hover:bg-gray-800/40"
							}`}
							onClick={() => setFilter("all")}
						>
							All ({events.length + cards.length})
						</button>
						<button
							className={`flex-1 px-3 py-2 text-sm rounded-md transition-all ${
								filter === "events"
									? "bg-white dark:bg-gray-700 midnight:bg-gray-800 shadow-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium"
									: "text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-600/40 midnight:hover:bg-gray-800/40"
							}`}
							onClick={() => setFilter("events")}
						>
							Events ({events.length})
						</button>
						<button
							className={`flex-1 px-3 py-2 text-sm rounded-md transition-all ${
								filter === "cards"
									? "bg-white dark:bg-gray-700 midnight:bg-gray-800 shadow-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium"
									: "text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-600/40 midnight:hover:bg-gray-800/40"
							}`}
							onClick={() => setFilter("cards")}
						>
							Tasks ({cards.length})
						</button>
					</div>
				</div>

				{/* Content area */}
				<div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
					{/* Cards section */}
					{filteredCards.length > 0 && (
						<AnimatePresence mode="wait">
							<motion.div
								initial="hidden"
								animate="visible"
								className="space-y-3"
								key="cards-section"
							>
								{filteredCards.map((card, index) => (
									<motion.div
										key={`card-${card.id}`}
										custom={index}
										variants={itemVariants}
										whileHover={{
											scale: 1.01,
											x: 2,
											transition: { duration: 0.2 },
										}}
										whileTap={{ scale: 0.99 }}
									>
										<DraggableCard
											card={card}
											onCardClick={onCardClick}
											currentUserId={currentUserId}
											style={{
												width: "100%",
												cursor: "move",
											}}
											draggableId={`modal-card-${card.id}`}
										/>
									</motion.div>
								))}
							</motion.div>
						</AnimatePresence>
					)}{" "}
					{/* Events section */}
					{filteredEvents.length > 0 && (
						<AnimatePresence mode="wait">
							<motion.div
								initial="hidden"
								animate="visible"
								className="space-y-3"
								key="events-section"
							>
								{filteredEvents.map((event, index) => (
									<motion.div
										key={`event-${event.id}`}
										custom={filteredCards.length + index}
										variants={itemVariants}
										whileHover={{
											scale: 1.01,
											x: 2,
											transition: { duration: 0.2 },
										}}
										whileTap={{ scale: 0.99 }}
									>
										<DraggableEvent
											event={event}
											onEventClick={onEventClick}
											getEventStyle={getEventStyle}
											style={{
												width: "100%",
												cursor: "move",
											}}
											showIcons={true}
											resizable={false}
											currentUserId={currentUserId}
											currentUserEmail={currentUserEmail}
											allProjects={allProjects}
											draggableId={`modal-event-${event.id}`}
										/>
									</motion.div>
								))}
							</motion.div>
						</AnimatePresence>
					)}
					{/* No items message */}
					{!hasItems && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="text-center py-10 text-gray-500 dark:text-gray-400 midnight:text-gray-500 flex flex-col items-center"
						>
							<CalendarIcon className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
							{filter === "all"
								? "No items scheduled for this date."
								: filter === "events"
								? "No events scheduled for this date."
								: "No tasks scheduled for this date."}
						</motion.div>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
};

// Add custom scrollbar styles in a style tag
// You can also place this in your global CSS file
const ScrollbarStyles = () => (
	<style>{`
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(156, 163, 175, 0.5);
      border-radius: 20px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background-color: rgba(156, 163, 175, 0.7);
    }
    
    /* For dark mode */
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(75, 85, 99, 0.5);
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background-color: rgba(75, 85, 99, 0.7);
    }
      /* For midnight mode */
    .midnight .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(31, 41, 55, 0.5);
    }
    .midnight .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background-color: rgba(31, 41, 55, 0.7);
    }
  `}</style>
);

const MultipleEventsModalWithScrollbar = (props) => (
	<>
		<ScrollbarStyles />
		<MultipleEventsModal {...props} />
	</>
);

export default MultipleEventsModalWithScrollbar;
