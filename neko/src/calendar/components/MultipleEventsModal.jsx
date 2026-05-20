import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar as CalendarIcon } from "lucide-react";
import DraggableEvent from "./DraggableEvent";

const MultipleEventsModal = ({
	isOpen,
	onClose,
	events = [],
	date,
	onEventClick,
	position = null,
	getEventStyle,
	currentUserId = null,
	currentUserEmail = null,
	allProjects = [],
}) => {
	const modalRef = useRef(null);

	if (!isOpen) return null;

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				onClose();
			}
		};
		const handleEscape = (event) => {
			if (event.key === "Escape") onClose();
		};
		if (isOpen) {
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

	const formattedDate = date
		? new Date(date).toLocaleDateString(undefined, {
				weekday: "long",
				month: "long",
				day: "numeric",
		  })
		: "";

	const calculateOptimalHeight = () => {
		const baseHeight = 120;
		const itemHeight = 85;
		const maxItemsToShow = 6;
		const minHeight = 200;
		const maxHeight = Math.min(600, window.innerHeight * 0.85);
		const itemsToCalculate = Math.min(events.length, maxItemsToShow);
		const calculatedHeight = baseHeight + itemsToCalculate * itemHeight;
		return Math.max(minHeight, Math.min(calculatedHeight, maxHeight));
	};

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
			transition: { type: "spring", damping: 25, stiffness: 400, duration: 0.2 },
		},
		exit: { scale: 0.9, opacity: 0, y: -10, transition: { duration: 0.15 } },
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: (custom) => ({
			opacity: 1,
			y: 0,
			transition: { delay: custom * 0.05, type: "spring", stiffness: 300, damping: 25 },
		}),
		exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
	};

	const getModalPosition = () => {
		if (!position) {
			return {
				position: "fixed",
				top: "50%",
				left: "50%",
				transform: "translate(-50%, -50%)",
				arrowPosition: null,
			};
		}

		const modalWidth = Math.min(450, window.innerWidth - 40);
		const modalHeight = calculateOptimalHeight();
		const padding = 12;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let top = position.bottom + padding;
		let left = position.left;
		let arrowLeft = 20;
		let showArrow = true;
		let arrowDirection = "up";

		const triggerCenter = position.left + (position.right - position.left) / 2;

		if (left + modalWidth > viewportWidth - 20) {
			left = position.right - modalWidth;
			if (left < 20) left = 20;
		}

		arrowLeft = Math.max(12, Math.min(modalWidth - 28, triggerCenter - left));

		if (top + modalHeight > viewportHeight - 20) {
			top = position.top - modalHeight - padding;
			arrowDirection = "down";
			if (top < 20) {
				top = 20;
				if (modalHeight > viewportHeight - 40) showArrow = false;
			}
		}

		if (viewportWidth < 768 && (left < 10 || left + modalWidth > viewportWidth - 10)) {
			left = (viewportWidth - modalWidth) / 2;
			arrowLeft = Math.max(12, Math.min(modalWidth - 28, triggerCenter - left));
		}

		return {
			position: "fixed",
			top: `${Math.max(0, top)}px`,
			left: `${Math.max(0, Math.min(left, viewportWidth - modalWidth))}px`,
			transform: "none",
			maxHeight: `${Math.min(modalHeight, viewportHeight - Math.max(0, top) - 20)}px`,
			width: `${modalWidth}px`,
			arrowPosition: showArrow
				? { left: `${arrowLeft}px`, direction: arrowDirection }
				: null,
		};
	};

	const modalPosition = getModalPosition();
	const { arrowPosition, ...modalStyle } = modalPosition;

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
								animate={{ x: 0, opacity: 1, transition: { delay: 0.1 } }}
								className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500"
							>
								{events.length} event{events.length !== 1 ? "s" : ""}
							</motion.p>
						</div>
					</div>
					<motion.button
						initial={{ opacity: 0, rotate: -90 }}
						animate={{ opacity: 1, rotate: 0 }}
						transition={{ delay: 0.1 }}
						whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
						whileTap={{ scale: 0.95 }}
						onClick={onClose}
						className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 rounded-full p-1.5 transition-colors"
					>
						<X className="w-4 h-4" />
					</motion.button>
				</div>

				<div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0">
					{events.length > 0 ? (
						<AnimatePresence mode="wait">
							<motion.div
								initial="hidden"
								animate="visible"
								className="space-y-3"
								key="events-section"
							>
								{events.map((event, index) => (
									<motion.div
										key={`event-${event.id}`}
										custom={index}
										variants={itemVariants}
										whileHover={{ scale: 1.01, x: 2, transition: { duration: 0.2 } }}
										whileTap={{ scale: 0.99 }}
									>
										<DraggableEvent
											event={event}
											onEventClick={onEventClick}
											getEventStyle={getEventStyle}
											style={{ width: "100%", cursor: "move" }}
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
					) : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="text-center py-10 text-gray-500 dark:text-gray-400 midnight:text-gray-500 flex flex-col items-center"
						>
							<CalendarIcon className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
							No events scheduled for this date.
						</motion.div>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
};

const ScrollbarStyles = () => (
	<style>{`
    .custom-scrollbar::-webkit-scrollbar { width: 8px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(156, 163, 175, 0.5);
      border-radius: 20px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background-color: rgba(156, 163, 175, 0.7);
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(75, 85, 99, 0.5);
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background-color: rgba(75, 85, 99, 0.7);
    }
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
