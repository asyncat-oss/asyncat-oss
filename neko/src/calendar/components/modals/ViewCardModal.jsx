import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Clock,
	Calendar,
	AlignLeft,
	Edit2,
	Trash2,
	Users,
	CheckSquare,
	Tag,
	AlertCircle,
	Activity,
	ExternalLink,
	Briefcase,
} from "lucide-react";
import UserAvatar from "../shared/UserAvatar";
import { calendarUsersApi } from "../../api/calendarApi";

const ViewCardModal = ({
	isOpen,
	onClose,
	card,
	onEdit,
	onDelete,
	currentUserId,
	projectsMap = {},
}) => {
	const [userProfiles, setUserProfiles] = useState({}); // Store fetched user profiles

	// Fetch user profiles for assignees (using calendar API)
	const fetchUserProfiles = async (userIds) => {
		try {
			// Filter out userIds that are already cached
			const uncachedUserIds = userIds.filter(
				(userId) => userId && !userProfiles[userId]
			);

			if (uncachedUserIds.length === 0) {
				return; // All profiles already cached
			}

			const profiles = await calendarUsersApi.getUserProfiles(
				uncachedUserIds
			);
			setUserProfiles((prev) => ({ ...prev, ...profiles }));
		} catch (error) {
			console.error("Error fetching user profiles:", error);
		}
	};

	// Fetch user profiles when card assignees/administrator change
	useEffect(() => {
		if (card) {
			const userIds = [];

			// Add administrator
			if (card.administrator_id) {
				userIds.push(card.administrator_id);
			}

			// Add assignees
			if (card.assignees && Array.isArray(card.assignees)) {
				userIds.push(...card.assignees);
			}

			// Add subtask assignees
			if (card.checklist && Array.isArray(card.checklist)) {
				card.checklist.forEach((item) => {
					if (item.assignees && Array.isArray(item.assignees)) {
						userIds.push(...item.assignees);
					}
				});
			}

			const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
			if (uniqueUserIds.length > 0) {
				fetchUserProfiles(uniqueUserIds);
			}
		}
	}, [card]);

	if (!isOpen || !card) return null;

	// Format date
	const formatDate = (dateString) => {
		if (!dateString) return "No date";
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	// Calculate task completion percentage
	const taskCompletion =
		card.tasks && card.tasks.total > 0
			? Math.round((card.tasks.completed / card.tasks.total) * 100)
			: 0;

	// Determine priority color
	const getPriorityColor = () => {
		switch (card.priority?.toLowerCase()) {
			case "high":
				return "text-red-600 dark:text-red-400 midnight:text-red-400 bg-red-100 dark:bg-red-900/20 midnight:bg-red-900/10";
			case "medium":
				return "text-amber-600 dark:text-amber-400 midnight:text-amber-400 bg-amber-100 dark:bg-amber-900/20 midnight:bg-amber-900/10";
			case "low":
				return "text-green-600 dark:text-green-400 midnight:text-green-400 bg-green-100 dark:bg-green-900/20 midnight:bg-green-900/10";
			default:
				return "text-blue-600 dark:text-blue-400 midnight:text-blue-400 bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-900/10";
		}
	};

	// Check user relationship to card
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

	// For backward compatibility, also check the assignees array (derived from checklist)
	const isAssignedToCurrentUser =
		currentUserId && card.assignees?.includes(currentUserId);

	// Get project information from projectsMap using the card's column projectId
	const getProjectInfo = () => {
		// First check if card has direct projectId (from some contexts)
		if (card.projectId) {
			return {
				id: card.projectId,
				name:
					card.projectName ||
					projectsMap[card.projectId]?.name ||
					"Unknown Project",
			};
		}

		// Check if card has column with projectId (most common case)
		if (card.column?.projectId) {
			const projectId = card.column.projectId;
			return {
				id: projectId,
				name: projectsMap[projectId]?.name || "Unknown Project",
			};
		}

		// Check if card has nested project info from Columns.projectId (backend structure)
		if (card.Columns?.projectId) {
			const projectId = card.Columns.projectId;
			return {
				id: projectId,
				name: projectsMap[projectId]?.name || "Unknown Project",
			};
		}

		// No project association found
		return null;
	};

	const projectInfo = getProjectInfo();

	return (
		<motion.div
			className="fixed inset-0 flex items-center justify-center z-50"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
		>
			<motion.div
				className="fixed inset-0 bg-black/30 dark:bg-black/60 midnight:bg-black/80 backdrop-blur-[2px]"
				onClick={onClose}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
			/>
			<motion.div
				className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 midnight:border-gray-900 w-[65vw] max-w-[800px] max-h-[85vh] flex flex-col relative"
				initial={{ scale: 0.9, y: 10, opacity: 0 }}
				animate={{ scale: 1, y: 0, opacity: 1 }}
				transition={{ type: "spring", damping: 20, stiffness: 300 }}
			>
				{/* Header */}
				<div className="p-6 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between">
					<div className="flex items-center min-w-0 flex-1 mr-3">
						<div className="min-w-0 flex-1">
							<motion.h2
								className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-indigo-200 break-words word-wrap"
								initial={{ x: -10, opacity: 0 }}
								animate={{ x: 0, opacity: 1 }}
								transition={{ delay: 0.1 }}
							>
								{card.title}
							</motion.h2>
						</div>
					</div>
					<motion.button
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.25 }}
						onClick={onClose}
						className="h-8 w-8 flex items-center justify-center rounded-full text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.95 }}
					>
						<X className="w-5 h-5" />
					</motion.button>
				</div>

				{/* Content */}
				<div className="overflow-y-auto p-6 flex-grow">
					{/* Priority and Status Section */}
					<div className="mb-6">
						<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
							<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
								<AlertCircle className="w-5 h-5 mr-2 text-orange-500 dark:text-orange-400" />
								Priority & Status
							</h3>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Priority */}
								<motion.div
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.3 }}
								>
									<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
										Priority
									</p>
									<div
										className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${getPriorityColor()}`}
									>
										<AlertCircle className="w-4 h-4 mr-2" />
										{card.priority || "No Priority"}
									</div>
								</motion.div>

								{/* User relationship indicator */}
								{(isAdministrator ||
									isAssignedToSubtask ||
									isAssignedToCurrentUser) && (
									<motion.div
										initial={{ y: 10, opacity: 0 }}
										animate={{ y: 0, opacity: 1 }}
										transition={{ delay: 0.32 }}
									>
										<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
											Your Role
										</p>
										<div className="flex items-center gap-2 flex-wrap">
											{isAdministrator && (
												<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 dark:bg-emerald-900/20 midnight:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300">
													Administrator
												</span>
											)}
											{(isAssignedToSubtask ||
												isAssignedToCurrentUser) && (
												<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-900/10 text-blue-700 dark:text-blue-400 midnight:text-blue-300">
													Assigned to you
												</span>
											)}
										</div>
									</motion.div>
								)}
							</div>
						</div>
					</div>

					{/* Details Section */}
					<div className="mb-6">
						<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
							<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
								<Calendar className="w-5 h-5 mr-2 text-blue-500 dark:text-blue-400" />
								Card Details
							</h3>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Due date */}
								<motion.div
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.35 }}
								>
									<div className="flex items-start gap-3">
										<Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
										<div>
											<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
												Due Date
											</p>
											<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
												{formatDate(card.dueDate)}
											</p>
										</div>
									</div>
								</motion.div>

								{/* Project information */}
								<motion.div
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.38 }}
								>
									<div className="flex items-start gap-3">
										<Briefcase className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
										<div>
											<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
												Project
											</p>
											<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
												{projectInfo
													? projectInfo.name
													: "Personal"}
											</p>
										</div>
									</div>
								</motion.div>

								{/* Column info */}
								{card.column && (
									<motion.div
										initial={{ y: 10, opacity: 0 }}
										animate={{ y: 0, opacity: 1 }}
										transition={{ delay: 0.4 }}
									>
										<div className="flex items-start gap-3">
											<Activity className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
											<div>
												<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
													Status
												</p>
												<div className="flex items-center gap-2 mt-1">
													<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
														{card.column.title}
													</p>
													{card.column
														.isCompletionColumn && (
														<span className="text-xs bg-green-100 dark:bg-green-900/20 midnight:bg-green-900/10 text-green-700 dark:text-green-400 midnight:text-green-400 px-2 py-0.5 rounded-full font-medium">
															Completed
														</span>
													)}
												</div>
											</div>
										</div>
									</motion.div>
								)}

								{/* Assignees */}
								{card.assignees &&
									card.assignees.length > 0 && (
										<motion.div
											initial={{ y: 10, opacity: 0 }}
											animate={{ y: 0, opacity: 1 }}
											transition={{ delay: 0.42 }}
										>
											<div className="flex items-start gap-3">
												<Users className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
												<div className="flex-1">
													<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
														Assignees (
														{card.assignees.length})
													</p>
													<div className="flex items-center gap-2 flex-wrap">
														{card.assignees
															.slice(0, 5)
															.map(
																(
																	assigneeId,
																	index
																) => {
																	const userProfile =
																		userProfiles[
																			assigneeId
																		] || {
																			id: assigneeId,
																		};
																	return (
																		<div
																			key={
																				assigneeId ||
																				index
																			}
																			className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 midnight:bg-gray-800/50 px-2 py-1 rounded-lg"
																		>
																			<UserAvatar
																				user={
																					userProfile
																				}
																				size="sm"
																				showTooltip={
																					false
																				}
																			/>
																			<span className="text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-400">
																				{userProfile.name ||
																					userProfile.email ||
																					`User ${assigneeId}`}
																			</span>
																		</div>
																	);
																}
															)}
														{card.assignees.length >
															5 && (
															<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 px-2 py-1 rounded-lg">
																+
																{card.assignees
																	.length -
																	5}{" "}
																more
															</div>
														)}
													</div>
												</div>
											</div>
										</motion.div>
									)}

								{/* Administrator */}
								{card.administrator_id && (
									<motion.div
										initial={{ y: 10, opacity: 0 }}
										animate={{ y: 0, opacity: 1 }}
										transition={{ delay: 0.44 }}
									>
										<div className="flex items-start gap-3">
											<Users className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
											<div className="flex-1">
												<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
													Administrator
												</p>
												<div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/10 px-2 py-1 rounded-lg">
													<UserAvatar
														user={
															userProfiles[
																card
																	.administrator_id
															] || {
																id: card.administrator_id,
															}
														}
														size="sm"
														showTooltip={false}
													/>
													<span className="text-xs text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300">
														{userProfiles[
															card
																.administrator_id
														]?.name ||
															userProfiles[
																card
																	.administrator_id
															]?.email ||
															`User ${card.administrator_id}`}
													</span>
												</div>
											</div>
										</div>
									</motion.div>
								)}
							</div>
						</div>
					</div>

					{/* Subtasks Section */}
					{card.checklist && card.checklist.length > 0 && (
						<div className="mb-6">
							<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
								<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
									<CheckSquare className="w-5 h-5 mr-2 text-green-500 dark:text-green-400" />
									Subtasks
								</h3>

								<motion.div
									className="space-y-4"
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.46 }}
								>
									{(() => {
										// Show all subtasks to administrator, only assigned tasks to regular users
										const subtasksToShow = isAdministrator
											? card.checklist
											: card.checklist.filter(
													(item) =>
														item.assignees &&
														Array.isArray(
															item.assignees
														) &&
														item.assignees.includes(
															currentUserId
														)
											  );

										if (subtasksToShow.length === 0) {
											return (
												<div className="text-center py-6">
													<CheckSquare className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
													<p className="text-sm text-gray-500 dark:text-gray-400">
														No subtasks assigned to
														you
													</p>
												</div>
											);
										}

										const sectionTitle = isAdministrator
											? `All Subtasks (${subtasksToShow.length})`
											: `Your Subtasks (${subtasksToShow.length})`;

										return (
											<>
												<div className="flex items-center justify-between mb-4">
													<h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-400">
														{sectionTitle}
													</h4>
												</div>
												<div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
													<div className="space-y-3">
														{subtasksToShow.map(
															(item, idx) => (
																<div
																	key={
																		item.id ||
																		idx
																	}
																	className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700/50 midnight:bg-gray-800/50 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg"
																>
																	<div
																		className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
																			item.completed
																				? "bg-green-500 border-green-500"
																				: "border-gray-300 dark:border-gray-600"
																		}`}
																	>
																		{item.completed && (
																			<CheckSquare className="w-3 h-3 text-white" />
																		)}
																	</div>
																	<span
																		className={`flex-1 text-sm ${
																			item.completed
																				? "line-through text-gray-500 dark:text-gray-400"
																				: "text-gray-700 dark:text-gray-300 midnight:text-gray-300"
																		}`}
																	>
																		{
																			item.text
																		}
																	</span>
																	{isAdministrator &&
																		item.assignees &&
																		item.assignees.includes(
																			currentUserId
																		) && (
																			<span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
																				You
																			</span>
																		)}
																</div>
															)
														)}
													</div>
												</div>
											</>
										);
									})()}
								</motion.div>
							</div>
						</div>
					)}

					{/* Progress Section */}
					{card.checklist && card.checklist.length > 0 && (
						<div className="mb-6">
							<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
								<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
									<Activity className="w-5 h-5 mr-2 text-indigo-500 dark:text-indigo-400" />
									Progress Overview
								</h3>

								<motion.div
									className="space-y-4"
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.48 }}
								>
									{(() => {
										// For administrators, show both overall progress and their personal progress if they have assigned tasks
										if (isAdministrator) {
											const allSubtasks = card.checklist;
											const adminPersonalSubtasks =
												card.checklist.filter(
													(item) =>
														item.assignees &&
														Array.isArray(
															item.assignees
														) &&
														item.assignees.includes(
															currentUserId
														)
												);

											const overallCompleted =
												allSubtasks.filter(
													(item) => item.completed
												).length;
											const overallProgress = Math.round(
												(overallCompleted /
													allSubtasks.length) *
													100
											);

											// Show admin's personal progress only if they have assigned tasks
											if (
												adminPersonalSubtasks.length > 0
											) {
												const adminCompleted =
													adminPersonalSubtasks.filter(
														(item) => item.completed
													).length;
												const adminProgress =
													Math.round(
														(adminCompleted /
															adminPersonalSubtasks.length) *
															100
													);

												return (
													<div className="space-y-4">
														<div>
															<div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-2">
																<span>
																	Overall
																	Progress
																</span>
																<span>
																	{
																		overallProgress
																	}
																	%
																</span>
															</div>
															<div className="w-full h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
																<div
																	className="h-full bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-500 rounded-full transition-all duration-300"
																	style={{
																		width: `${overallProgress}%`,
																	}}
																></div>
															</div>
														</div>
														<div>
															<div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-2">
																<span>
																	Your
																	Progress
																</span>
																<span>
																	{
																		adminProgress
																	}
																	%
																</span>
															</div>
															<div className="w-full h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
																<div
																	className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 rounded-full transition-all duration-300"
																	style={{
																		width: `${adminProgress}%`,
																	}}
																></div>
															</div>
														</div>
													</div>
												);
											} else {
												// Admin with no personal tasks, show only overall progress
												return (
													<div>
														<div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-2">
															<span>
																Overall Progress
															</span>
															<span>
																{
																	overallProgress
																}
																%
															</span>
														</div>
														<div className="w-full h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
															<div
																className="h-full bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-500 rounded-full transition-all duration-300"
																style={{
																	width: `${overallProgress}%`,
																}}
															></div>
														</div>
													</div>
												);
											}
										} else {
											// Regular users - show only their personal progress
											const userSubtasks =
												card.checklist.filter(
													(item) =>
														item.assignees &&
														Array.isArray(
															item.assignees
														) &&
														item.assignees.includes(
															currentUserId
														)
												);

											if (userSubtasks.length === 0)
												return null;

											const completedSubtasks =
												userSubtasks.filter(
													(item) => item.completed
												).length;
											const userProgress = Math.round(
												(completedSubtasks /
													userSubtasks.length) *
													100
											);

											return (
												<div>
													<div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-2">
														<span>
															Your Progress
														</span>
														<span>
															{userProgress}%
														</span>
													</div>
													<div className="w-full h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
														<div
															className="h-full bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-500 rounded-full transition-all duration-300"
															style={{
																width: `${userProgress}%`,
															}}
														></div>
													</div>
												</div>
											);
										}
									})()}
								</motion.div>
							</div>
						</div>
					)}

					{/* Tags Section */}
					{card.tags && card.tags.length > 0 && (
						<div className="mb-6">
							<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
								<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
									<Tag className="w-5 h-5 mr-2 text-purple-500 dark:text-purple-400" />
									Tags
								</h3>

								<motion.div
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.52 }}
								>
									<div className="flex flex-wrap gap-2">
										{card.tags.map((tag, idx) => (
											<span
												key={idx}
												className="px-3 py-1.5 text-sm font-medium rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 midnight:from-purple-900/10 midnight:to-blue-900/10 text-purple-700 dark:text-purple-400 midnight:text-purple-300 border border-purple-200 dark:border-purple-800/50 midnight:border-purple-800/30"
											>
												{tag}
											</span>
										))}
									</div>
								</motion.div>
							</div>
						</div>
					)}

					{/* Description Section */}
					{card.description && (
						<div className="mb-6">
							<div className="bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
								<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-4 flex items-center">
									<AlignLeft className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
									Description
								</h3>

								<motion.div
									initial={{ y: 10, opacity: 0 }}
									animate={{ y: 0, opacity: 1 }}
									transition={{ delay: 0.54 }}
								>
									<p className="text-gray-700 dark:text-gray-300 midnight:text-gray-400 whitespace-pre-wrap leading-relaxed">
										{card.description}
									</p>
								</motion.div>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="p-6 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-end">
					<button
						onClick={onClose}
						className="px-5 py-2.5 text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
					>
						Close
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
};

export default ViewCardModal;
