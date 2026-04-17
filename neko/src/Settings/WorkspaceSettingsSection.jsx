import React, { useState, useEffect } from "react";
import {
	Loader2,
	Trash2,
} from "lucide-react";

import { workspaceApi, apiUtils } from "./settingApi";

// Popular workspace emojis
const popularWorkspaceEmojis = [
	"👥",
	"🚀",
	"💼",
	"⚡",
	"🎯",
	"🔥",
	"💡",
	"🏆",
	"🌟",
	"🎨",
	"🔧",
	"📈",
	"💻",
	"🎮",
	"🏢",
	"🌊",
	"🎪",
	"🎭",
	"🎵",
	"🏃",
	"🚴",
	"⚽",
	"🏀",
	"🎾",
];

const InputField = ({
	label,
	type = "text",
	value,
	onChange,
	placeholder,
	disabled = false,
	rows,
	disabledMessage,
}) => (
	<div className="space-y-2">
		<label className="block text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
			{label}
		</label>
		{type === "textarea" ? (
			<textarea
				value={value}
				onChange={onChange}
				disabled={disabled}
				className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 midnight:border-gray-800
                 rounded focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 midnight:focus:border-gray-700
                 resize-none text-sm ${
						disabled
							? "bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 text-gray-500 dark:text-gray-400 midnight:text-gray-500 cursor-not-allowed"
							: "bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-white midnight:text-gray-100"
					}`}
				placeholder={placeholder}
				rows={rows || 3}
			/>
		) : (
			<input
				type={type}
				value={value}
				onChange={onChange}
				disabled={disabled}
				className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 midnight:border-gray-800
                 rounded focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 midnight:focus:border-gray-700
                 text-sm ${
						disabled
							? "bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 text-gray-500 dark:text-gray-400 midnight:text-gray-500 cursor-not-allowed"
							: "bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-white midnight:text-gray-100"
					}`}
				placeholder={placeholder}
			/>
		)}
		{disabled && disabledMessage && (
			<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
				{disabledMessage}
			</p>
		)}
	</div>
);

