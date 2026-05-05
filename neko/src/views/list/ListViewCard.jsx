import React, { useState, useEffect } from "react";
import {
	Calendar,
	Clock,
	AlertCircle,
	CheckSquare,
	Paperclip,
	ChevronDown,
	ChevronRight,
	CheckCircle,
	Circle,
	Link2,
	Loader2,
	Siren,
	Disc3Icon,
	LifeBuoy,
} from "lucide-react";
import {
	formatDate,
	formatDuration,
	getDueDateStyle,
	getProgressColor,
} from "./ListViewUtils";
import { useCardActions } from "../hooks/useCardActions";

// Modern Priority Badge Component
export const PriorityBadge = ({ priority }) => {
	const styles = {
		High: "bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 text-red-700 dark:text-red-400 midnight:text-red-300 border border-red-200 dark:border-red-800 midnight:border-red-900",
		Medium: "bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border border-amber-200 dark:border-amber-800 midnight:border-amber-900",
		Low: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900",
		default:
			"bg-gray-50 dark:bg-gray-900/10 midnight:bg-gray-900/5 text-gray-700 dark:text-gray-400 midnight:text-gray-500 border border-gray-200 dark:border-gray-800 midnight:border-gray-900",
	};

	return (
		<span
			className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg ${
				styles[priority] || styles.default
			}`}
		>
			{priority || "None"}
		</span>
	);
};

// Enhanced Interactive Priority Badge with Icons
export const InteractivePriorityBadge = ({
	priority,
	cardId,
	columnId,
	disabled = false,
}) => {
	const { handleCardUpdate } = useCardActions();
	const [isUpdating, setIsUpdating] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);
	const [currentPriority, setCurrentPriority] = useState(priority);

	useEffect(() => {
		setCurrentPriority(priority);
	}, [priority]);

	const styles = {
		High: "bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 text-red-700 dark:text-red-400 midnight:text-red-300 border border-red-200 dark:border-red-800 midnight:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/10",
		Medium: "bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 text-amber-700 dark:text-amber-400 midnight:text-amber-300 border border-amber-200 dark:border-amber-800 midnight:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-900/20 midnight:hover:bg-amber-900/10",
		Low: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 midnight:hover:bg-emerald-900/10",
		default:
			"bg-gray-50 dark:bg-gray-900/10 midnight:bg-gray-900/5 text-gray-700 dark:text-gray-400 midnight:text-gray-500 border border-gray-200 dark:border-gray-800 midnight:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-900/20 midnight:hover:bg-gray-900/10",
	};

	const getPriorityIcon = (priorityLevel) => {
		switch (priorityLevel) {
			case "High":
				return (
					<Siren className="w-3 h-3 text-red-400 dark:text-red-600 midnight:text-red-400" />
				);
			case "Medium":
				return (
					<Disc3Icon className="w-3 h-3 text-yellow-400 dark:text-yellow-600 midnight:text-yellow-400" />
				);
			case "Low":
				return (
					<LifeBuoy className="w-3 h-3 text-green-400 dark:text-green-600 midnight:text-green-400" />
				);
			default:
				return null;
		}
	};

	const changePriority = async (newPriority) => {
		if (newPriority === currentPriority) {
			setShowDropdown(false);
			return;
		}

		setIsUpdating(true);
		try {
			await handleCardUpdate(columnId, cardId, { priority: newPriority });
			setCurrentPriority(newPriority);
		} catch (error) {
			console.error("Error updating priority:", error);
		} finally {
			setIsUpdating(false);
			setShowDropdown(false);
		}
	};

	useEffect(() => {
		const handleClickOutside = () => setShowDropdown(false);
		if (showDropdown) {
			document.addEventListener("click", handleClickOutside);
		}
		return () => document.removeEventListener("click", handleClickOutside);
	}, [showDropdown]);

	return (
		<div className="relative">
			<button
				type="button"
				className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
					styles[currentPriority] || styles.default
				} ${
					disabled
						? "opacity-70 cursor-not-allowed"
						: "cursor-pointer"
				}`}
				onClick={(e) => {
					e.stopPropagation();
					if (!disabled) setShowDropdown(!showDropdown);
				}}
				disabled={disabled || isUpdating}
			>
				{isUpdating ? (
					<>
						<Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
						Updating...
					</>
				) : (
					<>
						{currentPriority && getPriorityIcon(currentPriority)}
						<span className={currentPriority ? "ml-1.5" : ""}>
							{currentPriority || "None"}
						</span>
					</>
				)}
			</button>

			{showDropdown && (
				<div className="absolute z-10 mt-1 min-w-36 bg-white dark:bg-gray-800 midnight:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 overflow-hidden">
					<div className="py-1">
						{["High", "Medium", "Low"].map((priorityOption) => (
							<button
								key={priorityOption}
								className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
									currentPriority === priorityOption
										? "bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800"
										: "hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
								} ${
									priorityOption === "High"
										? "text-red-700 dark:text-red-400 midnight:text-red-300"
										: priorityOption === "Medium"
										? "text-amber-700 dark:text-amber-400 midnight:text-amber-300"
										: "text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300"
								}`}
								onClick={(e) => {
									e.stopPropagation();
									changePriority(priorityOption);
								}}
							>
								<div className="flex items-center">
									{getPriorityIcon(priorityOption)}
									<span className="ml-2">
										{priorityOption}
									</span>
								</div>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// Enhanced Status Badge
export const InteractiveStatusBadge = ({
	columnId,
	columnTitle,
	isCompletionColumn,
	cardId,
	columns,
	disabled = false,
}) => {
	const { moveCard } = useCardActions();
	const [isMoving, setIsMoving] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);

	const getStatusColor = () => {
		if (isCompletionColumn) {
			return "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900";
		}
		return "bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/5 text-blue-700 dark:text-blue-400 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-900";
	};

	const handleMoveCard = async (destinationColumnId) => {
		if (destinationColumnId === columnId) {
			setShowDropdown(false);
			return;
		}

		setIsMoving(true);
		try {
			const result = await moveCard(
				cardId,
				columnId,
				destinationColumnId
			);

			// Check if the move was blocked due to dependencies
			if (result && result.blocked) {
				console.warn("Card move blocked:", result.reason);
				// You could show a toast notification here
				alert(
					result.reason ||
						"Cannot move card due to unmet dependencies"
				);
			}
		} catch (error) {
			console.error("Failed to move card:", error);
		} finally {
			setIsMoving(false);
			setShowDropdown(false);
		}
	};

	useEffect(() => {
		const handleClickOutside = () => setShowDropdown(false);
		if (showDropdown) {
			document.addEventListener("click", handleClickOutside);
		}
		return () => document.removeEventListener("click", handleClickOutside);
	}, [showDropdown]);

	return (
		<div className="relative">
			<button
				type="button"
				className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center transition-all duration-200 ${getStatusColor()} ${
					disabled
						? "opacity-70 cursor-not-allowed"
						: "cursor-pointer hover:opacity-90"
				}`}
				onClick={(e) => {
					e.stopPropagation();
					if (!disabled) setShowDropdown(!showDropdown);
				}}
				disabled={disabled || isMoving}
			>
				{isMoving ? (
					<>
						<Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
						Moving...
					</>
				) : (
					<>
						<span>{columnTitle}</span>
					</>
				)}
			</button>

			{showDropdown && columns && columns.length > 0 && (
				<div className="absolute z-10 mt-1 min-w-52 max-w-72 bg-white dark:bg-gray-800 midnight:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
					<div className="py-1 max-h-60 overflow-y-auto">
						{columns.map((column) => (
							<button
								key={column.id}
								className={`flex items-start w-full px-3 py-2.5 text-sm text-left transition-colors
                  ${
						column.id === columnId
							? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/10 text-blue-700 dark:text-blue-400 midnight:text-blue-300"
							: "text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
					}`}
								onClick={(e) => {
									e.stopPropagation();
									handleMoveCard(column.id);
								}}
							>
								<div className="flex-1 whitespace-normal break-words leading-tight">
									{column.title}
								</div>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// Clean Interactive Checklist
export const InteractiveChecklistRenderer = ({
	checklist,
	cardId,
	columnId,
	expandedCards,
}) => {
	const { updateCardChecklist } = useCardActions();
	const [checklistItems, setChecklistItems] = useState(checklist || []);
	const [updatingItems, setUpdatingItems] = useState({});

	useEffect(() => {
		setChecklistItems(checklist || []);
	}, [checklist]);

	if (!checklistItems || checklistItems.length === 0) {
		return (
			<div className="text-center py-8">
				<div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-3">
					<CheckSquare className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
				</div>
				<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
					No subtasks defined
				</p>
			</div>
		);
	}

	const handleTaskToggle = async (taskId) => {
		const task = checklistItems.find((t) => t.id === taskId);
		if (!task) return;

		setUpdatingItems((prev) => ({ ...prev, [taskId]: true }));

		try {
			const updatedChecklist = checklistItems.map((item) =>
				item.id === taskId
					? { ...item, completed: !item.completed }
					: item
			);

			setChecklistItems(updatedChecklist);
			await updateCardChecklist(columnId, cardId, updatedChecklist);
		} catch (error) {
			console.error("Error toggling task completion:", error);
			setChecklistItems(checklist);
		} finally {
			setUpdatingItems((prev) => ({ ...prev, [taskId]: false }));
		}
	};
	const renderTaskItem = (task) => {
		const isUpdating = updatingItems[task.id];

		return (
			<div
				key={task.id}
				className={`flex items-center p-4 rounded-lg transition-all duration-200 cursor-pointer ${
					task.completed
						? "bg-gray-150 dark:bg-gray-800/60 midnight:bg-gray-900/40 hover:bg-gray-200 dark:hover:bg-gray-800/80 midnight:hover:bg-gray-900/60"
						: "bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-900/30 hover:bg-gray-150 dark:hover:bg-gray-800/70 midnight:hover:bg-gray-900/50"
				}`}
			>
				<button
					onClick={(e) => {
						e.stopPropagation();
						handleTaskToggle(task.id);
					}}
					disabled={isUpdating}
					className="flex-shrink-0 mr-3 focus:outline-none transition-all duration-200"
				>
					{isUpdating ? (
						<Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
					) : task.completed ? (
						<CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400 midnight:text-emerald-400" />
					) : (
						<Circle className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400" />
					)}
				</button>

				<div className="flex-1 min-w-0">
					<div
						className={`text-sm leading-relaxed break-words ${
							task.completed
								? "line-through text-gray-500 dark:text-gray-400 midnight:text-gray-500"
								: "text-gray-900 dark:text-gray-100 midnight:text-gray-200"
						}`}
					>
						{task.text}
					</div>
				</div>
			</div>
		);
	};

	// Organize tasks by completion status
	const incompleteTasks = checklistItems.filter((task) => !task.completed);
	const completedTasks = checklistItems.filter((task) => task.completed);

	return (
		<div className="space-y-2">
			{/* Show incomplete tasks first */}
			{incompleteTasks.map(renderTaskItem)}

			{/* Visual separator between incomplete and completed tasks */}
			{incompleteTasks.length > 0 && completedTasks.length > 0 && (
				<div className="py-2">
					<div className="w-full h-px bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800"></div>
				</div>
			)}

			{/* Then completed tasks */}
			{completedTasks.map(renderTaskItem)}
		</div>
	);
};

// Main Card Component
const ListViewCard = ({
	card,
	isCardBlocked,
	expandedCards,
	toggleCardExpanded,
	setSelectedCard,
	cardDependencies,
	dependentCards,
	session,
	columns,
}) => {
	const isFullyCompleted = card.progress === 100 || card.isCompletionColumn;
	const isBlocked = isCardBlocked(card);
	const hasDependencies = card.dependencies && card.dependencies.length > 0;
	const hasDependent =
		dependentCards[card.id] && dependentCards[card.id].length > 0;

	const handleCardClick = () => {
		setSelectedCard(card);
	};

	const getRowStyle = () => {
		if (isFullyCompleted) {
			return "bg-green-100/40 dark:bg-green-900/15 midnight:bg-green-900/5 border-l-2 border-green-200 dark:border-green-800 midnight:border-green-900 hover:bg-green-50/50 dark:hover:bg-green-900/20 midnight:hover:bg-green-900/10";
		}
		return "hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/30";
	};

	// Only show chevron if there are subtasks
	const hasSubtasks = card.checklist && card.checklist.length > 0;
	const subtaskCount = hasSubtasks ? card.checklist.length : 0;

	return (
		<React.Fragment>
			<tr className={`transition-all duration-200 ${getRowStyle()}`}>
				<td className="px-6 py-4">
					<div className="flex items-start">
						{hasSubtasks ? (
							<button
								onClick={(e) => toggleCardExpanded(card.id, e)}
								className="mr-3 flex-shrink-0 text-gray-400 hover:text-blue-500 focus:outline-none mt-1 transition-colors"
								title={
									expandedCards.has(card.id)
										? "Hide subtasks"
										: "Show subtasks"
								}
							>
								{expandedCards.has(card.id) ? (
									<ChevronDown className="w-4 h-4" />
								) : (
									<ChevronRight className="w-4 h-4" />
								)}
							</button>
						) : (
							<span className="mr-3 w-4 h-4" />
						)}
						<div
							className="flex-1 cursor-pointer"
							onClick={handleCardClick}
						>
							<div className="flex items-center">
								{isBlocked && (
									<AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 midnight:text-red-500 mr-2 flex-shrink-0" />
								)}
								<div className="flex flex-col">
									<div
										className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-indigo-100 truncate max-w-35"
										title={card.title} // Shows full title on hover
									>
										{card.title}
									</div>
									{hasSubtasks && (
										<span className="text-xs font-normal text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded px-2 py-0.5 mt-1 inline-block w-fit">
											{subtaskCount} subtask
											{subtaskCount > 1 ? "s" : ""}
										</span>
									)}
								</div>
							</div>
							{card.description && (
								<div
									className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mt-1.5 line-clamp-2 whitespace-pre-line truncate"
									title={card.description}
								>
									{card.description}
								</div>
							)}
						</div>
					</div>
				</td>
				<td className="px-6 py-4 text-center">
					<div className="flex justify-center">
						<InteractivePriorityBadge
							priority={card.priority}
							cardId={card.id}
							columnId={card.columnId}
							disabled={isFullyCompleted}
						/>
					</div>
				</td>
				<td className="px-6 py-4 text-center">
					<span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
						{card.duration
							? formatDuration(card.duration * 60)
							: "-"}
					</span>
				</td>
				<td className="px-6 py-4 text-center">
					<div className="flex justify-center">
						<InteractiveStatusBadge
							columnId={card.columnId}
							columnTitle={card.columnTitle}
							isCompletionColumn={card.isCompletionColumn}
							cardId={card.id}
							columns={columns}
							disabled={isBlocked}
						/>
					</div>
				</td>
				<td className="px-6 py-4 text-center min-w-fit">
					{card.dueDate ? (
						<div
							className={`text-sm flex items-center justify-center whitespace-nowrap min-w-max ${getDueDateStyle(
								card.dueDate
							)}`}
						>
							<Calendar className="w-4 h-4 mr-1.5 flex-shrink-0" />
							<span className="flex-shrink-0">
								{formatDate(card.dueDate)}
							</span>
						</div>
					) : (
						<span className="text-gray-400 dark:text-gray-500 midnight:text-gray-600 text-sm whitespace-nowrap">
							No date
						</span>
					)}
				</td>
				<td className="px-6 py-4 text-center">
					<div className="flex justify-center">
						<div className="w-32">
							<div className="flex items-center">
								<div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-2">
									<div
										className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
											card.progress
										)}`}
										style={{
											width: `${card.progress || 0}%`,
										}}
									></div>
								</div>
								<span
									className={`text-xs font-medium ml-2 ${
										isFullyCompleted
											? "text-emerald-600 dark:text-emerald-500 midnight:text-emerald-500"
											: "text-gray-600 dark:text-gray-400 midnight:text-gray-500"
									}`}
								>
									{card.progress || 0}%
								</span>
							</div>
						</div>
					</div>
				</td>
				<td className="px-6 py-4 text-center">
					<div className="flex items-center justify-center space-x-3 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
						{card.checklist?.length > 0 && (
							<div className="flex items-center text-xs">
								<CheckSquare className="w-3.5 h-3.5 mr-1" />
								{card.tasks?.completed || 0}/
								{card.tasks?.total || 0}
							</div>
						)}

						{(card.attachments?.length > 0 ||
							card.files?.length > 0) && (
							<div className="flex items-center text-xs">
								<Paperclip className="w-3.5 h-3.5 mr-1" />
								{(card.attachments?.length || 0) +
									(card.files?.length || 0)}
							</div>
						)}

						{hasDependencies && (
							<div className="flex items-center text-xs">
								<Link2 className="w-3.5 h-3.5 mr-1" />
								{card.dependencies.length}
							</div>
						)}
					</div>
				</td>
			</tr>

			{/* Expanded Subtasks */}
			{expandedCards.has(card.id) && hasSubtasks && (
				<tr
					className={`${getRowStyle()} border-t border-gray-100 dark:border-gray-800 midnight:border-gray-900`}
				>
					<td colSpan="7" className="px-6 py-6">
						<div className="pl-12">
							<InteractiveChecklistRenderer
								checklist={card.checklist}
								cardId={card.id}
								columnId={card.columnId}
								expandedCards={expandedCards}
							/>
						</div>
					</td>
				</tr>
			)}

		</React.Fragment>
	);
};

export default ListViewCard;
