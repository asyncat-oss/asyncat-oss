import { useState, useEffect, useCallback } from "react";
import {
 	AlertCircle,
 	CheckCircle,
 	AlertTriangle,
 	Trash2,
 	Check,
 } from "lucide-react";
import { usePermissions } from "../../utils/permissions";
import { projectApi } from "../projectApi";
import eventBus from "../../utils/eventBus.js";

const ProjectSettingsPage = ({ project, session, onClose, onSave, onDelete }) => {
	const [saveStatus, setSaveStatus] = useState(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);
	const [success, setSuccess] = useState(null);
	const [pendingDelete, setPendingDelete] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [hasDueDate, setHasDueDate] = useState(false);
	const [editedProject, setEditedProject] = useState({ name: "", description: "", due_date: "", emoji: "📁" });

	const currentUserId = session?.user?.id;
	const userRole = project?.owner_id && currentUserId && project.owner_id === currentUserId ? "owner" : project?.user_role || "viewer";
	const permissions = usePermissions(userRole);
	const isOwner = userRole === "owner";

	const popularEmojis = ["📁", "🚀", "💡", "⚡", "🎯", "📊", "🔧", "🎨", "📱", "💻", "🌟", "🔥", "⭐", "🎉", "🏆", "💎", "📈", "🎮", "🎵", "📚", "🔬", "🏠", "🌱", "⚽", "🍕", "☕", "🎪", "🎭", "🔮", "🎲"];

	useEffect(() => {
		if (project) {
			const projectDueDate = project.due_date ? project.due_date.split("T")[0] : "";
			setHasDueDate(Boolean(project.due_date));
			setEditedProject({ name: project.name || "", description: project.description || "", due_date: projectDueDate, emoji: project.emoji || "📁" });
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
			setSaveStatus("saved");
			setTimeout(() => setSaveStatus(null), 2000);
		} catch (error) {
			setError(error.message || "Failed to save settings");
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
		} finally {
			setIsSubmitting(false);
		}
	}, [editedProject, project, permissions, onSave, hasDueDate]);

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