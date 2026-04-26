import { useState, useEffect, useCallback } from "react";
import {
 	KanbanSquare,
 	List,
 	Clock,
 	GanttChartSquare,
 	FileText,
 	FolderGit2,
 	Link2,
 	AlertCircle,
 	CheckCircle,
 	AlertTriangle,
 	Trash2,
 	LayoutGrid,
 	Target,
 	Check,
 } from "lucide-react";
import { usePermissions } from "../../utils/permissions";
import { projectApi, projectViewsApi } from "../projectApi";
import eventBus from "../../utils/eventBus.js";

const popularEmojis = ["📁", "🚀", "💡", "⚡", "🎯", "📊", "🔧", "🎨", "📱", "💻", "🌟", "🔥", "⭐", "🎉", "🏆", "💎", "📈", "🎮", "🎵", "📚", "🔬", "🏠", "🌱", "⚽", "🍕", "☕", "🎪", "🎭", "🔮", "🎲"];

const allViewsConfig = {
	kanban:    { label: "Kanban",    icon: KanbanSquare,     description: "Board view with columns and cards" },
	list:      { label: "List",      icon: List,              description: "Simple list view of tasks and items" },
	timeline:  { label: "Timeline",  icon: Clock,             description: "Chronological timeline view" },
	gantt:     { label: "Gantt",     icon: GanttChartSquare,   description: "Gantt chart for project planning" },
	network:   { label: "Network",   icon: Link2,             description: "Network diagram and dependencies" },
	notes:     { label: "Notes",     icon: FileText,          description: "Project notes and documentation" },
	habits:    { label: "Habits",    icon: Target,            description: "Track recurring activities and build healthy habits" },
	storage:   { label: "Storage",   icon: FolderGit2,         description: "File storage and attachments" },
	gallery:   { label: "Gallery",   icon: LayoutGrid,        description: "Visual gallery view of tasks and items" },
};

