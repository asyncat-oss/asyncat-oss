import React, { useState, useEffect, useRef, useCallback } from "react";
import {
	X,
	Info,
	KanbanSquare,
	List,
	Clock,
	GanttChartSquare,
	FileText,
	FolderGit2,
	GitBranch,
	Link2,
	Settings,
	Eye,
	Edit3,
	Calendar,
	Save,
	AlertCircle,
	CheckCircle,
	Check,
	AlertTriangle,
	Loader2,
	Shield,
	Trash2,
	Star,
	ChevronDown,
	ChevronUp,
	Plus,
	LayoutGrid,
	UserPlus,
	Users,
	MoreVertical,
	MessageCircle,
	Database,
	LayoutTemplate,
	Target,
	Timer,
	Heart,
} from "lucide-react";
import { usePermissions, getRoleInfo } from "../../utils/permissions";

// Import default profile pictures for avatars
import catDP from "../../assets/dp/CAT.webp";
import dogDP from "../../assets/dp/DOG.webp";
import dolphinDP from "../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../assets/dp/DRAGON.webp";
import elephantDP from "../../assets/dp/ELEPHANT.webp";
import foxDP from "../../assets/dp/FOX.webp";
import lionDP from "../../assets/dp/LION.webp";
import owlDP from "../../assets/dp/OWL.webp";
import penguinDP from "../../assets/dp/PENGUIN.webp";
import wolfDP from "../../assets/dp/WOLF.webp";

import ComponentDataSection from "./ComponentDataSection";

// Mapping for profile picture lookup
const profilePictureMapping = {
	CAT: catDP,
	DOG: dogDP,
	DOLPHIN: dolphinDP,
	DRAGON: dragonDP,
	ELEPHANT: elephantDP,
	FOX: foxDP,
	LION: lionDP,
	OWL: owlDP,
	PENGUIN: penguinDP,
	WOLF: wolfDP,
};

// Helper to get profile picture src for a user/viewer
const getProfilePictureSrc = (profilePicId) => {
	if (!profilePicId) return null;
	if (profilePicId.startsWith("https://")) return profilePicId;
	return profilePictureMapping[profilePicId] || null;
};

// Import API functions
import { projectApi, projectViewsApi, projectMembersApi } from "../projectApi";
import eventBus from "../../utils/eventBus.js";

const soraFontBase = "font-sora";

// Popular emojis for quick selection
const popularEmojis = [
	"📁",
	"🚀",
	"💡",
	"⚡",
	"🎯",
	"📊",
	"🔧",
	"🎨",
	"📱",
	"💻",
	"🌟",
	"🔥",
	"⭐",
	"🎉",
	"🏆",
	"💎",
	"📈",
	"🎮",
	"🎵",
	"📚",
	"🔬",
	"🏠",
	"🌱",
	"⚽",
	"🍕",
	"☕",
	"🎪",
	"🎭",
	"🎨",
	"🔮",
	"🎲",
	"🎸",
];

// Skeleton Components
const MemberSkeleton = () => (
	<div className="flex items-center justify-between p-3 rounded-lg animate-pulse">
		<div className="flex items-center gap-3 flex-1">
			{/* Avatar skeleton */}
			<div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800"></div>
			<div className="flex-1 min-w-0 space-y-2">
				{/* Name skeleton */}
				<div className="h-3 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded w-24"></div>
				{/* Role badge skeleton */}
				<div className="h-2.5 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded w-16"></div>
			</div>
		</div>
		{/* Action button skeleton */}
		<div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded"></div>
	</div>
);

// Save Button Component
const SectionSaveButton = ({ onClick, isSubmitting, saveStatus }) => (
	<button
		type="button"
		onClick={onClick}
		disabled={isSubmitting}
		className="ml-auto bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 midnight:hover:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-900 py-1.5 px-4 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 text-sm"
	>
		{isSubmitting ? (
			<>
				<svg
					className="animate-spin h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						className="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						strokeWidth="4"
					></circle>
					<path
						className="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<span>Saving...</span>
			</>
		) : saveStatus === "saved" ? (
			<>
				<Check className="w-3.5 h-3.5" />
				<span>Saved</span>
			</>
		) : saveStatus === "error" ? (
			<>
				<AlertTriangle className="w-3.5 h-3.5" />
				<span>Failed</span>
			</>
		) : (
			<span>Save</span>
		)}
	</button>
);

