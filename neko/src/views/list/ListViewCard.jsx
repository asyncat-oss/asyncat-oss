import React, { useEffect, useState } from "react";
import {
	Calendar,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Circle,
	ExternalLink,
	Loader2,
	Play,
	RotateCcw,
	Square,
} from "lucide-react";
import { formatDate, getDueDateStyle } from "./ListViewUtils";
import { useCardActions } from "../hooks/useCardActions";

const statusStyles = {
	queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	running: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
	completed:
		"bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
	failed: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
	cancelled:
		"bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
};

export const PriorityBadge = ({ priority }) => {
	const styles = {
		High: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/10 dark:text-red-300 dark:border-red-800",
		Medium:
			"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/10 dark:text-amber-300 dark:border-amber-800",
		Low: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/10 dark:text-emerald-300 dark:border-emerald-800",
	};

	return (
		<span
			className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border ${
				styles[priority] ||
				"bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/10 dark:text-gray-300 dark:border-gray-800"
			}`}
		>
			{priority || "None"}
		</span>
	);
};

export const InteractiveStatusBadge = ({
	columnId,
	columnTitle,
	cardId,
	columns,
	disabled = false,
}) => {
	const { moveCard } = useCardActions();
	const [isMoving, setIsMoving] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);

	const handleMove = async (destinationColumnId) => {
		if (destinationColumnId === columnId) {
			setShowDropdown(false);
			return;
		}
		setIsMoving(true);
		try {
			await moveCard(cardId, columnId, destinationColumnId);
		} catch (error) {
			console.error("Failed to move card:", error);
		} finally {
			setIsMoving(false);
			setShowDropdown(false);
		}
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => !disabled && setShowDropdown((value) => !value)}
				disabled={disabled || isMoving}
				className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
			>
				{isMoving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
				{columnTitle || "Status"}
			</button>
			{showDropdown && columns?.length > 0 && (
				<div className="absolute z-20 mt-1 min-w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
					{columns.map((column) => (
						<button
							type="button"
							key={column.id}
							onClick={() => handleMove(column.id)}
							className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							{column.title}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

const RunStatusBadge = ({ run }) => {
	const status = run?.status || "unassigned";
	if (!run) {
		return (
			<span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
				Unassigned
			</span>
		);
	}

	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md ${
				statusStyles[status] || statusStyles.queued
			}`}
		>
			{status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
			{status === "completed" && <CheckCircle className="w-3 h-3" />}
			{status}
		</span>
	);
};

const AgentPicker = ({ profiles, disabled, onAssign }) => {
	const [profileId, setProfileId] = useState("");

	useEffect(() => {
		if (!profileId && profiles?.length) setProfileId(profiles[0].id);
	}, [profiles, profileId]);

	return (
		<div className="flex items-center justify-end gap-2">
			<select
				value={profileId}
				onChange={(event) => setProfileId(event.target.value)}
				disabled={disabled || !profiles?.length}
				className="max-w-36 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
			>
				{profiles?.length ? (
					profiles.map((profile) => (
						<option key={profile.id} value={profile.id}>
							{profile.icon || ""} {profile.name}
						</option>
					))
				) : (
					<option value="">No agents</option>
				)}
			</select>
			<button
				type="button"
				onClick={() => onAssign(profileId)}
				disabled={disabled || !profileId}
				className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
				title="Assign agent"
			>
				{disabled ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Play className="h-4 w-4" />
				)}
			</button>
		</div>
	);
};

export const InteractiveChecklistRenderer = ({ checklist, cardId, columnId }) => {
	const { updateCardChecklist } = useCardActions();
	const [checklistItems, setChecklistItems] = useState(checklist || []);
	const [updatingItems, setUpdatingItems] = useState({});

	useEffect(() => {
		setChecklistItems(checklist || []);
	}, [checklist]);

	const handleTaskToggle = async (taskId) => {
		const next = checklistItems.map((item) =>
			item.id === taskId ? { ...item, completed: !item.completed } : item
		);
		setChecklistItems(next);
		setUpdatingItems((prev) => ({ ...prev, [taskId]: true }));
		try {
			await updateCardChecklist(columnId, cardId, next);
		} catch (error) {
			console.error("Error toggling task completion:", error);
			setChecklistItems(checklist || []);
		} finally {
			setUpdatingItems((prev) => ({ ...prev, [taskId]: false }));
		}
	};

	if (!checklistItems.length) {
		return (
			<p className="text-sm text-gray-500 dark:text-gray-400">
				No subtasks defined.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{checklistItems.map((task) => (
				<div
					key={task.id}
					className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
				>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							handleTaskToggle(task.id);
						}}
						disabled={updatingItems[task.id]}
						className="text-gray-400 hover:text-blue-500 disabled:opacity-50"
					>
						{updatingItems[task.id] ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : task.completed ? (
							<CheckCircle className="w-4 h-4 text-emerald-500" />
						) : (
							<Circle className="w-4 h-4" />
						)}
					</button>
					<span
						className={`text-sm ${
							task.completed
								? "text-gray-500 line-through"
								: "text-gray-900 dark:text-gray-100"
						}`}
					>
						{task.text || task.title || "Untitled subtask"}
					</span>
				</div>
			))}
		</div>
	);
};