const ProjectSettingsPage = ({ project, session, onClose, onSave, onDelete }) => {
	const [saveStatus, setSaveStatus] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [hasDueDate, setHasDueDate] = useState(false);
	const [selectedViews, setSelectedViews] = useState([]);
	const [editedProject, setEditedProject] = useState({ name: "", description: "", due_date: "", enabled_views: [], emoji: "📁" });

	const currentUserId = session?.user?.id;
	const userRole = project?.owner_id && currentUserId && project.owner_id === currentUserId ? "owner" : project?.user_role || "viewer";
	const permissions = usePermissions(userRole);
	const isOwner = userRole === "owner";

	useEffect(() => {
		if (project) {
			const projectDueDate = project.due_date ? project.due_date.split("T")[0] : "";
			setHasDueDate(Boolean(project.due_date));
			const projectEnabledViews = project.enabled_views || Object.keys(allViewsConfig);
			setEditedProject({ name: project.name || "", description: project.description || "", due_date: projectDueDate, enabled_views: projectEnabledViews, emoji: project.emoji || "📁" });
			const userPrefs = project.user_view_preferences || project.user_visible_views || projectEnabledViews;
			setSelectedViews([...userPrefs]);
			setError(null);
			setSuccess(null);
			setPendingDelete(false);
		}
	}, [project]);

	const handleChange = useCallback((e) => {
		const { name, value } = e.target;
		setEditedProject((prev) => ({ ...prev, [name]: value }));
	}, []);

	const handleEmojiSelect = (emoji) => {
		setEditedProject((prev) => ({ ...prev, emoji }));
		setShowEmojiPicker(false);
	};

	const toggleProjectView = (viewKey) => {
		setEditedProject((prev) => {
			const currentEnabledViews = prev.enabled_views || [];
			const isCurrentlyEnabled = currentEnabledViews.includes(viewKey);
			const newEnabledViews = isCurrentlyEnabled ? currentEnabledViews.filter((v) => v !== viewKey) : [...currentEnabledViews, viewKey];
			if (isCurrentlyEnabled) setSelectedViews((p) => p.filter((v) => v !== viewKey));
			return { ...prev, enabled_views: newEnabledViews };
		});
	};

	const toggleViewPreference = (viewKey) => {
		setSelectedViews((prev) => prev.includes(viewKey) ? prev.filter((v) => v !== viewKey) : [...prev, viewKey]);
	};

	const handleSave = useCallback(async () => {
		setError(null);
		setSuccess(null);
		try {
			setSaveStatus("saving");
			setIsSubmitting(true);
			if (permissions.canEditProject) {
				const currentDueDate = hasDueDate && editedProject.due_date ? editedProject.due_date : null;
				const originalDueDate = project.due_date ? project.due_date.split("T")[0] : null;
				const generalChanges = editedProject.name !== (project.name || "") || editedProject.description !== (project.description || "") || currentDueDate !== originalDueDate || editedProject.emoji !== (project.emoji || "📁");
				if (generalChanges) {
					const result = await onSave({ name: editedProject.name, description: editedProject.description, due_date: hasDueDate && editedProject.due_date ? editedProject.due_date : null, emoji: editedProject.emoji });
					if (!result) throw new Error("Failed to save project settings");
					eventBus.emit("projectsUpdated");
				}
			}
			if (isOwner && editedProject.enabled_views) {
				const originalEnabledViews = project.enabled_views || [];
				if (JSON.stringify(editedProject.enabled_views.sort()) !== JSON.stringify(originalEnabledViews.sort())) {
					const result = await onSave({ enabled_views: editedProject.enabled_views });
					if (!result) throw new Error("Failed to save components");
					sessionStorage.removeItem("asyncat-projects-cache");
					eventBus.emit("projectsUpdated");
				}
			}
			const originalViewPrefs = project.user_view_preferences || project.user_visible_views || [];
			if (JSON.stringify(selectedViews.sort()) !== JSON.stringify(originalViewPrefs.sort())) {
				await projectViewsApi.updateUserViewPreferences(project.id, selectedViews);
				sessionStorage.removeItem("asyncat-projects-cache");
				eventBus.emit("projectsUpdated");
			}
			setSaveStatus("saved");
			setTimeout(() => setSaveStatus(null), 2000);
		} catch (error) {
			setError(error.message || "Failed to save settings");
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
		} finally {
			setIsSubmitting(false);
		}
	}, [editedProject, selectedViews, project, permissions, onSave, isOwner, hasDueDate]);

	const handleDelete = async () => {
		if (!pendingDelete) { setPendingDelete(true); return; }
		try {
			setIsSubmitting(true);
			await projectApi.deleteProject(project.id);
			eventBus.emit("projectsUpdated");
			if (onDelete) await onDelete(project);
			onClose();
		} catch (error) {
			setError(error.message || "Failed to delete project");
			setPendingDelete(false);
		} finally {
			setIsSubmitting(false);
		}
	};

	const enabledViews = editedProject.enabled_views || [];

	return (
		<div className="flex h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 font-sora">
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

			{/* Main content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Header */}
				<div className="px-8 py-6 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
					<div className="flex items-center gap-4">
						<span className="text-3xl">{editedProject.emoji}</span>
						<div>
							<h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Project Settings</h1>
							<p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{editedProject.name || "Configure your project"}</p>
						</div>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-3xl mx-auto p-8 space-y-10">
						{/* General Section */}
						<div className="space-y-6">
							<div>
								<h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">General</h2>
								<p className="text-sm text-gray-500 dark:text-gray-400">Basic project information</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name & Icon</label>
								<div className="flex gap-4">
									<div className="relative">
										<button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={!permissions.canEditProject} className="w-14 h-14 flex items-center justify-center text-3xl border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
											{editedProject.emoji}
										</button>
										{showEmojiPicker && permissions.canEditProject && (
											<div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl shadow-xl z-50 p-3">
												<div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
													{popularEmojis.map((emoji, i) => (
														<button key={i} onClick={() => handleEmojiSelect(emoji)} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">{emoji}</button>
													))}
												</div>
												<div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
													<input type="text" placeholder="Type emoji..." maxLength="2" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-white" onChange={(e) => { if (e.target.value) handleEmojiSelect(e.target.value); }} />
												</div>
											</div>
										)}
									</div>
									<input type="text" name="name" value={editedProject.name} onChange={handleChange} className="flex-1 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl py-3 px-5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-white midnight:text-indigo-100" placeholder="Project name" disabled={!permissions.canEditProject} />
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
								<textarea name="description" value={editedProject.description} onChange={handleChange} rows={3} className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl py-3 px-5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-white midnight:text-indigo-100 resize-none" placeholder="Describe your project..." disabled={!permissions.canEditProject} />
							</div>

							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
									<label className="flex items-center gap-2 cursor-pointer">
										<input type="checkbox" checked={hasDueDate} onChange={(e) => { setHasDueDate(e.target.checked); if (!e.target.checked) setEditedProject((p) => ({ ...p, due_date: "" })); }} disabled={!permissions.canEditProject} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
										<span className="text-sm text-gray-600 dark:text-gray-400">Enable</span>
									</label>
								</div>
								{hasDueDate && <input type="date" name="due_date" value={editedProject.due_date} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl py-3 px-5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-white" disabled={!permissions.canEditProject} />}
							</div>
						</div>

						{/* Views Section */}
						<div className="space-y-6">
							<div>
								<h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">Views & Components</h2>
								<p className="text-sm text-gray-500 dark:text-gray-400">{isOwner ? "Enable views for the project and choose your sidebar." : "Choose which views appear in your sidebar."}</p>
							</div>

							<div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 overflow-hidden">
								<div className={`grid ${isOwner ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} gap-x-8 px-5 py-3 bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-700`}>
									<span className="text-xs font-medium text-gray-500 uppercase tracking-wide">View</span>
									{isOwner && <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Project</span>}
									<span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">Sidebar</span>
								</div>
								{Object.keys(allViewsConfig).map((viewKey, idx, arr) => {
									const config = allViewsConfig[viewKey];
									if (!config) return null;
									const isEnabled = enabledViews.includes(viewKey);
									const isInMyView = selectedViews.includes(viewKey);
									const IconComponent = config.icon;
									const isLast = idx === arr.length - 1;
									return (
										<div key={viewKey} className={`grid ${isOwner ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} gap-x-8 items-center px-5 py-4 ${!isLast ? "border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800" : ""} ${!isEnabled && isOwner ? "opacity-50" : ""} bg-white dark:bg-gray-900 midnight:bg-gray-950`}>
											<div className="flex items-center gap-4">
												<div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex items-center justify-center">
													<IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
												</div>
												<div>
													<span className="text-sm font-medium text-gray-900 dark:text-gray-100">{config.label}</span>
													<p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{config.description}</p>
												</div>
											</div>
											{isOwner && (
												<div className="flex justify-center">
													<button onClick={() => toggleProjectView(viewKey)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isEnabled ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600"}`}>
														<span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${isEnabled ? "translate-x-5" : "translate-x-0"}`} />
													</button>
												</div>
											)}
											<div className="flex justify-center">
												<button onClick={() => isEnabled && toggleViewPreference(viewKey)} disabled={!isEnabled} title={isEnabled ? (isInMyView ? "Hide from sidebar" : "Show in sidebar") : "Disabled at project level"} className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${!isEnabled ? "cursor-default" : "cursor-pointer"} ${isInMyView ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600"}`}>
													<span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${isInMyView ? "translate-x-5" : "translate-x-0"}`} />
												</button>
											</div>
										</div>
									);
								})}
							</div>
						</div>

						{/* Danger Zone */}
						{permissions.canDelete && (
							<div className="rounded-xl p-5 bg-red-50/30 dark:bg-red-900/5 midnight:bg-red-900/5 border border-red-100 dark:border-red-900/30">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Danger Zone</h3>
										<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Once deleted, there is no going back.</p>
									</div>
									{pendingDelete ? (
										<div className="flex items-center gap-3">
											<span className="text-sm text-gray-500">Are you sure?</span>
											<button onClick={handleDelete} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg text-sm font-medium">Yes, Delete</button>
											<button onClick={() => setPendingDelete(false)} className="hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 py-2 px-4 rounded-lg text-sm font-medium">Cancel</button>
										</div>
									) : (
										<button onClick={() => setPendingDelete(true)} className="hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-500 py-2 px-4 rounded-lg text-sm font-medium flex items-center gap-2">
											<Trash2 className="w-4 h-4" /> Delete Project
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="px-8 py-5 border-t border-gray-200 dark:border-gray-800 midnight:border-gray-800 bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950">
					<div className="max-w-3xl mx-auto flex items-center justify-between">
						<span className="text-sm text-gray-500">{isOwner ? <span className="text-indigo-500 font-medium">Owner</span> : <span className="text-gray-400">Member</span>}</span>
						{permissions.canEditProject && (
							<button onClick={handleSave} disabled={isSubmitting} className="bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 midnight:hover:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-900 py-2.5 px-6 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
								{isSubmitting ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving</> : saveStatus === "saved" ? <><Check className="w-4 h-4" />Saved</> : saveStatus === "error" ? <><AlertTriangle className="w-4 h-4" />Failed</> : "Save Changes"}
							</button>
						)}
					</div>
				</div>
			</div>

			{showEmojiPicker && <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />}
		</div>
	);
};

export default ProjectSettingsPage;