// General Settings Section
const GeneralSection = ({
	editedProject,
	handleChange,
	permissions,
	showEmojiPicker,
	setShowEmojiPicker,
	handleEmojiSelect,
	pendingDelete,
	setPendingDelete,
	handleDelete,
	isUpdating,
	onSaveSection,
	isSubmitting,
	saveStatus,
	hasDueDate,
	setHasDueDate,
	setEditedProject,
}) => {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
					General Settings
				</h3>
				<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500">
					Configure basic project information.
				</p>
			</div>

			{/* Project Name & Emoji */}
			<div>
				<label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-2">
					Project Name & Icon
				</label>
				<div className="flex gap-3">
					{/* Emoji Selector */}
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowEmojiPicker(!showEmojiPicker)}
							disabled={!permissions.canEditProject}
							className="w-12 h-12 flex items-center justify-center text-2xl border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors disabled:opacity-50"
							title="Choose project emoji"
						>
							{editedProject.emoji}
						</button>

						{/* Emoji Picker Dropdown */}
						{showEmojiPicker && permissions.canEditProject && (
							<div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg z-50 p-3">
								<div className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 mb-2">
									Choose an emoji
								</div>
								<div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto">
									{popularEmojis.map((emoji, index) => (
										<button
											key={index}
											onClick={() =>
												handleEmojiSelect(emoji)
											}
											className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
										>
											{emoji}
										</button>
									))}
								</div>
								<div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
									<input
										type="text"
										placeholder="Or type any emoji..."
										maxLength="2"
										className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-white midnight:text-indigo-100"
										onChange={(e) => {
											if (e.target.value) {
												handleEmojiSelect(
													e.target.value
												);
											}
										}}
									/>
								</div>
							</div>
						)}
					</div>

					{/* Project Name Input */}
					<div className="flex-1">
						<input
							type="text"
							name="name"
							value={editedProject.name}
							onChange={handleChange}
							className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-blue-400 focus:border-transparent hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-white midnight:text-indigo-100 transition-all duration-150"
							placeholder="Enter project name"
							disabled={!permissions.canEditProject}
						/>
					</div>
				</div>
			</div>

			{/* Description */}
			<div>
				<label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-2">
					Description
				</label>
				<textarea
					name="description"
					value={editedProject.description}
					onChange={handleChange}
					onKeyDown={(e) => {
						// Prevent event propagation for space key
						if (e.key === ' ' || e.code === 'Space') {
							e.stopPropagation();
						}
					}}
					rows={3}
					className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-blue-400 focus:border-transparent hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-white midnight:text-indigo-100 transition-all duration-150 resize-none"
					placeholder="Describe your project..."
					disabled={!permissions.canEditProject}
				/>
			</div>

			{/* Due Date */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
						Due Date
					</label>
					<label className="flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={hasDueDate}
							onChange={(e) => {
								setHasDueDate(e.target.checked);
								if (!e.target.checked) {
									setEditedProject((prev) => ({
										...prev,
										due_date: "",
									}));
								}
							}}
							disabled={!permissions.canEditProject}
							className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
						/>
						<span className="ml-2 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
							Set due date
						</span>
					</label>
				</div>
				{hasDueDate && (
					<input
						type="date"
						name="due_date"
						value={editedProject.due_date}
						onChange={handleChange}
						className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-blue-400 focus:border-transparent hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-gray-600 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-white midnight:text-indigo-100 transition-all duration-150"
						disabled={!permissions.canEditProject}
					/>
				)}
			</div>

			{/* Danger Zone */}
			{permissions.canDelete && (
				<div className="mt-8">
					<div className="rounded-lg p-4 bg-red-50/30 dark:bg-red-900/5 midnight:bg-red-900/5">
						<h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
							Danger Zone
						</h4>
						<p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-3">
							Once you delete this project, there is no going
							back. Please be certain.
						</p>
						{pendingDelete ? (
							<div className="flex items-center gap-2">
								<span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
									Are you sure? This action cannot be undone.
								</span>
								<button
									type="button"
									onClick={handleDelete}
									disabled={isUpdating}
									className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs transition-colors disabled:opacity-50"
								>
									{isUpdating ? "Deleting..." : "Yes, Delete"}
								</button>
								<button
									type="button"
									onClick={() => setPendingDelete(false)}
									disabled={isUpdating}
									className="hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 py-1.5 px-3 rounded-lg text-xs transition-colors"
								>
									Cancel
								</button>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setPendingDelete(true)}
								className="hover:bg-red-50 dark:hover:bg-red-900/10 midnight:hover:bg-red-900/10 text-red-600 dark:text-red-500 midnight:text-red-500 py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center gap-1.5"
							>
								<Trash2 className="w-3.5 h-3.5" />
								Delete Project
							</button>
						)}
					</div>
				</div>
			)}

			{/* Save Button at bottom */}
			{permissions.canEditProject && (
				<div className="pt-4 flex justify-end">
					<SectionSaveButton
						onClick={onSaveSection}
						isSubmitting={isSubmitting}
						saveStatus={saveStatus}
					/>
				</div>
			)}
		</div>
	);
};

// View Card Component - Sleek minimal design
const ViewCard = ({
	viewKey,
	config,
	isSelected,
	isRequired,
	isEnabled,
	onToggle,
	className = "",
}) => {
	if (!config) return null;

	return (
		<div
			onClick={() => !isRequired && onToggle(viewKey)}
			className={`group relative transition-all duration-300 ${
				!isRequired ? "cursor-pointer" : "cursor-default"
			} ${className}`}
		>
			{/* View Card */}
			<div
				className={`relative p-4 rounded-lg transition-all duration-200 ${
					isSelected || isRequired
						? "bg-white dark:bg-gray-800 midnight:bg-gray-800 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50"
						: isEnabled
						? "bg-transparent hover:bg-gray-100/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-800/30 active:scale-[0.98]"
						: "bg-transparent opacity-40"
				}`}
			>
				{/* Selection Indicator - More subtle */}
				{(isSelected || isRequired) && (
					<div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-green-500 dark:bg-green-400 midnight:bg-green-400 flex items-center justify-center">
						<Check className="w-2.5 h-2.5 text-white" />
					</div>
				)}

				{/* Required Badge - Smaller */}
				{isRequired && (
					<div className="absolute top-2 left-2">
						<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100/80 dark:bg-amber-900/20 midnight:bg-amber-900/15 text-amber-700 dark:text-amber-300 midnight:text-amber-300">
							Required
						</span>
					</div>
				)}

				{/* View Icon - Cleaner spacing */}
				<div className="flex items-center justify-center mb-4">
					<div className="text-3xl opacity-90">
						{config.emoji || "📦"}
					</div>
				</div>

				{/* View Title - More refined typography */}
				<h4
					className={`font-medium text-sm mb-2 transition-colors duration-200 ${
						isEnabled
							? "text-gray-900 dark:text-gray-100 midnight:text-gray-100"
							: "text-gray-500 dark:text-gray-500 midnight:text-gray-500"
					}`}
				>
					{config.label}
				</h4>

				{/* View Description - More subtle */}
				<p
					className={`text-xs leading-relaxed transition-colors duration-200 ${
						isEnabled
							? "text-gray-600 dark:text-gray-400 midnight:text-gray-400"
							: "text-gray-400 dark:text-gray-600 midnight:text-gray-600"
					}`}
				>
					{config.description}
				</p>

				{/* Disabled Overlay - More subtle */}
				{!isEnabled && !isRequired && (
					<div className="absolute inset-0 rounded-lg flex items-center justify-center">
						<span className="text-xs font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-500 bg-gray-100/80 dark:bg-gray-800/80 midnight:bg-gray-800/80 px-2 py-1 rounded">
							Disabled
						</span>
					</div>
				)}
			</div>
		</div>
	);
};

