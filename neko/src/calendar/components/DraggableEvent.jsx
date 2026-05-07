import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

const DraggableEvent = ({
	event,
	onEventClick,
	getEventStyle,
	style = {},
	showIcons = true,
	resizable = true,
	currentUserId = null,
	draggableId = null, // Optional override to ensure uniqueness across contexts
}) => {
	// Check if this is a Google Calendar event
	const isGoogleEvent = event.sourceType === "google";

	const canEdit = () => {
		if (!currentUserId) return false;
		return event.createdBy === currentUserId;
	};

	const userCanEdit = canEdit();

	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: draggableId || event.id,
		data: event, // Pass the full event as data so it's available in drag handlers
		// Disable dragging for Google Calendar events or if user doesn't have edit permission
		disabled: isGoogleEvent || !userCanEdit,
	});

	const {
		setNodeRef: setTopResizeHandleRef,
		listeners: topResizeListeners,
		attributes: topResizeAttributes,
	} = useDraggable({
		id: `resize-top-${event.id}`,
		data: { type: "resize-top", event },
		disabled: isGoogleEvent || !resizable || !userCanEdit,
	});

	const {
		setNodeRef: setBottomResizeHandleRef,
		listeners: bottomResizeListeners,
		attributes: bottomResizeAttributes,
	} = useDraggable({
		id: `resize-bottom-${event.id}`,
		data: { type: "resize-bottom", event },
		disabled: isGoogleEvent || !resizable || !userCanEdit,
	});

	const dragStyle = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
				...style,
		  }
		: style;

	// Determine if this event is in a pending state (optimistic update)
	const isPending = event.isPending;
	// Function to get event style based on type or priority
	const getEventCardStyle = () => {
		// First try to use the provided getEventStyle function
		const baseStyle = getEventStyle(event);

		// Get base color for styling
		let baseColorClass = "";
		if (baseStyle.includes("red")) {
			baseColorClass =
				"bg-red-50 dark:bg-red-900/40 midnight:bg-red-900/40 border-l-4 border-red-500 dark:border-red-600 midnight:border-red-700 text-red-700 dark:text-red-400 midnight:text-red-300";
		} else if (
			baseStyle.includes("yellow") ||
			baseStyle.includes("amber")
		) {
			baseColorClass =
				"bg-amber-50 dark:bg-amber-900/40 midnight:bg-amber-900/40 border-l-4 border-amber-500 dark:border-amber-600 midnight:border-amber-700 text-amber-700 dark:text-amber-400 midnight:text-amber-300";
		} else if (baseStyle.includes("green")) {
			baseColorClass =
				"bg-green-50 dark:bg-green-900/40 midnight:bg-green-900/40 border-l-4 border-green-500 dark:border-green-600 midnight:border-green-700 text-green-700 dark:text-green-400 midnight:text-green-300";
		} else if (baseStyle.includes("purple")) {
			baseColorClass =
				"bg-purple-50 dark:bg-purple-900/40 midnight:bg-purple-900/40 border-l-4 border-purple-500 dark:border-purple-600 midnight:border-purple-700 text-purple-700 dark:text-purple-400 midnight:text-purple-300";
		} else {
			baseColorClass =
				"bg-blue-50 dark:bg-blue-900/40 midnight:bg-blue-900/40 border-l-4 border-blue-500 dark:border-blue-600 midnight:border-blue-700 text-blue-700 dark:text-blue-400 midnight:text-blue-300";
		}

		return baseColorClass;
	};

	// Handle time display with proper formatting
	const formatTime = (timeString) => {
		if (!timeString) return "";

		// If it's already just a time (e.g. "14:30" or "2:30 PM"), return as is
		if (
			/^(\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?|\d{1,2}\s*(AM|PM))$/i.test(
				timeString
			)
		) {
			return timeString;
		}

		try {
			// Try to parse as Date if it contains date information
			const date = new Date(timeString);
			if (!isNaN(date.getTime())) {
				// Format as 12-hour time with AM/PM
				return date.toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
					hour12: true,
				});
			}
		} catch {
			// If parsing fails, return the original string
		}

		return timeString;
	};

	// Get time information
	const startTime = formatTime(event.startTime || event.time);
	const endTime = formatTime(event.endTime);

	const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;

	// Get base color for event styling
	const getBaseColor = () => {
		const style = getEventStyle(event);
		if (style.includes("red")) return "red";
		if (style.includes("amber") || style.includes("yellow")) return "amber";
		if (style.includes("green")) return "green";
		if (style.includes("purple")) return "purple";
		return "blue";
	};

	const baseColor = getBaseColor();

	return (
		<motion.div
			ref={setNodeRef}
			style={dragStyle}
			{...listeners}
			{...attributes}
			onClick={(e) => onEventClick(event, e)}
			className={`
        group relative text-xs rounded-md 
        shadow-sm hover:shadow-md
        ${getEventCardStyle()} 
        transition-all duration-200 ease-in-out
        h-[50px] w-full flex items-center
        ${isPending ? "overflow-visible" : ""}
        ${userCanEdit ? "cursor-move" : "cursor-pointer"}
        ${!userCanEdit ? "opacity-75" : ""}
      `}
			initial={{
				opacity: isPending ? 0.7 : 1,
				y: isPending ? 10 : 0,
				scale: isPending ? 0.95 : 1,
			}}
			animate={{
				opacity: isPending ? 0.85 : 1,
				y: 0,
				scale: 1,
				transition: { type: "spring", stiffness: 300, damping: 20 },
			}}
			whileHover={{
				scale: 1.02,
				boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
				transition: { duration: 0.2 },
			}}
		>
			{" "}
			{/* Top Resize Handle - only show if user can edit */}
			{resizable && userCanEdit && (
				<div
					ref={setTopResizeHandleRef}
					{...topResizeListeners}
					{...topResizeAttributes}
					style={{ touchAction: "none" }}
					className="absolute top-0 left-0 w-full h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
				></div>
			)}
			{/* Main event content */}
			<div className="w-full flex justify-between items-center px-2.5">
				{/* Left side: title and time */}
				<div
					className={`flex flex-col min-w-0 flex-grow ${
						showIcons ? "max-w-[65%]" : "max-w-[95%]"
					}`}
				>
					{/* Title with subtle font weight */}
					<div className="flex items-center gap-1">
						<div className="font-medium truncate text-[14px] leading-tight">
							{event.title}
						</div>
					</div>

					{/* Time with improved styling */}
					<div className="flex items-center text-[11px] mt-1 text-gray-600 dark:text-gray-300 midnight:text-white/70">
						<Clock
							className="w-3 h-3 mr-0.5 flex-shrink-0 opacity-70"
							strokeWidth={2.5}
						/>
						<span className="truncate font-light">
							{timeDisplay}
						</span>
					</div>
				</div>
				{/* Right side: source info (App or Google) with consistent width - only render if icons should be shown */}
				{showIcons && (
					<div className="flex items-center justify-end w-[70px] flex-shrink-0">
						{isGoogleEvent ? (
							<div className="flex items-center px-1 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 shadow-sm">
								<svg
									className="w-4 h-4"
									viewBox="0 0 24 24"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path
										d="M21.8055 10.0415H21V10H12V14H17.6515C16.827 16.3285 14.6115 18 12 18C8.6865 18 6 15.3135 6 12C6 8.6865 8.6865 6 12 6C13.5295 6 14.921 6.577 15.9805 7.5195L18.809 4.691C17.023 3.0265 14.634 2 12 2C6.4775 2 2 6.4775 2 12C2 17.5225 6.4775 22 12 22C17.5225 22 22 17.5225 22 12C22 11.3295 21.931 10.675 21.8055 10.0415Z"
										fill="#FFC107"
									/>
									<path
										d="M3.15302 7.3455L6.43851 9.755C7.32752 7.554 9.48052 6 12 6C13.5295 6 14.921 6.577 15.9805 7.5195L18.809 4.691C17.023 3.0265 14.634 2 12 2C8.15902 2 4.82802 4.1685 3.15302 7.3455Z"
										fill="#FF3D00"
									/>
									<path
										d="M12 22C14.583 22 16.93 21.0115 18.7045 19.404L15.6095 16.785C14.5718 17.5742 13.3038 18.001 12 18C9.39897 18 7.19047 16.3415 6.35847 14.027L3.09747 16.5395C4.75247 19.778 8.11347 22 12 22Z"
										fill="#4CAF50"
									/>
									<path
										d="M21.8055 10.0415H21V10H12V14H17.6515C17.2571 15.1082 16.5467 16.0766 15.608 16.7855L15.6095 16.784L18.7045 19.4035C18.4855 19.6025 22 17 22 12C22 11.3295 21.931 10.675 21.8055 10.0415Z"
										fill="#1976D2"
									/>
								</svg>
							</div>
						) : (
							<div className="flex items-center px-1 py-1 rounded-full bg-white/70 dark:bg-gray-800/70 shadow-sm">
								<img src="cat.svg" className="w-4 h-4" />
							</div>
						)}
					</div>
				)}
			</div>
			{/* Bottom Resize Handle - only show if user can edit */}
			{resizable && userCanEdit && (
				<div
					ref={setBottomResizeHandleRef}
					{...bottomResizeListeners}
					{...bottomResizeAttributes}
					style={{ touchAction: "none" }}
					className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
				></div>
			)}
			{/* Visual indicator for pending events with improved animation */}
			{isPending && (
				<motion.div
					className={`absolute -right-1 -top-1 w-3 h-3 rounded-full z-10 ${
						baseColor === "red"
							? "bg-red-400"
							: baseColor === "amber"
							? "bg-amber-400"
							: baseColor === "green"
							? "bg-green-400"
							: "bg-blue-400"
					}`}
					animate={{
						scale: [1, 1.3, 1],
						opacity: [0.7, 1, 0.7],
					}}
					transition={{
						duration: 2,
						repeat: Infinity,
						repeatType: "loop",
					}}
				/>
			)}
			{/* Subtle highlight effect on the top edge */}
			<div className="absolute left-0 right-0 top-0 h-[1.5px] bg-white/40 dark:bg-white/10 midnight:bg-white/10 rounded-tr-md"></div>
		</motion.div>
	);
};

export default DraggableEvent;
