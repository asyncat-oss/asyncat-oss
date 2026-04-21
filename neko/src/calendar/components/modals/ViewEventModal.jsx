import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Clock,
	Calendar,
	AlignLeft,
	Edit2,
	Trash2,
	Users,
	Share2,
	ExternalLink,
	MapPin,
	Briefcase,
	ChevronDown,
	ChevronRight,
	Check,
	HelpCircle,
	Crown,
} from "lucide-react";
import { COLORS } from "../../data/ColourConstants";
import UserAvatar from "../shared/UserAvatar";
import { calendarEventsApi, calendarUsersApi } from "../../api/calendarApi";

const ViewEventModal = ({
	isOpen,
	onClose,
	event,
	onEdit,
	onDelete,
	currentUserId,
	currentUserEmail, // Add this prop for debugging
	allProjects = [], // Add allProjects prop
	fetchEvents, // Add fetch events callback
}) => {
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [userProfiles, setUserProfiles] = useState({}); // Store fetched user profiles
	const [expandedSections, setExpandedSections] = useState({
		details: true,
		description: true,
		people: true,
	});
	const [isUpdatingResponse, setIsUpdatingResponse] = useState(false);
	const [currentUserResponse, setCurrentUserResponse] = useState(null);

	// Fetch user profiles for attendees (using calendar API)
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

	// Fetch user profiles when event attendees are available
	useEffect(() => {
		if (event?.attendees && Array.isArray(event.attendees)) {
			const userIds = event.attendees
				.map((attendee) => attendee.user_id || attendee.id)
				.filter(Boolean);

			// Also fetch the creator's profile if available
			if (event?.createdBy && !userIds.includes(event.createdBy)) {
				userIds.push(event.createdBy);
			}

			if (userIds.length > 0) {
				fetchUserProfiles(userIds);
			}
		}
	}, [event?.attendees, event?.createdBy]);

	// Get current user's attendee status
	const getCurrentUserAttendeeInfo = () => {
		if (
			!event?.attendees ||
			!Array.isArray(event.attendees) ||
			!currentUserId
		) {
			return null;
		}

		return event.attendees.find(
			(attendee) => attendee.user_id === currentUserId
		);
	};

	const currentUserAttendee = getCurrentUserAttendeeInfo();
	const isCurrentUserAttendee = !!currentUserAttendee;

	// Check if current user is the creator using multiple methods
	const isCurrentUserCreator =
		currentUserAttendee?.status === "creator" ||
		(currentUserId && event?.createdBy === currentUserId);

	const canModifyResponse = isCurrentUserAttendee && !isCurrentUserCreator;

	// Check for attendee access and modification permissions
	useEffect(() => {
		// This effect ensures proper state management for attendee permissions
	}, [
		currentUserId,
		event,
		currentUserAttendee,
		isCurrentUserCreator,
		canModifyResponse,
	]);

	// Initialize current user response when event changes
	useEffect(() => {
		if (currentUserAttendee) {
			setCurrentUserResponse(currentUserAttendee.status || "pending");
		} else {
			setCurrentUserResponse(null);
		}
	}, [currentUserAttendee]);

	// Handle response update with optimistic updates
	const handleResponseUpdate = async (newResponse) => {
		if (!event?.id || !currentUserId || isUpdatingResponse) return;

		// Store the previous response in case we need to rollback
		const previousResponse = currentUserResponse;

		// OPTIMISTIC UPDATE: Update UI immediately
		setCurrentUserResponse(newResponse);

		// Update the event object locally for immediate visual feedback
		if (event.attendees) {
			const updatedAttendees = event.attendees.map((attendee) =>
				attendee.user_id === currentUserId
					? {
							...attendee,
							status: newResponse,
							responded_at: new Date().toISOString(), // Optimistic timestamp
					  }
					: attendee
			);
			event.attendees = updatedAttendees;
		}

		setIsUpdatingResponse(true);

		// Optimistic update already applied above - no backend sync needed in solo mode
		// Optional: Refresh events in the background (non-blocking)
		if (fetchEvents) {
			setTimeout(() => fetchEvents(), 100);
		}

		setIsUpdatingResponse(false);
	};

	// Function to get status badge
	const getStatusBadge = (status) => {
		switch (status) {
			case "accepted":
				return (
					<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 midnight:bg-green-900/20 text-green-700 dark:text-green-300 midnight:text-green-300">
						<Check className="w-3 h-3" />
						Accepted
					</span>
				);
			case "creator":
				return (
					<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300">
						<Crown className="w-3 h-3" />
						Creator
					</span>
				);
			case "maybe":
				return (
					<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 midnight:bg-orange-900/20 text-orange-700 dark:text-orange-300 midnight:text-orange-300">
						<HelpCircle className="w-3 h-3" />
						Maybe
					</span>
				);
			case "declined":
				return (
					<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/20 text-red-700 dark:text-red-300 midnight:text-red-300">
						<X className="w-3 h-3" />
						Declined
					</span>
				);
			case "pending":
			default:
				return (
					<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 midnight:text-yellow-300">
						<HelpCircle className="w-3 h-3" />
						Pending
					</span>
				);
		}
	};

	// Count attendees by status
	const attendeeStatusCounts = useMemo(() => {
		if (!event?.attendees || !Array.isArray(event.attendees)) {
			return {
				accepted: 0,
				pending: 0,
				declined: 0,
				maybe: 0,
				creator: 0,
				total: 0,
			};
		}

		const counts = {
			accepted: 0,
			pending: 0,
			declined: 0,
			maybe: 0,
			creator: 0,
			total: event.attendees.length,
		};

		event.attendees.forEach((attendee) => {
			const status = attendee.status || "pending";
			counts[status] = (counts[status] || 0) + 1;
		});

		return counts;
	}, [event?.attendees]);

	if (!isOpen) return null;

	// Determine if this is a Google Calendar event
	// const isGoogleEvent = event.sourceType === 'google';
	const isGoogleEvent = false; // Always false since Google integration is disabled

	const formatDateRange = () => {
		// Check if this is a multi-day event
		const startDateTime = new Date(
			event.startTime || `${event.date}T${event.start}`
		);
		const endDateTime = new Date(
			event.endTime || `${event.date}T${event.end}`
		);

		// Same day (traditional format)
		if (startDateTime.toDateString() === endDateTime.toDateString()) {
			return {
				dateDisplay: startDateTime.toLocaleDateString(),
				timeDisplay: `${
					event.start || startDateTime.toTimeString().slice(0, 5)
				} - ${event.end || endDateTime.toTimeString().slice(0, 5)}`,
			};
		}

		// Multi-day format
		return {
			dateDisplay: `${startDateTime.toLocaleDateString()} - ${endDateTime.toLocaleDateString()}`,
			timeDisplay: `${startDateTime
				.toTimeString()
				.slice(0, 5)} - ${endDateTime.toTimeString().slice(0, 5)}`,
		};
	};

	const handleDelete = () => {
		if (!showDeleteConfirm) {
			setShowDeleteConfirm(true);
		}
		// Don't handle deletion here - only through the confirmation dialog
	};

	const confirmDelete = () => {
		setIsDeleting(true);
		// Small delay to show deletion animation
		setTimeout(() => {
			onDelete(event);
		}, 300);
	};

	const toggleSection = (section) => {
		setExpandedSections((prev) => ({
			...prev,
			[section]: !prev[section],
		}));
	};
	const { dateDisplay, timeDisplay } = formatDateRange();
	const hasAttendees =
		Array.isArray(event.attendees) &&
		event.attendees.length > 0 &&
		event.attendees.some(
			(attendee) => attendee.user_id || attendee.email || attendee.name
		);
	const baseColor = COLORS[event.color] || COLORS.blue;

	// Check if current user can delete this event
	// Event creators can always delete their events
	// Project admins (project creators) can delete events in their projects
	const canDelete = useMemo(() => {
		if (!currentUserId) return false;

		// Event creator can always delete
		if (event.createdBy === currentUserId) {
			return true;
		}

		// Check if user is project admin (project creator)
		if (event.projectId && allProjects.length > 0) {
			const project = allProjects.find((p) => p.id === event.projectId);
			if (project && project.created_by === currentUserId) {
				return true;
			}
		}

		return false;
	}, [currentUserId, event.createdBy, event.projectId, allProjects]);

	// Check if current user can edit this event
	// Same permission logic as delete: only event creators and project admins can edit
	const canEdit = useMemo(() => {
		if (!currentUserId) return false;

		// Event creator can always edit
		if (event.createdBy === currentUserId) {
			return true;
		}

		// Check if user is project admin (project creator)
		if (event.projectId && allProjects.length > 0) {
			const project = allProjects.find((p) => p.id === event.projectId);
			if (project && project.created_by === currentUserId) {
				return true;
			}
		}

		return false;
	}, [currentUserId, event.createdBy, event.projectId, allProjects]);

	return (
		<motion.div
			className="fixed inset-0 bg-black/30 dark:bg-black/60 midnight:bg-black/80 backdrop-blur-[2px] flex items-center justify-center z-[9999]"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<motion.div
				className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 midnight:border-gray-900 w-[65vw] max-w-[800px] max-h-[85vh] flex flex-col"
				initial={{ scale: 0.95, opacity: 0, y: 10 }}
				animate={{
					scale: isDeleting ? 0.9 : 1,
					y: isDeleting ? -10 : 0,
					opacity: isDeleting ? 0 : 1,
				}}
				transition={{ duration: 0.3 }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="p-5 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between">
					<div className="flex items-center min-w-0 flex-1 mr-3">
						<motion.div
							className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
							style={{ backgroundColor: baseColor.hex }}
						/>
						<div className="min-w-0 flex-1">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-indigo-200 break-words word-wrap">
								{event.title}
							</h2>
							{currentUserId &&
								event.createdBy !== currentUserId && (
									<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-1">
										{(() => {
											if (
												event.projectId &&
												allProjects.length > 0
											) {
												const project =
													allProjects.find(
														(p) =>
															p.id ===
															event.projectId
													);
												if (
													project &&
													project.created_by ===
														currentUserId
												) {
													return "You're the project admin";
												}
											}
											return "You're attending this event";
										})()}
									</p>
								)}
						</div>
					</div>
					<div className="flex items-center">
						{canDelete && (
							<button
								onClick={handleDelete}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									showDeleteConfirm
										? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
										: "text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
								}`}
							>
								<Trash2
									className={`w-4 h-4 ${
										showDeleteConfirm
											? "text-red-600 dark:text-red-400"
											: ""
									}`}
								/>
							</button>
						)}
					</div>
				</div>

				{/* Delete confirmation message */}
				<AnimatePresence>
					{showDeleteConfirm && (
						<motion.div
							className="mx-5 my-2 p-3 bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 border border-red-100 dark:border-red-800 midnight:border-red-900 rounded-lg"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
						>
							<p className="text-sm text-red-700 dark:text-red-400 midnight:text-red-300 font-medium">
								Delete this event? This action cannot be undone.
							</p>
							<div className="flex justify-end space-x-2 mt-3">
								<button
									onClick={() => setShowDeleteConfirm(false)}
									className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-md transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={confirmDelete}
									className="px-3 py-1.5 text-sm bg-red-600 dark:bg-red-700 midnight:bg-red-800 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900 transition-colors"
								>
									Delete
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Content */}
				<div className="overflow-y-auto p-6 flex-grow">
					{/* Current User Response Section - Show only if user is an attendee and not the creator */}
					{canModifyResponse && (
						<div className="mb-6">
							<div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 midnight:from-blue-950/20 midnight:to-indigo-950/20 border border-blue-200 dark:border-blue-800 midnight:border-blue-900 rounded-lg">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-3">
										<div className="w-8 h-8 bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700 rounded-full flex items-center justify-center">
											<Users className="w-4 h-4 text-white" />
										</div>
										<div>
											<h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
												Your Response
											</h4>
											<p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
												Update your attendance status
												for this event
											</p>
										</div>
									</div>
									<div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
										<button
											onClick={() =>
												handleResponseUpdate("accepted")
											}
											disabled={isUpdatingResponse}
											className={`px-3 py-2 rounded text-sm font-medium transition-all flex items-center gap-1 ${
												currentUserResponse ===
												"accepted"
													? "bg-green-500 text-white shadow-sm"
													: "text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
											} ${
												isUpdatingResponse
													? "opacity-50 cursor-not-allowed"
													: "cursor-pointer"
											}`}
										>
											<Check className="w-3 h-3" />
											Accept
										</button>
										<button
											onClick={() =>
												handleResponseUpdate("maybe")
											}
											disabled={isUpdatingResponse}
											className={`px-3 py-2 rounded text-sm font-medium transition-all flex items-center gap-1 ${
												currentUserResponse === "maybe"
													? "bg-orange-500 text-white shadow-sm"
													: "text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
											} ${
												isUpdatingResponse
													? "opacity-50 cursor-not-allowed"
													: "cursor-pointer"
											}`}
										>
											<HelpCircle className="w-3 h-3" />
											Maybe
										</button>
										<button
											onClick={() =>
												handleResponseUpdate("declined")
											}
											disabled={isUpdatingResponse}
											className={`px-3 py-2 rounded text-sm font-medium transition-all flex items-center gap-1 ${
												currentUserResponse ===
												"declined"
													? "bg-red-500 text-white shadow-sm"
													: "text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
											} ${
												isUpdatingResponse
													? "opacity-50 cursor-not-allowed"
													: "cursor-pointer"
											}`}
										>
											<X className="w-3 h-3" />
											Decline
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Basic Details Section */}
					<div className="mb-6">
						<div
							className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
							onClick={() => toggleSection("details")}
						>
							<div className="flex items-center space-x-3">
								<Calendar className="h-5 w-5 text-blue-500 dark:text-blue-400 midnight:text-blue-400" />
								<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-200">
									Event Details
								</h3>
							</div>
							<div>
								{expandedSections.details ? (
									<ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
								) : (
									<ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
								)}
							</div>
						</div>

						<AnimatePresence>
							{expandedSections.details && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2 }}
									className="overflow-hidden"
								>
									<div className="mt-4 bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div className="flex items-start gap-3">
												<Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
												<div>
													<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
														Date
													</p>
													<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
														{dateDisplay}
													</p>
												</div>
											</div>

											<div className="flex items-start gap-3">
												<Clock className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
												<div>
													<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
														Time
													</p>
													<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
														{timeDisplay}
													</p>
												</div>
											</div>

											{/* Project information */}
											{(event.projectId ||
												!isGoogleEvent) && (
												<div className="flex items-start gap-3">
													<Briefcase className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
													<div>
														<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
															Project
														</p>
														<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
															{event.projectId
																? event.projectName ||
																  "Unknown Project"
																: "Personal"}
														</p>
													</div>
												</div>
											)}

											{/* Creator information */}
											{event.createdBy && (
												<div className="flex items-start gap-3">
													<Crown className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
													<div className="flex-1 min-w-0">
														<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
															Creator
														</p>
														<div className="flex items-center gap-2 mt-1">
															<UserAvatar
																user={
																	userProfiles[
																		event
																			.createdBy
																	] || {
																		id: event.createdBy,
																	}
																}
																size="sm"
																showTooltip={
																	true
																}
															/>
															<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 truncate">
																{userProfiles[
																	event
																		.createdBy
																]?.name ||
																	userProfiles[
																		event
																			.createdBy
																	]?.email ||
																	"Loading..."}
															</p>
														</div>
													</div>
												</div>
											)}

											{/* Location (especially useful for Google Calendar events) */}
											{event.location && (
												<div className="flex items-start gap-3">
													<MapPin className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
													<div>
														<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
															Location
														</p>
														<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
															{event.location}
														</p>
													</div>
												</div>
											)}
										</div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{/* Description Section */}
					{event.description && (
						<div className="mb-6">
							<div
								className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
								onClick={() => toggleSection("description")}
							>
								<div className="flex items-center space-x-3">
									<AlignLeft className="h-5 w-5 text-green-500 dark:text-green-400 midnight:text-green-400" />
									<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-200">
										Description
									</h3>
								</div>
								<div>
									{expandedSections.description ? (
										<ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
									) : (
										<ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
									)}
								</div>
							</div>

							<AnimatePresence>
								{expandedSections.description && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.2 }}
										className="overflow-hidden"
									>
										<div className="mt-4 bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
											<p className="text-gray-700 dark:text-gray-300 midnight:text-gray-400 whitespace-pre-wrap leading-relaxed">
												{event.description}
											</p>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					)}
					{/* People Section - Attendees */}
					{hasAttendees && (
						<div className="mb-6">
							<div
								className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
								onClick={() => toggleSection("people")}
							>
								<div className="flex items-center space-x-3">
									<Users className="h-5 w-5 text-indigo-500 dark:text-indigo-400 midnight:text-indigo-400" />
									<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-200">
										People
										{hasAttendees && (
											<span className="ml-3 text-xs bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 px-2 py-1 rounded-full font-medium">
												{event.attendees?.length || 0}
											</span>
										)}
									</h3>
								</div>
								<div>
									{expandedSections.people ? (
										<ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
									) : (
										<ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
									)}
								</div>
							</div>

							<AnimatePresence>
								{expandedSections.people && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.2 }}
										className="overflow-hidden"
									>
										<div className="mt-4 bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
											{/* Attendees section */}
											{hasAttendees && (
												<div className="space-y-3">
													<h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-400 flex items-center justify-between">
														<div className="flex items-center">
															<Users className="w-4 h-4 mr-2" />
															Attendees (
															{
																attendeeStatusCounts.total
															}
															)
														</div>
														<div className="flex items-center gap-2 text-xs">
															{attendeeStatusCounts.accepted >
																0 && (
																<span className="text-green-600 dark:text-green-400">
																	{
																		attendeeStatusCounts.accepted
																	}{" "}
																	accepted
																</span>
															)}
															{attendeeStatusCounts.maybe >
																0 && (
																<span className="text-orange-600 dark:text-orange-400">
																	{
																		attendeeStatusCounts.maybe
																	}{" "}
																	maybe
																</span>
															)}
															{attendeeStatusCounts.pending >
																0 && (
																<span className="text-yellow-600 dark:text-yellow-400">
																	{
																		attendeeStatusCounts.pending
																	}{" "}
																	pending
																</span>
															)}
															{attendeeStatusCounts.declined >
																0 && (
																<span className="text-red-600 dark:text-red-400">
																	{
																		attendeeStatusCounts.declined
																	}{" "}
																	declined
																</span>
															)}
														</div>
													</h4>
													<div className="grid grid-cols-1 gap-3 max-h-48 overflow-y-auto pr-1">
														{event.attendees.map(
															(
																attendee,
																index
															) => {
																const userId =
																	attendee.user_id ||
																	attendee.id;
																const userProfile =
																	userProfiles[
																		userId
																	] ||
																	attendee;

																return (
																	<div
																		key={
																			userId ||
																			attendee.email ||
																			index
																		}
																		className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-gray-700/50 midnight:bg-gray-800/50 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
																	>
																		<div className="flex items-center gap-3 flex-1 min-w-0">
																			<UserAvatar
																				user={
																					userProfile
																				}
																				size="lg"
																				showTooltip={
																					true
																				}
																			/>
																			<div className="flex-1 min-w-0">
																				<p className="text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-semibold truncate">
																					{userProfile.name ||
																						attendee.name ||
																						attendee.email ||
																						"Attendee"}
																				</p>
																				{(userProfile.email ||
																					attendee.email) &&
																					(userProfile.name ||
																						attendee.name) && (
																						<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 truncate">
																							{userProfile.email ||
																								attendee.email}
																						</p>
																					)}
																			</div>
																		</div>
																		<div className="flex-shrink-0">
																			{/* Show response buttons for current user (but not creators) */}
																			{attendee.user_id ===
																				currentUserId &&
																			canModifyResponse ? (
																				<div className="flex items-center gap-2">
																					{/* Response buttons */}
																					<div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-700 rounded-lg">
																						<button
																							onClick={() =>
																								handleResponseUpdate(
																									"accepted"
																								)
																							}
																							disabled={
																								isUpdatingResponse
																							}
																							className={`px-2 py-1 rounded text-xs font-medium transition-all ${
																								currentUserResponse ===
																								"accepted"
																									? "bg-green-500 text-white"
																									: "text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
																							} ${
																								isUpdatingResponse
																									? "opacity-50 cursor-not-allowed"
																									: "cursor-pointer"
																							}`}
																						>
																							Accept
																						</button>
																						<button
																							onClick={() =>
																								handleResponseUpdate(
																									"maybe"
																								)
																							}
																							disabled={
																								isUpdatingResponse
																							}
																							className={`px-2 py-1 rounded text-xs font-medium transition-all ${
																								currentUserResponse ===
																								"maybe"
																									? "bg-orange-500 text-white"
																									: "text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
																							} ${
																								isUpdatingResponse
																									? "opacity-50 cursor-not-allowed"
																									: "cursor-pointer"
																							}`}
																						>
																							Maybe
																						</button>
																						<button
																							onClick={() =>
																								handleResponseUpdate(
																									"declined"
																								)
																							}
																							disabled={
																								isUpdatingResponse
																							}
																							className={`px-2 py-1 rounded text-xs font-medium transition-all ${
																								currentUserResponse ===
																								"declined"
																									? "bg-red-500 text-white"
																									: "text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
																							} ${
																								isUpdatingResponse
																									? "opacity-50 cursor-not-allowed"
																									: "cursor-pointer"
																							}`}
																						>
																							Decline
																						</button>
																					</div>
																				</div>
																			) : (
																				// Show status badge for other attendees and creators
																				getStatusBadge(
																					attendee.status
																				)
																			)}
																		</div>
																	</div>
																);
															}
														)}
													</div>
												</div>
											)}
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					)}
				</div>
				{/* Footer */}
				<div className="p-6 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between">
					{/* Action buttons */}
					<div className="flex items-center space-x-3">
						{!isGoogleEvent && canEdit && (
							<motion.button
								onClick={() => onEdit(event)}
								className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 midnight:from-blue-700 midnight:to-indigo-800 text-white rounded-lg transition-all hover:shadow-md hover:from-blue-600 hover:to-indigo-700 dark:hover:from-blue-700 dark:hover:to-indigo-800 midnight:hover:from-blue-800 midnight:hover:to-indigo-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-600/50 midnight:focus:ring-blue-700/50 flex items-center space-x-2"
								whileHover={{ scale: 1.02 }}
								whileTap={{ scale: 0.98 }}
							>
								<Edit2 className="w-4 h-4" />
								<span>Edit Event</span>
							</motion.button>
						)}
					</div>

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

export default ViewEventModal;
