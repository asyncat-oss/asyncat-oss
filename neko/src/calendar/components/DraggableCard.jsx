import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { CheckSquare, Tag, Users } from "lucide-react";

const DraggableCard = ({
	card,
	onCardClick,
	currentUserId,
	style = {},
	draggableId = null,
}) => {
	// Set up dragging functionality
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: draggableId || `card-${card.id}`,
		data: { ...card, type: "card" }, // Pass the full card as data with type identifier
	});

	const dragStyle = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
				...style,
		  }
		: style;

	// Determine card background color based on priority
	const getPriorityStyle = (priority) => {
		switch (priority?.toLowerCase()) {
			case "high":
				return "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border-l-4 border-red-500 dark:border-red-600 midnight:border-red-700 text-red-700 dark:text-red-400 midnight:text-red-300";
			case "medium":
				return "bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10 border-l-4 border-amber-500 dark:border-amber-600 midnight:border-amber-700 text-amber-700 dark:text-amber-400 midnight:text-amber-300";
			case "low":
				return "bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border-l-4 border-green-500 dark:border-green-600 midnight:border-green-700 text-green-700 dark:text-green-400 midnight:text-green-300";
			default:
				return "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 border-l-4 border-blue-500 dark:border-blue-600 midnight:border-blue-700 text-blue-700 dark:text-blue-400 midnight:text-blue-300";
		}
	};

	// Check if card has tasks
	const hasTasks = card.tasks && card.tasks.total > 0;
	const taskCompletion = hasTasks
		? `${card.tasks.completed || 0}/${card.tasks.total}`
		: null;

	// Calculate progress percentage
	const progressPercentage = card.progress || 0;
	const hasProgress = progressPercentage > 0;

	// Check if card has assignees (derived from checklist for compatibility)
	const hasAssignees = card.assignees && card.assignees.length > 0;
	const assigneeCount = hasAssignees ? card.assignees.length : 0;

	// Check current user relationships to this card
	const isAssignedToCurrentUser =
		currentUserId && hasAssignees && card.assignees.includes(currentUserId);
	const isAdministrator =
		currentUserId && card.administrator_id === currentUserId;

	// Check if user is assigned to any subtasks
	const isAssignedToSubtask =
		currentUserId &&
		card.checklist &&
		Array.isArray(card.checklist) &&
		card.checklist.some(
			(item) =>
				item.assignees &&
				Array.isArray(item.assignees) &&
				item.assignees.includes(currentUserId)
		);

	// Check if user has any relationship to this card
	const hasUserRelationship =
		isAdministrator || isAssignedToCurrentUser || isAssignedToSubtask;

	return (
		<motion.div
			ref={setNodeRef}
			style={dragStyle}
			{...listeners}
			{...attributes}
			onClick={(e) => onCardClick(card, e)}
			className={`text-xs px-2 py-1.5 rounded cursor-move hover:shadow-md ${getPriorityStyle(
				card.priority
			)}`}
			initial={{ opacity: 0.8, y: 5 }}
			animate={{
				opacity: 1,
				y: 0,
				transition: { type: "spring", stiffness: 300, damping: 20 },
			}}
			whileHover={{
				scale: 1.02,
				boxShadow: "0 3px 10px rgba(0,0,0,0.1)",
				transition: { duration: 0.15 },
			}}
		>
			<div className="flex justify-between items-start mb-0.5">
				<div className="font-medium truncate pr-1">{card.title}</div>
				<div className="flex items-center gap-1">
					{/* Administrator indicator */}
					{isAdministrator && (
						<div
							className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 midnight:bg-emerald-400"
							title="You are the administrator"
						></div>
					)}
					{/* Assignment indicator */}
					{(isAssignedToCurrentUser || isAssignedToSubtask) && (
						<div
							className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 midnight:bg-blue-400"
							title="Assigned to you"
						></div>
					)}
					{/* Completion indicator */}
					{card.isCompleted && (
						<div className="flex-shrink-0 w-3 h-3 rounded-full bg-green-500 dark:bg-green-400 midnight:bg-green-400"></div>
					)}
				</div>
			</div>

			{/* Task info footer */}
			<div className="flex items-center space-x-2 mt-0.5 text-[10px] opacity-75">
				{/* Task completion if available */}
				{hasTasks && (
					<div className="flex items-center">
						<CheckSquare className="w-3 h-3 mr-0.5" />
						<span>{taskCompletion}</span>
					</div>
				)}

				{/* Subtask count if available */}
				{card.checklist && card.checklist.length > 0 && (
					<div className="flex items-center">
						<CheckSquare className="w-3 h-3 mr-0.5" />
						<span>{card.checklist.length} subtasks</span>
					</div>
				)}

				{/* First tag if available */}
				{card.tags && card.tags.length > 0 && (
					<div className="flex items-center">
						<Tag className="w-3 h-3 mr-0.5" />
						<span className="truncate max-w-[50px]">
							{card.tags[0]}
						</span>
					</div>
				)}

				{/* Assignee count if available */}
				{hasAssignees && (
					<div className="flex items-center">
						<Users className="w-3 h-3 mr-0.5" />
						<span>{assigneeCount}</span>
					</div>
				)}
			</div>

			{/* Progress bar */}
			{hasProgress && (
				<div className="w-full h-1 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 rounded-full mt-0.5 overflow-hidden">
					<div
						className="h-full bg-green-500 dark:bg-green-400 midnight:bg-green-500 rounded-full"
						style={{ width: `${progressPercentage}%` }}
					></div>
				</div>
			)}
		</motion.div>
	);
};

export default DraggableCard;
