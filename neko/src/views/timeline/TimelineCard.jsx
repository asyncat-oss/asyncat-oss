import { useState } from "react";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";

const TimelineCard = ({
	card,
	position,
	index,
	onCardSelect,
	isHighlighted = false,
}) => {
	const [isHovered, setIsHovered] = useState(false);

	if (!position) return null;

	const isCompleted = card.progress === 100 || card.isCompletionColumn;

	// Check if overdue
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const cardEnd = new Date(card.endDate || card.dueDate);
	cardEnd.setHours(0, 0, 0, 0);
	const isOverdue = cardEnd < today && !isCompleted;

	// Get enhanced card colors
	let bgColor, borderColor;

	if (isCompleted) {
		bgColor = "bg-emerald-500 dark:bg-emerald-600 midnight:bg-emerald-700";
		borderColor =
			"border-emerald-400 dark:border-emerald-500 midnight:border-emerald-600";
	} else if (isOverdue) {
		bgColor = "bg-red-600 dark:bg-red-700 midnight:bg-red-800";
		borderColor =
			"border-red-500 dark:border-red-600 midnight:border-red-700";
	} else if (card.priority === "High") {
		bgColor = "bg-red-500 dark:bg-red-600 midnight:bg-red-700";
		borderColor =
			"border-red-400 dark:border-red-500 midnight:border-red-600";
	} else if (card.priority === "Medium") {
		bgColor = "bg-amber-500 dark:bg-amber-600 midnight:bg-amber-700";
		borderColor =
			"border-amber-400 dark:border-amber-500 midnight:border-amber-600";
	} else if (card.priority === "Low") {
		bgColor = "bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700";
		borderColor =
			"border-blue-400 dark:border-blue-500 midnight:border-blue-600";
	} else {
		bgColor = "bg-slate-500 dark:bg-slate-600 midnight:bg-slate-700";
		borderColor =
			"border-slate-400 dark:border-slate-500 midnight:border-slate-600";
	}

	// Handle click to view details
	const handleClick = (e) => {
		e.stopPropagation();
		onCardSelect(card);
	};

	// Format date range for tooltip
	const formatDateRange = () => {
		const start = card.startDate || card.dueDate;
		const end = card.endDate || card.dueDate;

		const formatDate = (date) => {
			return new Date(date).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year:
					new Date(date).getFullYear() !== new Date().getFullYear()
						? "numeric"
						: undefined,
			});
		};

		const startStr = formatDate(start);
		const endStr = formatDate(end);

		const startDate = new Date(start);
		const endDate = new Date(end);

		if (startDate.toDateString() === endDate.toDateString()) {
			return startStr;
		}
		return `${startStr} → ${endStr}`;
	};

	return (
		<div
			id={`task-bar-${card.id}`}
			className={`absolute border cursor-pointer transition-all duration-200 hover:shadow-lg ${borderColor} ${bgColor} ${
				isHovered ? "shadow-lg z-20" : "shadow-sm z-10"
			} ${
				isHighlighted
					? "ring-4 ring-blue-400 ring-offset-2 scale-105 z-30 animate-pulse"
					: ""
			}`}
			style={{
				left: position.left,
				width: position.width,
				top: `${index * 60 + 15}px`,
				height: "30px",
				borderRadius: "6px",
			}}
			onClick={handleClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			title={`${card.title} (${formatDateRange()})${
				isOverdue ? " - Overdue" : ""
			}${isHighlighted ? " - Search Result" : ""}`}
		>
			{/* Background gradient */}
			<div className="absolute inset-0 bg-white/10 pointer-events-none rounded-md" />

			{/* Task content */}
			<div className="relative h-full flex items-center justify-between px-3">
				<div className="flex items-center min-w-0 flex-1">
					{/* Status icon */}
					<div className="flex-shrink-0 mr-2">
						{isCompleted ? (
							<CheckCircle className="w-4 h-4 text-white/90 drop-shadow-sm" />
						) : isOverdue ? (
							<AlertCircle className="w-4 h-4 text-white/90 drop-shadow-sm animate-pulse" />
						) : card.priority === "High" ? (
							<AlertCircle className="w-4 h-4 text-white/90 drop-shadow-sm" />
						) : (
							<Clock className="w-4 h-4 text-white/90 drop-shadow-sm" />
						)}
					</div>

					{/* Task title */}
					<span className="text-sm font-semibold text-white truncate drop-shadow-sm">
						{card.title}
					</span>
				</div>

				{/* Right side content */}
				<div className="flex items-center gap-2 flex-shrink-0 ml-2">
					{/* Progress percentage - show on hover */}
					{isHovered && (
						<span className="text-xs font-medium text-white/80 bg-black/20 px-1.5 py-0.5 rounded">
							{card.progress || 0}%
						</span>
					)}
				</div>
			</div>

			{/* NEW: Highlight pulse effect */}
			{isHighlighted && (
				<div className="absolute inset-0 bg-blue-400/20 rounded-md animate-pulse pointer-events-none"></div>
			)}

			{/* Hover effects */}
			{isHovered && (
				<div className="absolute inset-0 bg-white/5 pointer-events-none rounded-md" />
			)}
		</div>
	);
};

export default TimelineCard;