// Unified Components Section — clean single-table design
const ComponentsSection = ({
	selectedViews,
	availableViews,
	toggleViewPreference,
	resetViewPreferences,
	allViewsConfig,
	requiredViews,
	enabledViews,
	toggleProjectView,
	permissions,
	onSaveSection,
	isSubmitting,
	saveStatus,
	project,
	onSuccess,
	onError,
	userRole,
}) => {
	const isOwner = userRole === "owner";

	return (
		<div className="space-y-8">
			{/* Header */}
			<div>
				<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
					Views &amp; Components
				</h3>
				<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500">
					{isOwner
						? "Enable views for the whole project, then choose which ones appear in your own sidebar."
						: "Choose which views appear in your sidebar navigation."}
				</p>
			</div>

			{/* Table */}
			<div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 overflow-hidden">
				{/* Column headers */}
				<div className={`grid ${isOwner ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} gap-x-6 px-4 py-2 bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-700`}>
					<span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">View</span>
					{isOwner && (
						<span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center whitespace-nowrap">Project</span>
					)}
					<span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center whitespace-nowrap">My sidebar</span>
				</div>

				{/* Rows */}
				{Object.keys(allViewsConfig).map((viewKey, idx, arr) => {
					const config = allViewsConfig[viewKey];
					if (!config) return null;

					const isEnabled = enabledViews.includes(viewKey);
					const isRequired = requiredViews.includes(viewKey);
					// User pref only applies to project-enabled views
					const isInMyView = selectedViews.includes(viewKey);
					const userPrefDisabled = !isEnabled; // can't set pref for a disabled view
					const IconComponent = config.icon;
					const isLast = idx === arr.length - 1;

					return (
						<div
							key={viewKey}
							className={`grid ${isOwner ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} gap-x-6 items-center px-4 py-3 ${
								!isLast ? "border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800" : ""
							} ${!isEnabled && isOwner ? "opacity-50" : ""} bg-white dark:bg-gray-900 midnight:bg-gray-950`}
						>
							{/* View info */}
							<div className="flex items-center gap-3 min-w-0">
								<div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex items-center justify-center flex-shrink-0">
									<IconComponent className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
								</div>
								<div className="min-w-0">
									<div className="flex items-center gap-1.5">
										<span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
											{config.label}
										</span>
										{isRequired && (
											<span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">Required</span>
										)}
									</div>
								</div>
							</div>

							{/* Project-level toggle (owner only) */}
							{isOwner && (
								<div className="flex justify-center">
									<button
										type="button"
										onClick={() => !isRequired && toggleProjectView(viewKey)}
										disabled={isRequired}
										title={isRequired ? "Required — cannot disable" : isEnabled ? "Disable for everyone" : "Enable for everyone"}
										className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
											isRequired ? "cursor-default" : "cursor-pointer"
										} ${isEnabled ? "bg-indigo-500 dark:bg-indigo-500" : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600"}`}
									>
										<span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${isEnabled ? "translate-x-4" : "translate-x-0"}`} />
									</button>
								</div>
							)}

							{/* My sidebar toggle */}
							<div className="flex justify-center">
								<button
									type="button"
									onClick={() => !isRequired && !userPrefDisabled && toggleViewPreference(viewKey)}
									disabled={isRequired || userPrefDisabled}
									title={
										isRequired ? "Required — always shown" :
										userPrefDisabled ? "Disabled at project level" :
										isInMyView ? "Hide from my sidebar" : "Show in my sidebar"
									}
									className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
										isRequired || userPrefDisabled ? "cursor-default" : "cursor-pointer"
									} ${isInMyView && !userPrefDisabled ? "bg-emerald-500 dark:bg-emerald-500" : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600"}`}
								>
									<span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${isInMyView && !userPrefDisabled ? "translate-x-4" : "translate-x-0"}`} />
								</button>
							</div>
						</div>
					);
				})}
			</div>

			{/* Legend */}
			{isOwner && (
				<div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-800/20 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700">
					<Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
					<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
						<span className="font-medium text-gray-700 dark:text-gray-300">Project</span> controls what's available to everyone. <span className="font-medium text-gray-700 dark:text-gray-300">My sidebar</span> is just your personal navigation preference — other members aren't affected.
					</p>
				</div>
			)}

			{/* Save */}
			<div className="flex justify-end border-t border-gray-200 dark:border-gray-700 midnight:border-gray-700 pt-4">
				<SectionSaveButton
					onClick={onSaveSection}
					isSubmitting={isSubmitting}
					saveStatus={saveStatus}
				/>
			</div>

			{/* SECTION 3: Data Management (Owner Only) */}
			{userRole === "owner" && (
				<div className="space-y-6 pt-10 border-t border-gray-200 dark:border-gray-800 midnight:border-gray-800">
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex items-center justify-center flex-shrink-0">
							<Database className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
						</div>
						<div className="flex-1">
							<div className="flex items-center gap-2 mb-1">
								<h3 className="text-base font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
									Data Management
								</h3>
								<span className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500">
									Owner Only
								</span>
							</div>
							<p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
								Permanently delete component data. These actions
								cannot be undone.
							</p>
						</div>
					</div>

					{/* Data Management Component */}
					<ComponentDataSection
						project={project}
						permissions={permissions}
						onSuccess={onSuccess}
						onError={onError}
					/>
				</div>
			)}
		</div>
	);
};

// Project Members Section - inline invite + member list
const MembersSection = ({
	projectMembers,
	pendingInvites,
	removingMembers,
	handleRemoveMember,
	handleLeaveProject,
	permissions,
	projectId,
	projectOwnerId,
	currentUserId,
	userRole,
	loadingMembers,
	onMemberAdded,
}) => {
	const canLeaveProject = () => {
		if (userRole === "owner") {
			const ownerIds = new Set();
			if (projectOwnerId) ownerIds.add(projectOwnerId);
			projectMembers.forEach((m) => {
				if (m.role === "owner" && m.user_id) ownerIds.add(m.user_id);
			});
			return ownerIds.size > 1;
		}
		return true;
	};

	return (
		<div className="space-y-6">

			{/* Members list */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
						Members
					</h4>
					{!loadingMembers && projectMembers.length > 0 && (
						<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300">
							{projectMembers.length} {projectMembers.length === 1 ? 'member' : 'members'}
						</span>
					)}
				</div>

				{loadingMembers ? (
					<div className="space-y-3">
						{[...Array(3)].map((_, i) => <MemberSkeleton key={i} />)}
					</div>
				) : (projectMembers.length === 0 && pendingInvites.length === 0) ? (
					<div className="text-center py-10">
						<Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
						<p className="text-sm text-gray-500 dark:text-gray-400">No team members yet</p>
					</div>
				) : (
					<div className="space-y-2">
						{projectMembers.map((member, index) => {
							const isRemoving = removingMembers.has(member.user_id || member.id);
							const roleInfo = getRoleInfo(member.role || "member");
							const isCurrentUser = member.id === currentUserId || member.user_id === currentUserId;
							const memberName = member.name || member.email || "Unknown";
							const profilePictureSrc = getProfilePictureSrc(member.profile_picture);

							return (
								<div
									key={member.user_id || member.id || index}
									className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-800/20 border border-gray-100 dark:border-gray-800 midnight:border-gray-800"
								>
									<div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden border-2 border-white dark:border-gray-800">
										{profilePictureSrc ? (
											<img src={profilePictureSrc} alt={memberName} className="w-full h-full object-cover" />
										) : (
											<div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-sm font-semibold text-white">
												{memberName.charAt(0).toUpperCase()}
											</div>
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">{memberName}</span>
											{isCurrentUser && <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">(you)</span>}
										</div>
										{member.email && (
											<div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{member.email}</div>
										)}
									</div>
									<div className="flex items-center gap-2 flex-shrink-0">
										<span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300">
											{roleInfo.label}
										</span>
										{isCurrentUser && canLeaveProject() && (
											<button
												onClick={handleLeaveProject}
												disabled={isRemoving}
												className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
											>
												{isRemoving ? 'Leaving...' : 'Leave'}
											</button>
										)}
										{!isCurrentUser && permissions.canEditProject && member.role !== 'owner' && (
											<button
												onClick={() => handleRemoveMember(member.user_id || member.id)}
												disabled={isRemoving}
												className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-transparent hover:border-red-200 dark:hover:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
												title="Remove member"
											>
												{isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
											</button>
										)}
									</div>
								</div>
							);
						})}

						{pendingInvites.map((invite) => {
							const isRemoving = removingMembers.has(invite.user_id || invite.id);
							return (
								<div
									key={invite.user_id || invite.id}
									className="flex items-center gap-4 p-4 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-800/40"
								>
									<div className="w-10 h-10 rounded-full flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-gray-800 flex items-center justify-center">
										<Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
									</div>
									<div className="flex-1 min-w-0">
										<span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate block">{invite.email || invite.name || 'Unknown'}</span>
										<span className="text-xs text-amber-600 dark:text-amber-400">Pending invitation</span>
									</div>
									{permissions.canEditProject && (
										<button
											onClick={() => handleRemoveMember(invite.user_id || invite.id)}
											disabled={isRemoving}
											className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-transparent hover:border-red-200 dark:hover:border-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
											title="Cancel invitation"
										>
											{isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
										</button>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Leave warning for sole owner */}
			{userRole === "owner" && !canLeaveProject() && (
				<div className="p-3 rounded-lg bg-amber-50/30 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-800/30">
					<div className="flex items-start gap-2">
						<AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
						<div className="text-xs text-gray-600 dark:text-gray-400">
							<p className="font-medium mb-0.5">Cannot leave project</p>
							<p>As the only owner, assign another owner first or delete the project.</p>
						</div>
					</div>
				</div>
			)}

			{/* Info box placeholder start */}
			<div className="p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/20 midnight:bg-gray-800/20">
				<div className="flex items-start gap-2">
					<Info className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-500 mt-0.5 flex-shrink-0" />
					<div className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
						<p className="font-medium mb-1">Team Member Roles</p>
						<p>
							<strong>Owner:</strong> Full control including
							deletion and member management.{" "}
							<strong>Member:</strong> Can create and edit all
							project content.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

// Main Modal Component - ENHANCED WITH LOADING STATES
const ProjectSettingsModal = ({
	isOpen,
	project,
	onClose,
	onSave,
	onDelete,
	isUpdating,
	session,
	onLocalUpdate,
	initialTab = "general",
	isPage = false,
}) => {
	// UI feedback states
	const [saveStatus, setSaveStatus] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [activeTab, setActiveTab] = useState(initialTab);

	// Reset active tab when modal opens with new initialTab
	useEffect(() => {
		if (isPage || isOpen) {
			setActiveTab(initialTab);
		}
	}, [isOpen, isPage, initialTab]);

	const [editedProject, setEditedProject] = useState({
		name: "",
		description: "",
		due_date: "",
		enabled_views: [],
		members: [],
		emoji: "📁",
	});

	const [hasDueDate, setHasDueDate] = useState(false);

	const [selectedViews, setSelectedViews] = useState([]);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);

	// Members state with loading
	const [projectMembers, setProjectMembers] = useState(
		project?.project_members || []
	);
	const [pendingInvites, setPendingInvites] = useState([]);
	const [loadingMembers, setLoadingMembers] = useState(false);
	const [removingMembers, setRemovingMembers] = useState(new Set());

	// Member removal confirmation state
	const [memberToRemove, setMemberToRemove] = useState(null);
	const [removalConfirmation, setRemovalConfirmation] = useState(null);
	const [showRemovalDialog, setShowRemovalDialog] = useState(false);

	// Get user's permissions for this project - prefer `project.owner_id` as canonical owner
	const currentUserId = session?.user?.id;
	const userRole =
		project?.owner_id && currentUserId && project.owner_id === currentUserId
			? "owner"
			: project?.user_role || "viewer";
	const permissions = usePermissions(userRole);

	// Define all possible views with their metadata - Using Lucide icons instead of emojis
	const allViewsConfig = {
		kanban: {
			label: "Kanban",
			icon: KanbanSquare,
			description: "Board view with columns and cards",
		},
		list: {
			label: "List",
			icon: List,
			description: "Simple list view of tasks and items",
		},
		timeline: {
			label: "Timeline",
			icon: Clock,
			description: "Chronological timeline view",
		},
		gantt: {
			label: "Gantt",
			icon: GanttChartSquare,
			description: "Gantt chart for project planning",
		},
		network: {
			label: "Network",
			icon: Link2,
			description: "Network diagram and dependencies",
		},
		notes: {
			label: "Notes",
			icon: FileText,
			description: "Project notes and documentation",
		},
		habits: {
			label: "Habits",
			icon: Target,
			description: "Track recurring activities and build healthy habits",
		},
		storage: {
			label: "Storage",
			icon: FolderGit2,
			description: "File storage and attachments",
		},
		gallery: {
			label: "Gallery",
			icon: LayoutGrid,
			description: "Visual gallery view of tasks and items",
		},
	};

	// No more required views - all views are completely optional
	const requiredViews = [];

	// Define tabs — Members tab removed (single-user mode)
	const tabs = [
		{
			id: "general",
			label: "General",
			icon: <Settings size={18} />,
			description: "Basic project settings and information",
		},
		{
			id: "components",
			label: "Components",
			icon: <LayoutGrid size={18} />,
			description: "Manage component visibility and data",
		},
	];

	// Initialize when modal opens (or when rendered as a page)
	useEffect(() => {
		if ((isPage || isOpen) && project) {
			const projectDueDate = project.due_date
				? project.due_date.split("T")[0]
				: "";
			const projectHasDueDate = Boolean(project.due_date);

			// Initialize with project's enabled views (owner control)
			const projectEnabledViews = project.enabled_views || Object.keys(allViewsConfig);

			setEditedProject({
				name: project.name || "",
				description: project.description || "",
				due_date: projectDueDate,
				enabled_views: projectEnabledViews, // Project-level components
				members: project.project_members || [],
				emoji: project.emoji || "📁",
			});

			setHasDueDate(projectHasDueDate);

			// Initialize view preferences - user's personal display preferences
			// These should be a subset of enabled_views
			const userPrefs =
				project.user_view_preferences ||
				project.user_visible_views ||
				projectEnabledViews; // Default to all enabled views
			setSelectedViews([...userPrefs]);

			setError(null);
			setSuccess(null);
			setPendingDelete(false);
			setIsLeaving(false);
		}
	}, [isOpen, isPage, project]);

	const handleChange = useCallback((e) => {
		const { name, value } = e.target;
		setEditedProject((prev) => ({ ...prev, [name]: value }));
	}, []);

	// Get available views for this project - returns project's enabled views
	const getAvailableViews = () => {
		// Return enabled views from project (what owner has enabled)
		return editedProject.enabled_views || Object.keys(allViewsConfig);
	};

	const availableViews = getAvailableViews();

	// Handle emoji selection
	const handleEmojiSelect = (emoji) => {
		setEditedProject((prev) => ({ ...prev, emoji }));
		setShowEmojiPicker(false);
	};

	// Toggle project-level view availability (OWNER ONLY)
	// Simple toggle - data is preserved when disabling (just hidden)
	const toggleProjectView = (viewKey) => {
		setEditedProject((prev) => {
			const currentEnabledViews = prev.enabled_views || [];
			const isCurrentlyEnabled = currentEnabledViews.includes(viewKey);
			const newEnabledViews = isCurrentlyEnabled
				? currentEnabledViews.filter((v) => v !== viewKey)
				: [...currentEnabledViews, viewKey];
			
			// Also update user's view preferences when disabling
			if (isCurrentlyEnabled) {
				setSelectedViews((prevSelected) => prevSelected.filter((v) => v !== viewKey));
			}
			
			return { ...prev, enabled_views: newEnabledViews };
		});
	};

	// Toggle view in user preferences
	const toggleViewPreference = (viewKey) => {
		// No required views anymore
		setSelectedViews((prev) =>
			prev.includes(viewKey)
				? prev.filter((v) => v !== viewKey)
				: [...prev, viewKey]
		);
	};

	// Reset view preferences to default
	const resetViewPreferences = () => {
		setSelectedViews([...availableViews]);

		// Invalidate cache since this will trigger a save
		sessionStorage.removeItem("asyncat-projects-cache");
		eventBus.emit("projectsUpdated");
	};

	// Load project members — single-user mode: no members to load.
	const loadProjectMembers = async () => {
		setProjectMembers([]);
		setPendingInvites([]);
		setLoadingMembers(false);
	};

	// Remove member from project
	const handleRemoveMember = async (memberId) => {
		// Show confirmation dialog directly
		setMemberToRemove(memberId);
		setRemovalConfirmation({
			warning:
				"Removing this member will delete all their data including cards, habits, notes, and events in this project. This action cannot be undone.",
			cardsCount: 0,
			columnsCount: 0,
			habitsCount: 0,
			notesCount: 0,
			eventsCount: 0,
		});
		setShowRemovalDialog(true);
	};

	const confirmMemberRemoval = async () => {
		if (!memberToRemove || !project?.id) return;

		try {
			setRemovingMembers((prev) => new Set(prev).add(memberToRemove));

			const result = await projectMembersApi.removeProjectMember(
				project.id,
				memberToRemove
			);

			setSuccess(result.message || "Member removed successfully!");
			await loadProjectMembers(); // Reload members list

			// Clear success message after 3 seconds
			setTimeout(() => setSuccess(null), 3000);
		} catch (err) {
			setError(err.message || "Failed to remove member");
			setTimeout(() => setError(null), 5000);
		} finally {
			setRemovingMembers((prev) => {
				const newSet = new Set(prev);
				newSet.delete(memberToRemove);
				return newSet;
			});
			setShowRemovalDialog(false);
			setMemberToRemove(null);
			setRemovalConfirmation(null);
		}
	};

	const cancelMemberRemoval = () => {
		setShowRemovalDialog(false);
		setMemberToRemove(null);
		setRemovalConfirmation(null);
	};

	// NEW: Leave project handler
	const handleLeaveProject = async () => {
		try {
			setError(null);
			setRemovingMembers((prev) => new Set(prev).add(session?.user?.id));

			// Use the new leave project API
			await projectApi.leaveProject(project.id);

			setSuccess(
				"You have successfully left the project. Redirecting..."
			);

			// Wait a moment then close modal and trigger redirect
			setTimeout(() => {
				onClose();
				// Trigger a refresh of the projects list or redirect to projects page
				window.location.href = "/projects";
			}, 2000);
		} catch (err) {
			setError(err.message || "Failed to leave project");
			setTimeout(() => setError(null), 5000);
		} finally {
			setRemovingMembers((prev) => {
				const newSet = new Set(prev);
				newSet.delete(session?.user?.id);
				return newSet;
			});
		}
	};


	// Update project members when project changes
	useEffect(() => {
		if (project) {
			// Filter to only include actual team members (exclude viewers/guests)
			const allMembers = project.project_members || [];
			const actualMembers = allMembers.filter((member) => {
				const role = member.role || "viewer";
				return role !== "viewer" && role !== "guest"; // Only include owners, members, etc.
			});

			// Update roles: if someone is the canonical owner (project.owner_id), ensure their role is 'owner'
			if (project.owner_id) {
				actualMembers.forEach((member) => {
					if (
						member.user_id === project.owner_id ||
						member.id === project.owner_id
					) {
						member.role = "owner";
					}
				});
			}

			setProjectMembers(actualMembers);
		}
	}, [project, session?.user]);

	// Load members when modal opens (or when rendered as a page)
	useEffect(() => {
		if ((isPage || isOpen) && project?.id) {
			loadProjectMembers();
		}
	}, [isOpen, isPage, project?.id]);

	// Prevent members list from resetting when window regains focus
	useEffect(() => {
		if (!isOpen) return;

		const handleVisibilityChange = (e) => {
			// Stop the event from propagating to prevent other handlers
			if (document.hidden === false && isOpen) {
				e.stopImmediatePropagation();
			}
		};

		document.addEventListener(
			"visibilitychange",
			handleVisibilityChange,
			true
		);

		return () => {
			document.removeEventListener(
				"visibilitychange",
				handleVisibilityChange,
				true
			);
		};
	}, [isOpen]);

	// Handle save - HIERARCHICAL: enabled_views (owner) vs view_preferences (all members)
	const handleSave = useCallback(async () => {
		setError(null);
		setSuccess(null);

		try {
			setSaveStatus("saving");
			setIsSubmitting(true);

			// PART 1: Save project settings if user has permission
			if (permissions.canEditProject) {
				// Check for changes, accounting for due date state
				const currentDueDate =
					hasDueDate && editedProject.due_date
						? editedProject.due_date
						: null;
				const originalDueDate = project.due_date
					? project.due_date.split("T")[0]
					: null;

				const generalChanges =
					editedProject.name !== (project.name || "") ||
					editedProject.description !== (project.description || "") ||
					currentDueDate !== originalDueDate ||
					editedProject.emoji !== (project.emoji || "📁");

				if (generalChanges) {
					// Only send the fields that should be updated for general settings
					const projectData = {
						name: editedProject.name,
						description: editedProject.description,
						due_date:
							hasDueDate && editedProject.due_date
								? editedProject.due_date
								: null,
						emoji: editedProject.emoji,
					};

					const result = await onSave(projectData);
					if (!result) {
						throw new Error("Failed to save project settings");
					}

					// Dispatch event to update project lists across the app
					eventBus.emit("projectsUpdated");
				}
			}

			// PART 2: Save project-level enabled components (OWNER ONLY)
			// Only owners can modify which components are available in the project
			if (userRole === 'owner' && editedProject.enabled_views) {
				const originalEnabledViews = project.enabled_views || [];
				const hasEnabledViewsChanges =
					JSON.stringify(editedProject.enabled_views.sort()) !==
					JSON.stringify(originalEnabledViews.sort());

				if (hasEnabledViewsChanges) {
					// Call the project update API with enabled_views
					const projectData = {
						enabled_views: editedProject.enabled_views,
					};

					const result = await onSave(projectData);
					if (!result) {
						throw new Error("Failed to save project components");
					}

					// Invalidate cache and notify
					sessionStorage.removeItem("asyncat-projects-cache");
					eventBus.emit("projectsUpdated");
				}
			}

			// PART 3: Save user view preferences (ALL MEMBERS)
			// All members can customize what they see from available components
			const originalViewPrefs =
				project.user_view_preferences ||
				project.user_visible_views ||
				[];
			const hasViewChanges =
				JSON.stringify(selectedViews.sort()) !==
				JSON.stringify(originalViewPrefs.sort());

			if (hasViewChanges) {
				await projectViewsApi.updateUserViewPreferences(
					project.id,
					selectedViews
				);

				// Invalidate projects cache to prevent stale data on other projects
				sessionStorage.removeItem("asyncat-projects-cache");
				eventBus.emit("projectsUpdated");

				// Immediately update local state
				if (onLocalUpdate) {
					onLocalUpdate({
						user_view_preferences: selectedViews,
						user_visible_views: selectedViews,
					});
				}
			}

			setSaveStatus("saved");
			setTimeout(() => setSaveStatus(null), 2000);
			setIsSubmitting(false);
		} catch (error) {
			// Surface friendly message; avoid console logging in production
			setError(error.message || "Failed to save settings");
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
			setIsSubmitting(false);
		}
	}, [editedProject, selectedViews, project, permissions, onSave, userRole]);

	// Simple close handler
	const handleClose = useCallback(
		(e) => {
			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}

			if (!isLeaving) {
				setIsLeaving(true);
				setTimeout(() => {
					setIsLeaving(false);
					onClose();
				}, 250);
			}
		},
		[onClose, isLeaving]
	);

	// Handle delete
	const handleDelete = async () => {
		if (!pendingDelete) {
			setPendingDelete(true);
			return;
		}

		try {
			setIsSubmitting(true);
			// Call the project deletion API directly
			await projectApi.deleteProject(project.id);

			// Dispatch event to update project lists across the app
			eventBus.emit("projectsUpdated");

			// Call the onDelete callback to update the UI
			if (onDelete) {
				await onDelete(project);
			}
			onClose();
		} catch (error) {
			// Avoid console logs in production; set user-facing error
			setError(error.message || "Failed to delete project");
			setPendingDelete(false);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Render tab content
	const renderTabContent = () => {
		switch (activeTab) {
			case "general":
				return (
					<GeneralSection
						editedProject={editedProject}
						handleChange={handleChange}
						permissions={permissions}
						showEmojiPicker={showEmojiPicker}
						setShowEmojiPicker={setShowEmojiPicker}
						handleEmojiSelect={handleEmojiSelect}
						pendingDelete={pendingDelete}
						setPendingDelete={setPendingDelete}
						handleDelete={handleDelete}
						isUpdating={isUpdating}
						onSaveSection={handleSave}
						isSubmitting={isSubmitting}
						saveStatus={saveStatus}
						hasDueDate={hasDueDate}
						setHasDueDate={setHasDueDate}
						setEditedProject={setEditedProject}
					/>
				);
			case "components":
				return (
					<ComponentsSection
						selectedViews={selectedViews}
						availableViews={availableViews}
						toggleViewPreference={toggleViewPreference}
						resetViewPreferences={resetViewPreferences}
						allViewsConfig={allViewsConfig}
						requiredViews={requiredViews}
						enabledViews={editedProject.enabled_views || []}
						toggleProjectView={toggleProjectView}
						permissions={permissions}
						onSaveSection={handleSave}
						isSubmitting={isSubmitting}
						saveStatus={saveStatus}
						project={project}
						onSuccess={(message) => {
							setSuccess(message);
							setTimeout(() => setSuccess(null), 5000);
						}}
						onError={(message) => {
							setError(message);
							setTimeout(() => setError(null), 5000);
						}}
						userRole={userRole}
					/>
				);
			case "members":
				return (
					<MembersSection
						projectMembers={projectMembers}
						pendingInvites={pendingInvites}
						removingMembers={removingMembers}
						handleRemoveMember={handleRemoveMember}
						handleLeaveProject={handleLeaveProject}
						permissions={permissions}
						projectId={project?.id}
						projectOwnerId={project?.owner_id}
						currentUserId={session?.user?.id}
						userRole={userRole}
						loadingMembers={loadingMembers}
						onMemberAdded={loadProjectMembers}
					/>
				);
			default:
				return null;
		}
	};

	if (!isPage && !isOpen) return null;

	const innerContent = (
		<>
			<div className={`flex h-full relative bg-white dark:bg-gray-800 midnight:bg-gray-900 ${isPage ? '' : `transition-all duration-200 ease-in-out ${isLeaving ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}`}>
					{/* Status Messages */}
					{(error || success) && (
						<div className="absolute top-4 right-4 z-50">
							{error && (
								<div className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 rounded-lg mb-2">
									<AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 midnight:text-red-300 mr-2 flex-shrink-0" />
									<span className="text-red-700 dark:text-red-400 midnight:text-red-300 text-sm">
										{error}
									</span>
								</div>
							)}
							{success && (
								<div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 rounded-lg">
									<CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 midnight:text-green-300 mr-2 flex-shrink-0" />
									<span className="text-green-700 dark:text-green-400 midnight:text-green-300 text-sm">
										{success}
									</span>
								</div>
							)}
						</div>
					)}

					{/* Left Sidebar - Navigation */}
					<div className="w-80 bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col border-r border-gray-200 dark:border-gray-800 midnight:border-gray-800">
						{/* Header */}
						<div className="p-6 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
							<div className="flex items-center gap-3">
								<span className="text-xl">
									{editedProject.emoji}
								</span>
								<div>
									<h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
										Settings
									</h2>
									<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500 mt-0.5">
										{editedProject.name ||
											"Configure your project"}
									</p>
								</div>
							</div>
						</div>

						{/* Navigation Menu */}
						<div className="flex-1 overflow-y-auto px-4 pb-4 pt-4 space-y-1">
							{tabs.map((tab) => (
								<button
									key={tab.id}
									onClick={() => setActiveTab(tab.id)}
									className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-all duration-200
                    ${
						activeTab === tab.id
							? "bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-200 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50"
							: "bg-transparent text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-gray-100 active:scale-[0.98]"
					}`}
								>
									<div className="flex items-center gap-2.5 w-full">
										<div className="flex-shrink-0">
											{tab.icon}
										</div>
										<div className="flex-1 min-w-0">
											<div className="text-sm">
												{tab.label}
											</div>
										</div>
									</div>
								</button>
							))}
						</div>
					</div>

					{/* Right Content Area */}
					<div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 midnight:bg-gray-900">
						{/* Content Header */}
						<div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
							<div className="flex items-center gap-2.5">
								<div className="text-gray-400 dark:text-gray-500 midnight:text-gray-500">
									{
										tabs.find((tab) => tab.id === activeTab)
											?.icon
									}
								</div>
								<div>
									<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
										{
											tabs.find(
												(tab) => tab.id === activeTab
											)?.label
										}
									</h3>
									<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500 mt-0.5">
										{
											tabs.find(
												(tab) => tab.id === activeTab
											)?.description
										}
									</p>
								</div>
							</div>
						</div>

						{/* Content Body */}
						<div className="flex-1 overflow-y-auto p-6">
							<div className="max-w-2xl">
								{renderTabContent()}
							</div>
						</div>
					</div>

					{/* Click outside handlers */}
					{showEmojiPicker && (
						<div
							className="fixed inset-0 z-40"
							onClick={() => setShowEmojiPicker(false)}
						/>
					)}
				</div>

			{/* Member Removal Confirmation Dialog */}
			{showRemovalDialog && removalConfirmation && (
				<div className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/50 midnight:bg-black/60 flex items-center justify-center z-50">
					<div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
						<div className="p-6">
							<div className="flex items-start space-x-3">
								<div className="flex-shrink-0">
									<div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/20 flex items-center justify-center">
										<svg
											className="w-6 h-6 text-red-600 dark:text-red-400 midnight:text-red-500"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
											/>
										</svg>
									</div>
								</div>

								<div className="flex-1">
									<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
										Confirm Member Removal
									</h3>

									<div className="space-y-3">
										<div className="p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 rounded-lg border-l-4 border-red-400">
											<p className="text-sm text-red-800 dark:text-red-200 midnight:text-red-300 whitespace-pre-line">
												{removalConfirmation.warning}
											</p>
										</div>

										{(removalConfirmation.cardsCount > 0 ||
											removalConfirmation.columnsCount >
												0 ||
											removalConfirmation.habitsCount >
												0 ||
											removalConfirmation.notesCount >
												0 ||
											removalConfirmation.eventsCount >
												0) && (
											<div className="p-3 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg">
												<h4 className="font-medium text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
													Data that will be
													permanently deleted:
												</h4>
												<ul className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400 space-y-1">
													{removalConfirmation.cardsCount >
														0 && (
														<li className="flex items-center space-x-2">
															<span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
															<span>
																{
																	removalConfirmation.cardsCount
																}{" "}
																kanban card(s)
															</span>
														</li>
													)}
													{removalConfirmation.columnsCount >
														0 && (
														<li className="flex items-center space-x-2">
															<span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
															<span>
																{
																	removalConfirmation.columnsCount
																}{" "}
																kanban column(s)
																and all cards
																within
															</span>
														</li>
													)}
													{removalConfirmation.habitsCount >
														0 && (
														<li className="flex items-center space-x-2">
															<span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
															<span>
																{
																	removalConfirmation.habitsCount
																}{" "}
																habit(s) and all
																completion data
															</span>
														</li>
													)}
													{removalConfirmation.notesCount >
														0 && (
														<li className="flex items-center space-x-2">
															<span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
															<span>
																{
																	removalConfirmation.notesCount
																}{" "}
																note(s)
															</span>
														</li>
													)}
													{removalConfirmation.eventsCount >
														0 && (
														<li className="flex items-center space-x-2">
															<span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
															<span>
																{
																	removalConfirmation.eventsCount
																}{" "}
																event(s)
															</span>
														</li>
													)}
												</ul>
											</div>
										)}

										<div className="p-3 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10 rounded-lg border-l-4 border-amber-400">
											<div className="flex items-start space-x-2">
												<svg
													className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
													/>
												</svg>
												<p className="text-sm text-amber-800 dark:text-amber-200 midnight:text-amber-300">
													<strong>
														This action cannot be
														undone.
													</strong>{" "}
													All data associated with
													this user in this project
													will be permanently deleted.
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							<div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
								<button
									onClick={cancelMemberRemoval}
									disabled={removingMembers.has(
										memberToRemove
									)}
									className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={confirmMemberRemoval}
									disabled={removingMembers.has(
										memberToRemove
									)}
									className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center space-x-2"
								>
									{removingMembers.has(memberToRemove) && (
										<svg
											className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											></circle>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
									)}
									<span>
										{removingMembers.has(memberToRemove)
											? "Removing..."
											: "Yes, Remove Member"}
									</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);

	if (isPage) {
		return (
			<div className={`flex h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase}`}>
				{/* Status messages */}
				{(error || success) && (
					<div className="fixed top-4 right-4 z-50 space-y-2">
						{error && (
							<div className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg shadow">
								<AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
								<span className="text-red-700 dark:text-red-400 text-sm">{error}</span>
							</div>
						)}
						{success && (
							<div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg shadow">
								<CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
								<span className="text-green-700 dark:text-green-400 text-sm">{success}</span>
							</div>
						)}
					</div>
				)}

				{/* Left Sidebar */}
				<div className="w-64 bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col border-r border-gray-200 dark:border-gray-800 midnight:border-gray-800 flex-shrink-0">
					<div className="p-6 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
						<div className="flex items-center gap-3">
							<span className="text-xl">{editedProject.emoji}</span>
							<div>
								<h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
									Settings
								</h2>
								<p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-500 mt-0.5 truncate">
									{editedProject.name || 'Configure your project'}
								</p>
							</div>
						</div>
					</div>
					<div className="flex-1 overflow-y-auto px-4 pb-4 pt-4 space-y-0.5">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors ${
									activeTab === tab.id
										? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100'
										: 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-gray-100'
								}`}
							>
								<div className="flex items-center gap-2.5 w-full">
									<div className="flex-shrink-0">{tab.icon}</div>
									<div className="text-sm">{tab.label}</div>
								</div>
							</button>
						))}
					</div>
				</div>

				{/* Right Content Area */}
				<div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 midnight:bg-gray-900">
					<div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
						<div className="flex items-center gap-2.5">
							<div className="text-gray-400 dark:text-gray-500">
								{tabs.find(t => t.id === activeTab)?.icon}
							</div>
							<div>
								<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
									{tabs.find(t => t.id === activeTab)?.label}
								</h3>
								<p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
									{tabs.find(t => t.id === activeTab)?.description}
								</p>
							</div>
						</div>
					</div>
					<div className="flex-1 overflow-y-auto p-6">
						<div className="max-w-2xl">
							{renderTabContent()}
						</div>
					</div>
				</div>

				{/* Member Removal Confirmation Dialog */}
				{showRemovalDialog && removalConfirmation && (
					<div className="fixed inset-0 backdrop-blur-sm bg-black/20 dark:bg-black/50 midnight:bg-black/60 flex items-center justify-center z-50">
						<div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
							<div className="p-6">
								<div className="flex items-start space-x-3">
									<div className="flex-shrink-0">
										<div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
											<svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
											</svg>
										</div>
									</div>
									<div className="flex-1">
										<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Confirm Member Removal</h3>
										<div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-400">
											<p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-line">{removalConfirmation.warning}</p>
										</div>
									</div>
								</div>
								<div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
									<button onClick={cancelMemberRemoval} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
										Cancel
									</button>
									<button onClick={confirmMemberRemoval} disabled={removingMembers.has(memberToRemove)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors">
										{removingMembers.has(memberToRemove) ? 'Removing…' : 'Yes, Remove Member'}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{showEmojiPicker && (
					<div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
				)}
			</div>
		);
	}

	return (
		<div
			className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-250 ease-in-out backdrop-blur-sm bg-black/20 dark:bg-black/50 midnight:bg-black/60 ${soraFontBase}`}
			onClick={(e) => { if (e.target === e.currentTarget) handleClose(e); }}
		>
			<div
				className={`w-11/12 max-w-7xl h-5/6 max-h-[90vh] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl flex overflow-hidden transition-all duration-200 ease-in-out ${isLeaving ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
				onClick={(e) => e.stopPropagation()}
			>
				{innerContent}
			</div>
		</div>
	);
};

export default ProjectSettingsModal;