const ListViewCard = ({
	card,
	expandedCards,
	toggleCardExpanded,
	setSelectedCard,
	profiles = [],
	assigningCardId = null,
	onAssignAgent,
	onCancelRun,
	onOpenRun,
}) => {
	const run = card.agentRun;
	const hasSubtasks = Array.isArray(card.checklist) && card.checklist.length > 0;
	const isExpanded = expandedCards.has(card.id);
	const isRunning = run && ["queued", "running"].includes(run.status);

	return (
		<React.Fragment>
			<tr className="border-b border-gray-100 transition-colors hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-gray-800/30">
				<td className="px-6 py-4">
					<div className="flex items-start gap-3">
						{hasSubtasks ? (
							<button
								type="button"
								onClick={(event) => toggleCardExpanded(card.id, event)}
								className="mt-1 text-gray-400 hover:text-blue-500"
								title={isExpanded ? "Hide subtasks" : "Show subtasks"}
							>
								{isExpanded ? (
									<ChevronDown className="w-4 h-4" />
								) : (
									<ChevronRight className="w-4 h-4" />
								)}
							</button>
						) : (
							<span className="mt-1 w-4" />
						)}
						<button
							type="button"
							onClick={() => setSelectedCard(card)}
							className="min-w-0 text-left"
						>
							<div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
								{card.title}
							</div>
							{card.description && (
								<div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
									{card.description}
								</div>
							)}
							{hasSubtasks && (
								<div className="mt-1 text-xs text-gray-400">
									{card.tasks?.completed || 0}/{card.tasks?.total || card.checklist.length} subtasks
								</div>
							)}
						</button>
					</div>
				</td>
				<td className="px-3 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
					{run?.profile ? (
						<span className="inline-flex items-center gap-1.5">
							<span>{run.profile.icon || ""}</span>
							<span>{run.profile.name}</span>
						</span>
					) : (
						<span className="text-gray-400">None</span>
					)}
				</td>
				<td className="px-3 py-4 text-center">
					<RunStatusBadge run={run} />
				</td>
				<td className="px-3 py-4">
					<div className="max-w-56 truncate text-sm text-gray-600 dark:text-gray-400">
						{run?.lastEventLabel || "Ready for assignment"}
					</div>
				</td>
				<td className="px-3 py-4 text-center">
					<PriorityBadge priority={card.priority} />
				</td>
				<td className="px-3 py-4 text-center">
					{card.dueDate ? (
						<span
							className={`inline-flex items-center justify-center whitespace-nowrap text-sm ${getDueDateStyle(
								card.dueDate
							)}`}
						>
							<Calendar className="mr-1.5 h-4 w-4" />
							{formatDate(card.dueDate)}
						</span>
					) : (
						<span className="text-sm text-gray-400">No date</span>
					)}
				</td>
				<td className="px-3 py-4 text-right">
					<div className="flex items-center justify-end gap-2">
						{run?.id && (
							<button
								type="button"
								onClick={() => onOpenRun(run)}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
								title="Open run"
							>
								<ExternalLink className="h-4 w-4" />
							</button>
						)}
						{isRunning ? (
							<button
								type="button"
								onClick={() => onCancelRun(run)}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
								title="Cancel run"
							>
								<Square className="h-4 w-4" />
							</button>
						) : run?.status === "failed" ? (
							<button
								type="button"
								onClick={() => onAssignAgent(card, run.profileId)}
								className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
								title="Retry"
							>
								<RotateCcw className="h-4 w-4" />
							</button>
						) : (
							<AgentPicker
								profiles={profiles}
								disabled={assigningCardId === card.id}
								onAssign={(profileId) => onAssignAgent(card, profileId)}
							/>
						)}
					</div>
				</td>
			</tr>
			{isExpanded && hasSubtasks && (
				<tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
					<td colSpan="7" className="px-6 py-5">
						<div className="pl-8">
							<InteractiveChecklistRenderer
								checklist={card.checklist}
								cardId={card.id}
								columnId={card.columnId}
							/>
						</div>
					</td>
				</tr>
			)}
		</React.Fragment>
	);
};

export default ListViewCard;
