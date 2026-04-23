import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, Info, CheckCircle } from "lucide-react";
import { useColumnActions } from "../hooks/useColumnActions";

const ColumnSettingsModal = ({ column, onClose, onDelete }) => {
	const { handleColumnUpdate } = useColumnActions();
	const [title, setTitle] = useState(column.title);
	const [isCompletionColumn, setIsCompletionColumn] = useState(
		column.isCompletionColumn || false
	);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isUpdating, setIsUpdating] = useState(false);
	const [showSuccessMessage, setShowSuccessMessage] = useState(false);
	const [error, setError] = useState(null);

	const handleChange = (e) => {
		setTitle(e.target.value);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		try {
			setIsUpdating(true);
			setError(null);
			await handleColumnUpdate(column.id, { title, isCompletionColumn });
			setShowSuccessMessage(true);
			setTimeout(() => setShowSuccessMessage(false), 3000);
			onClose();
		} catch (error) {
			console.error("Error updating column:", error);
			setError("Failed to update column settings. Please try again.");
			setIsUpdating(false);
		}
	};

	const handleDeleteClick = () => {
		setConfirmDelete(true);
	};

	const handleConfirmDelete = async () => {
		try {
			setIsDeleting(true);
			setError(null);

			if (onDelete) {
				await onDelete(column.id);
			}

			onClose();
		} catch (error) {
			console.error("Error deleting column:", error);
			// Extract error message from the error object
			const errorMessage =
				error.message || error.toString() || "Failed to delete column";
			setError(errorMessage);
			setIsDeleting(false);
			setConfirmDelete(false);
		}
	};

	const handleToggleCompletionStatus = () => {
		setIsCompletionColumn((prev) => !prev);
	};

	const handleBackdropClick = (e) => {
		// Only close if clicking on the backdrop itself, not its children
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	// Use createPortal to render the modal directly to the document body
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
							Column Settings
						</h2>
						<p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-500 mt-1">
							Configure column properties and behavior
						</p>
					</div>
					<button
						onClick={onClose}
						className="p-2 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
						disabled={isUpdating || isDeleting}
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
									value={title}
									onChange={handleChange}
									className="w-full px-4 py-3 rounded-lg border 
										border-gray-200 dark:border-gray-700 midnight:border-gray-800 
										focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 midnight:focus:ring-indigo-500 
										bg-white dark:bg-gray-900 midnight:bg-gray-950 
										text-gray-900 dark:text-white midnight:text-indigo-200
										font-medium"
									disabled={isUpdating || isDeleting}
								/>
							</div>

							{/* Completion Column Section */}
							<div className="mb-6">
								<div className="flex items-center justify-between mb-3">
									<div>
										<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center mb-1">
											<CheckCircle className="w-4 h-4 mr-1" />
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
										disabled={isUpdating || isDeleting}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 midnight:focus:ring-indigo-700
                    ${
						isCompletionColumn
							? "bg-green-500 dark:bg-green-600 midnight:bg-green-700"
							: "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700"
					}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${
							isCompletionColumn
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

							{/* Status Messages */}
							{error && (
								<div className="p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-700 midnight:border-red-800 rounded-lg text-red-600 dark:text-red-400 midnight:text-red-500 text-sm flex items-center">
									<X className="w-4 h-4 mr-2 flex-shrink-0" />
									{error}
								</div>
							)}

							{showSuccessMessage && (
								<div className="p-3 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-200 dark:border-green-700 midnight:border-green-800 rounded-lg text-green-600 dark:text-green-400 midnight:text-green-500 text-sm flex items-center">
									<CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
									Settings saved successfully
								</div>
							)}
						</div>
					</div>{" "}
					{/* Footer */}
					<div className="flex items-center justify-between p-8 border-t border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
						{/* Left: Delete Button */}
						<div>
							{!confirmDelete ? (
								<button
									type="button"
									onClick={handleDeleteClick}
									className="px-4 py-2 rounded-lg transition-colors border border-red-300 dark:border-red-600 midnight:border-red-800 shadow-sm
										text-red-600 dark:text-red-400 midnight:text-red-400 
										hover:text-red-800 dark:hover:text-red-300 midnight:hover:text-red-300 
										hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20
										focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 dark:focus-visible:ring-red-600 midnight:focus-visible:ring-red-700
										disabled:text-red-300 dark:disabled:text-red-600 midnight:disabled:text-red-700
										disabled:hover:bg-transparent dark:disabled:hover:bg-transparent midnight:disabled:hover:bg-transparent
										disabled:cursor-not-allowed disabled:opacity-50
										flex items-center space-x-2"
									disabled={
										isUpdating ||
										isDeleting ||
										(column.Cards &&
											column.Cards.length > 0)
									}
									title={
										column.Cards && column.Cards.length > 0
											? "Cannot delete column with cards"
											: "Delete this column"
									}
								>
									<Trash2 className="w-4 h-4" />
									<span>Delete Column</span>
								</button>
							) : (
								<button
									type="button"
									onClick={handleConfirmDelete}
									className="px-4 py-2 bg-red-600 dark:bg-red-700 midnight:bg-red-800 
										text-white rounded-lg transition-colors
										hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900 
										focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 dark:focus-visible:ring-red-600 midnight:focus-visible:ring-red-700
										disabled:bg-red-300 dark:disabled:bg-red-600 midnight:disabled:bg-red-600/20 
										disabled:cursor-not-allowed flex items-center space-x-2 shadow-sm"
									disabled={isDeleting}
								>
									{isDeleting ? (
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
											<span>Deleting...</span>
										</>
									) : (
										<span>Confirm Delete</span>
									)}
								</button>
							)}
						</div>

						{/* Right: Save Button */}
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
									isUpdating ||
									isDeleting ||
									!title.trim() ||
									confirmDelete
								}
							>
								{isUpdating ? (
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
										<span>Saving...</span>
									</>
								) : (
									<span>Save Changes</span>
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

export default ColumnSettingsModal;