// Emoji picker component
const EmojiPicker = ({ selectedEmoji, onEmojiSelect, disabled = false }) => {
	const [customEmoji, setCustomEmoji] = useState("");
	const [showCustomInput, setShowCustomInput] = useState(false);

	const handleCustomEmojiSubmit = () => {
		if (customEmoji.trim() && !disabled) {
			onEmojiSelect(customEmoji.trim());
			setCustomEmoji("");
			setShowCustomInput(false);
		}
	};

	return (
		<div className="space-y-3">
			<label className="block text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
				Workspace Emoji
			</label>

			{/* Selected emoji display */}
			<div className="flex items-center space-x-3">
				<div className="w-10 h-10 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded flex items-center justify-center bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800">
					<span className="text-xl">{selectedEmoji}</span>
				</div>
				<span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
					Current selection
				</span>
			</div>

			{/* Emoji grid */}
			<div className="grid grid-cols-8 gap-1">
				{popularWorkspaceEmojis.map((emoji) => (
					<button
						key={emoji}
						type="button"
						onClick={() => !disabled && onEmojiSelect(emoji)}
						disabled={disabled}
						className={`w-8 h-8 flex items-center justify-center rounded text-base transition-colors ${
							disabled
								? "cursor-not-allowed opacity-50"
								: "hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
						} ${
							selectedEmoji === emoji
								? "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 border border-gray-300 dark:border-gray-600 midnight:border-gray-700"
								: ""
						}`}
					>
						{emoji}
					</button>
				))}
			</div>

			{/* Custom emoji input */}
			{!disabled && (
				<>
					{!showCustomInput ? (
						<button
							type="button"
							onClick={() => setShowCustomInput(true)}
							className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-300 transition-colors"
						>
							Use custom emoji
						</button>
					) : (
						<div className="flex items-center space-x-2">
							<input
								type="text"
								value={customEmoji}
								onChange={(e) => setCustomEmoji(e.target.value)}
								placeholder="Paste emoji..."
								className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-white midnight:text-gray-100"
								maxLength="2"
							/>
							<button
								type="button"
								onClick={handleCustomEmojiSubmit}
								className="px-3 py-1 text-sm bg-gray-900 dark:bg-white midnight:bg-gray-100 text-white dark:text-gray-900 midnight:text-gray-900 rounded hover:opacity-90 transition-opacity"
							>
								Use
							</button>
							<button
								type="button"
								onClick={() => {
									setShowCustomInput(false);
									setCustomEmoji("");
								}}
								className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
							>
								Cancel
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
};

const WorkspaceSettingsSection = ({
	workspace,
	onWorkspaceUpdated,
	onWorkspaceDeleted,
	onWorkspaceLeft,
	session,
}) => {
	// Form state for general settings
	const [workspaceName, setWorkspaceName] = useState("");
	const [workspaceDescription, setWorkspaceDescription] = useState("");
	const [workspaceEmoji, setWorkspaceEmoji] = useState("👥");

	// Delete/Leave state
	const [pendingDelete, setPendingDelete] = useState(false);
	const [pendingLeave, setPendingLeave] = useState(false);
	const [forceDelete, setForceDelete] = useState(false);
	const [hasProjects, setHasProjects] = useState(false);

	// UI state
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [error, setError] = useState(null);
	const [successMessage, setSuccessMessage] = useState(null);

	// Initialize form data when workspace changes
	useEffect(() => {
		if (workspace) {
			setWorkspaceName(workspace.name || "");
			setWorkspaceDescription(workspace.description || "");
			setWorkspaceEmoji(workspace.emoji || "👥");
		}
	}, [workspace]);

	const saveWorkspaceSettings = async () => {
		if (!workspace?.id) return;

		try {
			setIsSaving(true);
			setError(null);

			const updatedData = {
				name: workspace.is_personal ? workspace.name : workspaceName,
				description: workspaceDescription,
				emoji: workspaceEmoji,
			};

			await workspaceApi.updateWorkspace(workspace.id, updatedData);
			await onWorkspaceUpdated();
			setSuccessMessage("Workspace updated successfully!");

			// Clear success message after 3 seconds
			setTimeout(() => setSuccessMessage(null), 3000);
		} catch (err) {
			setError(apiUtils.handleError(err, "Failed to update workspace"));
			// Clear error message after 5 seconds
			setTimeout(() => setError(null), 5000);
		} finally {
			setIsSaving(false);
		}
	};

	// Delete workspace function
	const handleDeleteWorkspace = async () => {
		try {
			setIsDeleting(true);
			setError(null);

			await workspaceApi.deleteWorkspace(workspace.id, forceDelete);

			// Notify parent component about deletion
			if (onWorkspaceDeleted) {
				onWorkspaceDeleted(workspace);
			}

			setSuccessMessage("Workspace deleted successfully!");
			setPendingDelete(false);
		} catch (err) {
			const errorMessage = apiUtils.handleError(
				err,
				"Failed to delete workspace"
			);

			// Check if error indicates associated resources
			if (
				err.message?.includes("hasAssociatedResources") ||
				errorMessage.includes("associated projects")
			) {
				setHasProjects(true);
				setError(
					"This workspace has associated projects. Check the box to delete anyway."
				);
				return;
			}

			setError(errorMessage);
		} finally {
			setIsDeleting(false);
		}
	};

	// Leave workspace function
	const handleLeaveWorkspace = async () => {
		try {
			setIsLeaving(true);
			setError(null);

			await workspaceApi.leaveWorkspace(workspace.id);

			// Notify parent component about leaving
			if (onWorkspaceLeft) {
				onWorkspaceLeft(workspace);
			}

			setSuccessMessage("You have left the workspace successfully");
			setPendingLeave(false);
		} catch (err) {
			setError(apiUtils.handleError(err, "Failed to leave workspace"));
		} finally {
			setIsLeaving(false);
		}
	};

	// Check if current user is the workspace owner
	const isWorkspaceOwner = () => {
		return (
			session?.user &&
			workspace &&
			String(session.user.id) === String(workspace.owner_id)
		);
	};

	if (!workspace) {
		return (
			<div className="text-center py-12">
				<p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500">
					No workspace selected
				</p>
			</div>
		);
	}

	const renderGeneralSettings = () => {
		const isMember = !isWorkspaceOwner();

		return (
			<div className="space-y-4">
				{/* Success/Error Messages */}
				{successMessage && (
					<div className="p-3 text-xs bg-green-50/50 dark:bg-green-900/10 midnight:bg-green-900/10 text-green-700 dark:text-green-400 midnight:text-green-400 rounded-lg">
						{successMessage}
					</div>
				)}

				{error && (
					<div className="p-3 text-xs bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-900/10 text-red-700 dark:text-red-400 midnight:text-red-400 rounded-lg">
						{error}
					</div>
				)}

				{/* Workspace Settings Card */}
				<div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
					<div className="p-6">
						<div className="flex gap-8">
							{/* Left Side - Workspace Info */}
							<div className="flex-shrink-0 w-80">
								{/* Workspace Display */}
								<div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
									{/* Workspace Header */}
									<div className="text-center mb-4">
										<div className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-2">
											{workspace.is_personal
												? "Personal Workspace"
												: "Team Workspace"}
										</div>
									</div>

									{/* Workspace Display */}
									<div className="flex flex-col items-center mb-4">
										<div className="relative mb-3">
											<div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 flex items-center justify-center">
												<span className="text-2xl">
													{workspaceEmoji}
												</span>
											</div>
										</div>

										{/* Workspace Info */}
										<div className="text-center">
											<h4 className="text-base font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-2">
												{workspace.is_personal
													? "Personal Workspace"
													: workspaceName ||
													  "Unnamed Workspace"}
											</h4>
											<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
												{workspace.is_personal
													? "Private"
													: "Shared"}
											</div>
										</div>
									</div>

									{/* Description Preview */}
									{workspaceDescription && (
										<div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg">
											<div className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-1">
												Description
											</div>
											<div className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-200 line-clamp-3">
												{workspaceDescription}
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Right Side - Form Fields */}
							<div className="flex-1">
								<div className="space-y-6">
									<EmojiPicker
										selectedEmoji={workspaceEmoji}
										onEmojiSelect={setWorkspaceEmoji}
										disabled={isMember}
									/>

									<InputField
										label={
											workspace.is_personal
												? "Workspace Name"
												: "Workspace Name"
										}
										value={
											workspace.is_personal
												? "Personal Workspace"
												: workspaceName
										}
										onChange={(e) =>
											!workspace.is_personal &&
											!isMember &&
											setWorkspaceName(e.target.value)
										}
										disabled={
											workspace.is_personal || isMember
										}
										placeholder={
											workspace.is_personal
												? "Personal Workspace"
												: "Enter workspace name"
										}
										disabledMessage={
											workspace.is_personal
												? "Personal workspace name cannot be changed"
												: undefined
										}
									/>

									<InputField
										label="Description"
										type="textarea"
										value={workspaceDescription}
										onChange={(e) =>
											!isMember &&
											setWorkspaceDescription(
												e.target.value
											)
										}
										disabled={isMember}
										placeholder={
											workspace.is_personal
												? "Describe your personal workspace..."
												: "Enter workspace description"
										}
										rows={3}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Danger Zone - only show for non-personal workspaces */}
				{!workspace.is_personal && (
					<div className="mt-8">
						<div className="rounded-lg p-4 bg-red-50/30 dark:bg-red-900/5 midnight:bg-red-900/5">
							<h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 mb-1">
								Danger Zone
							</h4>
							<p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 mb-3">
								{isWorkspaceOwner()
									? "Once you delete this workspace, there is no going back. Please be certain."
									: "Leave this workspace if you no longer want to be a member."}
							</p>

							{isWorkspaceOwner() ? (
								// Delete workspace section for owners
								<>
									{hasProjects && (
										<div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/30 rounded-lg">
											<label className="flex items-center">
												<input
													type="checkbox"
													checked={forceDelete}
													onChange={(e) =>
														setForceDelete(
															e.target.checked
														)
													}
													className="mr-2 h-4 w-4 accent-red-500 dark:accent-red-400 midnight:accent-red-300"
												/>
												<span className="text-sm text-yellow-700 dark:text-yellow-400 midnight:text-yellow-300">
													I understand this will
													delete all associated
													projects
												</span>
											</label>
										</div>
									)}

									{pendingDelete ? (
										<div className="flex items-center gap-2">
											<span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
												Are you sure? This action cannot
												be undone.
											</span>
											<button
												type="button"
												onClick={handleDeleteWorkspace}
												disabled={
													isDeleting ||
													(hasProjects &&
														!forceDelete)
												}
												className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
											>
												{isDeleting ? (
													<Loader2
														size={14}
														className="animate-spin"
													/>
												) : (
													"Yes, Delete"
												)}
											</button>
											<button
												type="button"
												onClick={() => {
													setPendingDelete(false);
													setHasProjects(false);
													setForceDelete(false);
													setError(null);
												}}
												disabled={isDeleting}
												className="hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 py-1.5 px-3 rounded-lg text-xs transition-colors"
											>
												Cancel
											</button>
										</div>
									) : (
										<button
											type="button"
											onClick={() =>
												setPendingDelete(true)
											}
											className="hover:bg-red-50 dark:hover:bg-red-900/10 midnight:hover:bg-red-900/10 text-red-600 dark:text-red-500 midnight:text-red-500 py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center gap-1.5"
										>
											<Trash2 className="w-3.5 h-3.5" />
											Delete Workspace
										</button>
									)}
								</>
							) : (
								// Leave workspace section for members
								<>
									{pendingLeave ? (
										<div className="flex items-center gap-2">
											<span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
												Are you sure you want to leave
												this workspace?
											</span>
											<button
												type="button"
												onClick={handleLeaveWorkspace}
												disabled={isLeaving}
												className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs transition-colors disabled:opacity-50 flex items-center justify-center min-w-[90px]"
											>
												{isLeaving ? (
													<Loader2
														size={14}
														className="animate-spin"
													/>
												) : (
													"Yes, Leave"
												)}
											</button>
											<button
												type="button"
												onClick={() =>
													setPendingLeave(false)
												}
												disabled={isLeaving}
												className="hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 py-1.5 px-3 rounded-lg text-xs transition-colors"
											>
												Cancel
											</button>
										</div>
									) : (
										<button
											type="button"
											onClick={() =>
												setPendingLeave(true)
											}
											className="hover:bg-red-50 dark:hover:bg-red-900/10 midnight:hover:bg-red-900/10 text-red-600 dark:text-red-500 midnight:text-red-500 py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center gap-1.5"
										>
											<Trash2 className="w-3.5 h-3.5" />
											Leave Workspace
										</button>
									)}
								</>
							)}
						</div>
					</div>
				)}

				{/* Save Changes button - only for owners */}
				{!isMember && (
					<div className="pt-4 border-t border-gray-200 dark:border-gray-800 midnight:border-gray-800">
						<button
							onClick={saveWorkspaceSettings}
							disabled={
								isSaving ||
								(!workspace.is_personal &&
									!workspaceName.trim())
							}
							className="px-4 py-1.5 bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 midnight:hover:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-900 rounded-lg transition-colors disabled:opacity-50 text-sm font-medium min-w-[100px] flex items-center justify-center gap-1.5"
						>
							{isSaving ? (
								<Loader2 size={14} className="animate-spin" />
							) : (
								"Save Changes"
							)}
						</button>
					</div>
				)}
			</div>
		);
	};

	return renderGeneralSettings();
};

export default WorkspaceSettingsSection;
