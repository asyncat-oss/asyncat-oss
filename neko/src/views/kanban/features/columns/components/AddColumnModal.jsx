import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, Info } from "lucide-react";
import { useColumnActions } from "../hooks/useColumnActions";
import { useUser } from "../../../../../contexts/UserContext";

const defaultSettings = {
	title: "",
	isCompletionColumn: false, // Add isCompletionColumn with default false
	styles: {
		headerFontFamily: "sans-serif",
		headerFontSize: "16px",
		headerFontWeight: "normal",
		headerFontStyle: "normal",
		headerTextDecoration: "none",
		headerTextColor: "#000000",
	},
};

const AddColumnModal = ({ onClose, onSuccess, projectId }) => {
	const { handleColumnAdd } = useColumnActions();
	const { getUserRole, hasPermission } = useUser();
	const [settings, setSettings] = useState(defaultSettings);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Get user role and permissions for this project
	const userRole = getUserRole(projectId);
	const canManageColumns = hasPermission("canManageFeatures", projectId);
	const isOwner = userRole === "owner";

	// If user doesn't have permission, show unauthorized message
	if (!canManageColumns && !isOwner) {
		return createPortal(
			<div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
				<div
					className="fixed inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
					onClick={onClose}
				/>
				<div className="relative z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-gray-950/95 backdrop-blur-sm rounded-xl w-full max-w-md mx-6 shadow-2xl border border-gray-200/80 dark:border-gray-700 midnight:border-gray-800 flex flex-col overflow-hidden">
					<div className="flex items-center justify-between p-6 border-b border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
						<div>
							<h2 className="text-xl font-medium text-gray-900 dark:text-white midnight:text-indigo-200">
								Access Restricted
							</h2>
							<p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-500 mt-1">
								Owner permission required
							</p>
						</div>
						<button
							onClick={onClose}
							className="p-2 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
					<div className="p-6">
						<div className="flex items-center space-x-3 mb-4">
							<div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 midnight:bg-red-900/10 flex items-center justify-center">
								<span className="text-red-600 dark:text-red-400 midnight:text-red-300">
									🔒
								</span>
							</div>
							<div>
								<h3 className="font-medium text-gray-900 dark:text-white midnight:text-gray-100">
									Owner Permission Required
								</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									Your role: {userRole}
								</p>
							</div>
						</div>
						<p className="text-gray-600 dark:text-gray-300 midnight:text-gray-400 mb-4">
							Only project owners can create new columns. Contact
							the project owner to request this change.
						</p>
						
						{/* Beta sync issue notice */}
						<div className="bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 border border-amber-200 dark:border-amber-800/30 midnight:border-amber-800/20 rounded-lg p-4 mb-6">
							<div className="flex items-start space-x-2">
								<Info className="w-4 h-4 text-amber-600 dark:text-amber-500 midnight:text-amber-400 mt-0.5 flex-shrink-0" />
								<div className="text-sm">
									<p className="text-amber-800 dark:text-amber-300 midnight:text-amber-300 font-medium mb-1">
										Beta Notice: Sync Issue
									</p>
									<p className="text-amber-700 dark:text-amber-400 midnight:text-amber-400 text-xs leading-relaxed">
										If you just created this project and should be the owner, try refreshing the page. 
										We're working on fixing this sync delay. Thank you for your patience! 
									</p>
								</div>
							</div>
						</div>
						
						<button
							onClick={onClose}
							className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 transition-colors"
						>
							Close
						</button>
					</div>
				</div>
			</div>,
			document.body
		);
	}

	const handleChange = (e) => {
		const { name, value } = e.target;
		setSettings((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	// Add toggle handler for completion column status
	const handleToggleCompletionStatus = () => {
		setSettings((prev) => ({
			...prev,
			isCompletionColumn: !prev.isCompletionColumn,
		}));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			if (settings.title.trim()) {
				setIsSubmitting(true);
				await handleColumnAdd(settings);
				// Call success callback
				if (onSuccess) {
					onSuccess();
				} else {
					onClose();
				}
			}
		} catch (error) {
			console.error("Error creating column:", error);
			setIsSubmitting(false);
		}
	};

	const handleClose = () => {
		onClose();
	};

	const handleBackdropClick = (e) => {
		// Only close if clicking on the backdrop itself, not its children
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	return createPortal(
		<div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
			<div
				className="fixed inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
				onClick={handleBackdropClick}
			/>
			<div className="relative z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-gray-950/95 backdrop-blur-sm rounded-xl w-full max-w-2xl mx-6 shadow-2xl border border-gray-200/80 dark:border-gray-700 midnight:border-gray-800 flex flex-col overflow-hidden max-h-[95vh] min-w-0">
				{/* Header */}
				<div className="flex items-center justify-between p-8 border-b border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
					<div>
						<h2 className="text-xl font-medium text-gray-900 dark:text-white midnight:text-indigo-200">
							Create New Column
						</h2>
						<p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-500 mt-1">
							Add a new column to organize your tasks
						</p>
					</div>
					<button
						onClick={handleClose}
						className="p-2 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
						disabled={isSubmitting}
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Content area */}
				<form onSubmit={handleSubmit}>
					<div className="flex-1 overflow-y-auto overflow-x-hidden p-8 min-w-0">
						<div className="space-y-8">
							<div>
								<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
									Column Title
								</label>
								<input
									type="text"
									name="title"
									value={settings.title}
									onChange={handleChange}
									className="w-full px-4 py-3 rounded-lg border 
                    border-gray-200 dark:border-gray-700 midnight:border-gray-800 
                    focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 midnight:focus:ring-indigo-500 
                    bg-white dark:bg-gray-900 midnight:bg-gray-950 
                    text-gray-900 dark:text-white midnight:text-indigo-200
                    font-medium"
									placeholder="Enter column title..."
									required
									disabled={isSubmitting}
								/>
							</div>

							{/* Completion Column Section */}
							<div className="mb-6">
								<div className="flex items-center justify-between mb-3">
									<div>
										<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center mb-1">
											<Check className="w-4 h-4 mr-1" />
											Completion Column
										</h3>
										<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
											Cards in this column are considered
											completed
										</p>
									</div>

									<button
										type="button"
										onClick={handleToggleCompletionStatus}
										disabled={isSubmitting}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 midnight:focus:ring-indigo-700
                      ${
							settings.isCompletionColumn
								? "bg-green-500 dark:bg-green-600 midnight:bg-green-700"
								: "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700"
						}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${
							settings.isCompletionColumn
								? "translate-x-6"
								: "translate-x-1"
						}`}
										/>
									</button>
								</div>

								{/* Info Banner */}
								<div className="p-3 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 border border-blue-200 dark:border-blue-700 midnight:border-blue-800 rounded-lg text-blue-600 dark:text-blue-400 midnight:text-blue-500 text-sm flex items-start">
									<Info className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
									<div>
										<p className="font-medium mb-1">
											What is a completion column?
										</p>
										<p className="text-xs">
											When a card depends on other cards,
											it can only be moved to a completion
											column when all its dependencies are
											completed. Cards in a completion
											column are considered "done" and
											will unblock dependent cards.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between p-8 border-t border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
						{/* Left: Cancel */}
						<div>
							<button
								type="button"
								onClick={handleClose}
								disabled={isSubmitting}
								className="px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-indigo-800 shadow-sm
                  text-gray-600 dark:text-gray-300 midnight:text-gray-400 
                  hover:text-gray-800 dark:hover:text-gray-100 midnight:hover:text-indigo-200 
                  hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 midnight:focus-visible:ring-indigo-700
                  disabled:text-gray-300 dark:disabled:text-gray-600 midnight:disabled:text-gray-700
                  disabled:hover:bg-transparent dark:disabled:hover:bg-transparent midnight:disabled:hover:bg-transparent"
							>
								Cancel
							</button>
						</div>

						{/* Right: Submit */}
						<div>
							<button
								type="submit"
								className="px-6 py-2 bg-gray-900 dark:bg-gray-700 midnight:bg-indigo-900 
                  text-white rounded-lg transition-colors
                  hover:bg-gray-800 dark:hover:bg-gray-600 midnight:hover:bg-indigo-700 
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 midnight:focus-visible:ring-indigo-700
                  disabled:bg-gray-300 dark:disabled:bg-gray-600 midnight:disabled:bg-indigo-600/20 
                  disabled:cursor-not-allowed flex items-center space-x-2 shadow-sm"
								disabled={
									isSubmitting || !settings.title.trim()
								}
							>
								{isSubmitting ? (
									<>
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
										<span>Creating...</span>
									</>
								) : (
									<>
										<span>Create Column</span>
										<Check className="w-4 h-4 ml-1" />
									</>
								)}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>,
		document.body
	);
};

export default AddColumnModal;
