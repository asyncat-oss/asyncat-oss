import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
	File,
	FileSpreadsheet,
	FileText,
	Image,
	X,
	ArrowLeft,
	ArrowRight,
	Check,
	AlertCircle,
	Calendar,
	CalendarDays,
	AlertTriangle,
	CheckCircle,
	Paperclip,
	Siren,
	Disc3Icon,
	LifeBuoy,
	Upload,
	Plus,
	Columns3,
} from "lucide-react";
import { useColumnContext } from "../../../context/viewContexts";
import { useCardContext } from "../../../context/viewContexts";
import { useCardActions } from "../../../hooks/useCardActions";
import TaskChecklist from "../shared/components/TaskChecklist";
import DropdownBar from "../shared/components/DropdownBar";
import CustomDatePicker from "../shared/components/CustomDatePicker";
import AddColumnModal from "../columns/components/AddColumnModal";

const AddCardModal = ({ onClose, onSuccess, defaultColumnId }) => {
	const { columns, selectedProject, loadColumns } = useColumnContext();
	const { addCard } = useCardActions();
	const { createdBy } = useCardContext();

	// Three-step layout management
	const [currentStep, setCurrentStep] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Validation state
	const [dateValidationError, setDateValidationError] = useState(null);
	
	// Column creation state
	const [showCreateColumnModal, setShowCreateColumnModal] = useState(false);

	const [cardData, setCardData] = useState({
		title: "",
		description: "",
		priority: "Medium",
		columnId:
			defaultColumnId && columns.find((col) => col.id === defaultColumnId)
				? defaultColumnId
				: columns[0]?.id || "",
		startDate: new Date().toISOString().split("T")[0],
		dueDate: new Date().toISOString().split("T")[0],
		//duration: null,
		comments: [],
		progress: 0,
		checklist: [],
		tasks: { completed: 0, total: 0 },
		createdBy: createdBy,
	});

	const [projectMembers, setProjectMembers] = useState([]);
	const [isLoadingMembers, setIsLoadingMembers] = useState(false);

	const [fileError, setFileError] = useState(null);
	const [selectedFiles, setSelectedFiles] = useState([]);

	// Date validation function
	const validateDates = (startDate, dueDate) => {
		if (!startDate || !dueDate) return null;

		try {
			const start = new Date(startDate);
			const due = new Date(dueDate);

			if (start > due) {
				return "Start date cannot be after due date";
			}
			return null;
		} catch (error) {
			return "Invalid date format";
		}
	};

	// Validate dates on mount and when dates change
	useEffect(() => {
		const error = validateDates(cardData.startDate, cardData.dueDate);
		setDateValidationError(error);
	}, [cardData.startDate, cardData.dueDate]);

	useEffect(() => {
		// Single-user mode: no project members to fetch — administrator assignment not applicable.
		setProjectMembers([]);
		setIsLoadingMembers(false);
	}, [cardData.columnId, columns]);

	// Priority options for dropdown
	const priorityOptions = [
		{ value: "High", label: "High" },
		{ value: "Medium", label: "Medium" },
		{ value: "Low", label: "Low" },
	];

	const columnOptions = columns.map((column) => ({
			value: column.id,
			label: column.title,
		}));
	
	// Handler for column creation success
	const handleColumnCreated = async () => {
		setShowCreateColumnModal(false);
		// Reload columns to get the newly created one
		await loadColumns();
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setCardData((prev) => ({ ...prev, [name]: value }));
	};

	const handleChecklistUpdate = (newChecklist) => {
		const completedTasks = newChecklist.filter(
			(task) => task.completed
		).length;
		setCardData((prev) => ({
			...prev,
			checklist: newChecklist,
			progress: newChecklist.length
				? Math.round((completedTasks / newChecklist.length) * 100)
				: 0,
			tasks: { completed: completedTasks, total: newChecklist.length },
		}));
	};

	const handleChecklistItemAssigneesChange = (itemId, assignees) => {
		// Update the checklist item with new assignees
		setCardData((prev) => ({
			...prev,
			checklist: prev.checklist.map((item) =>
				item.id === itemId ? { ...item, assignees } : item
			),
		}));
	};

	const handleDateKeyDown = (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.target.blur();
		}
	};

	const handleFileChange = (e) => {
		const newFiles = Array.from(e.target.files);
		const validTypes = [
			// Images
			"image/png",
			"image/jpeg",
			"image/jpg",
			"image/gif",
			"image/webp",
			"image/svg+xml",
			"image/bmp",
			// Documents
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-powerpoint",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			// Text files
			"text/plain",
			"text/csv",
			"text/html",
			"text/css",
			"text/javascript",
			"application/json",
			"application/xml",
			"text/xml",
			// Archives
			"application/zip",
			"application/x-zip-compressed",
			"application/x-rar-compressed",
			"application/x-7z-compressed",
			"application/x-tar",
			"application/gzip",
		];
		const maxSizeInBytes = 10 * 1024 * 1024;
		let totalFileSize = 0;

		for (const file of [...selectedFiles, ...newFiles]) {
			totalFileSize += file.size;
		}

		for (const file of newFiles) {
			if (!validTypes.includes(file.type)) {
				setFileError(
					`Invalid file type: ${file.type}. Please upload a supported file format.`
				);
				return;
			}
		}

		if (totalFileSize > maxSizeInBytes) {
			setFileError("Total file size exceeds 10MB.");
			return;
		}

		setFileError(null);
		setSelectedFiles((prev) => [...prev, ...newFiles]);
	};

	const handleRemoveFile = (index) => {
		setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const getFileIcon = (type) => {
		if (!type) return <File className="w-4 h-4 mr-2" />;
		if (type.includes("pdf") || type === "application/pdf")
			return <FileText className="w-4 h-4 mr-2" />;
		if (type.includes("image") || type.match(/image\/(jpeg|png|gif)/))
			return <Image className="w-4 h-4 mr-2" />;
		if (
			type.includes("spreadsheet") ||
			type.includes("excel") ||
			type ===
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		)
			return <FileSpreadsheet className="w-4 h-4 mr-2" />;
		if (
			type.includes("word") ||
			type ===
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		)
			return <FileText className="w-4 h-4 mr-2" />;
		return <File className="w-4 h-4 mr-2" />;
	};

	const handleFinalSubmit = async (e) => {
		e.preventDefault();

		if (dateValidationError) {
			return;
		}

		setIsSubmitting(true);

		try {
			// Enhanced checklist with scheduling/duration data
			const enhancedChecklist = (cardData.checklist || []).map(
				(item) => ({
					...item,
					dueDate: item.dueDate || cardData.dueDate,
					duration: item.duration || null,
				})
			);

			// Create the card
			const newCard = {
				...cardData,
				checklist: enhancedChecklist,
				files: selectedFiles,
				createdBy: createdBy,
			};

			// Create the card
			const createdCard = await addCard(cardData.columnId, newCard);

			// Call success callback
			if (onSuccess) {
				onSuccess();
			} else {
				onClose();
			}
		} catch (error) {
			console.error("Error adding card:", error);
			setIsSubmitting(false);
		}
	};

	// Step navigation functions
	const nextStep = () => {
		if (currentStep < 1) {
			setCurrentStep(currentStep + 1);
		}
	};

	const prevStep = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		}
	};

	// Validation function for step 1
	const canProceedToStep2 = () => {
		return (
			cardData.title.trim() &&
			cardData.description.trim() &&
			cardData.priority &&
			cardData.columnId &&
			cardData.startDate &&
			cardData.dueDate &&
			!dateValidationError
		);
	};

	// Validation function for the entire form
	const canSubmit = () => {
		return canProceedToStep2();
	};
	const handleBackdropClick = (e) => {
		// Only close if clicking on the backdrop itself, not its children
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	// Get priority icon like in Card.jsx
	const getPriorityIcon = (priority) => {
		switch (priority?.toLowerCase()) {
			case "high":
				return (
					<Siren className="w-4 h-4 text-red-400 dark:text-red-600 midnight:text-red-700" />
				);
			case "medium":
				return (
					<Disc3Icon className="w-4 h-4 text-yellow-400 dark:text-yellow-600 midnight:text-yellow-700" />
				);
			case "low":
				return (
					<LifeBuoy className="w-4 h-4 text-green-400 dark:text-green-600 midnight:text-green-700" />
				);
			default:
				return (
					<LifeBuoy className="w-4 h-4 text-gray-400 dark:text-gray-600 midnight:text-gray-700" />
				);
		}
	};

	// Render step 1 content - Basic Information
	const renderStep1Content = () => {
		return (
			<div className="space-y-8">
				{/* Header Section - Title and Priority like Card.jsx */}
				<div className="flex items-start justify-between mb-6">
					<div className="flex-1 mr-6">
						<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
							Task Title
						</label>
						<input
							type="text"
							name="title"
							value={cardData.title}
							onChange={handleChange}
							className="w-full px-4 py-3 rounded-lg border 
								border-gray-200 dark:border-gray-700 midnight:border-gray-800 
								focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 midnight:focus:ring-indigo-500 
								bg-white dark:bg-gray-900 midnight:bg-gray-950 
								text-gray-900 dark:text-white midnight:text-indigo-200
								font-medium"
							placeholder="Enter card title"
							required
							disabled={isSubmitting}
						/>
					</div>
					<div className="w-36">
						<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
							<AlertCircle className="w-4 h-4 inline mr-1" />
							Priority
						</label>
						<DropdownBar
							value={cardData.priority}
							onChange={(value) => {
								setCardData((prev) => ({
									...prev,
									priority: value,
								}));
							}}
							options={priorityOptions}
							type="priority"
							disabled={isSubmitting}
						/>
					</div>
				</div>

				{/* Description Section */}
				<div className="mb-4">
					<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
						Description
					</label>
					<textarea
						name="description"
						value={cardData.description}
						onChange={handleChange}
						onKeyDown={(e) => {
							// Prevent event propagation for space key
							if (e.key === ' ' || e.code === 'Space') {
								e.stopPropagation();
							}
						}}
						rows="4"
						className="w-full px-4 py-3 rounded-lg border 
							border-gray-200 dark:border-gray-700 midnight:border-gray-800 
							focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 midnight:focus:ring-indigo-500 
							bg-white dark:bg-gray-900 midnight:bg-gray-950 
							text-gray-900 dark:text-white midnight:text-indigo-200 
							placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-600"
						placeholder="Enter card description..."
						required
						disabled={isSubmitting}
					/>
				</div>

				{/* Status Banner Section - Column and Dates */}
				<div className="space-y-3 mb-4">
					<div>
						<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
							Column
						</label>
						
						{/* Show create column option if no columns available */}
						{columnOptions.length === 0 ? (
							<div className="space-y-3">
								<div className="p-4 bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5 border border-amber-200 dark:border-amber-800/30 midnight:border-amber-800/20 rounded-lg">
									<div className="flex items-start space-x-2 mb-3">
										<AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 midnight:text-amber-400 mt-0.5 flex-shrink-0" />
										<div className="text-sm">
											<p className="text-amber-800 dark:text-amber-300 midnight:text-amber-300 font-medium mb-1">
												No Columns Available
											</p>
											<p className="text-amber-700 dark:text-amber-400 midnight:text-amber-400 text-xs leading-relaxed">
												You need at least one column to create a task. Create your first column to get started.
											</p>
										</div>
									</div>
								</div>
								<button
									type="button"
									onClick={() => setShowCreateColumnModal(true)}
									disabled={isSubmitting}
									className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-600 midnight:hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
								>
									<Plus className="w-4 h-4" />
									<span>Create Your First Column</span>
								</button>
							</div>
						) : (
							<div className="space-y-2">
								<DropdownBar
									value={cardData.columnId}
									onChange={(value) => {
										setCardData((prev) => ({
											...prev,
											columnId: value,
										}));
									}}
									options={columnOptions}
									type="column-custom"
									placeholder="Select a column..."
									disabled={isSubmitting}
									enableSearch={true}
								/>
								<button
									type="button"
									onClick={() => setShowCreateColumnModal(true)}
									disabled={isSubmitting}
									className="w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-colors flex items-center justify-center space-x-2 border border-dashed border-gray-300 dark:border-gray-700 midnight:border-gray-800"
								>
									<Columns3 className="w-4 h-4" />
									<span>Create New Column</span>
								</button>
							</div>
						)}
					</div>

					{/* Date Section - like due date banners in Card.jsx */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
								<CalendarDays className="w-4 h-4 inline mr-1" />
								Start Date
							</label>
							<CustomDatePicker
								name="startDate"
								value={cardData.startDate}
								onChange={handleChange}
								onKeyDown={handleDateKeyDown}
								disabled={isSubmitting}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
								<Calendar className="w-4 h-4 inline mr-1" />
								Due Date
							</label>
							<CustomDatePicker
								name="dueDate"
								value={cardData.dueDate}
								onChange={handleChange}
								onKeyDown={handleDateKeyDown}
								disabled={isSubmitting}
							/>
						</div>
					</div>

					{dateValidationError && (
						<div className="p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-700 midnight:border-red-800 rounded-lg text-red-600 dark:text-red-400 midnight:text-red-500 text-sm flex items-center">
							<AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
							{dateValidationError}
						</div>
					)}
				</div>
			</div>
		);
	};

	// Render step 2 content - Advanced Configuration
	const renderStep2Content = () => {
		return (
			<div className="space-y-8">
				{/* Subtasks Section */}
				<div className="mb-6">
					<h3 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center">
						<CheckCircle className="w-4 h-4 mr-1" />
						Subtasks
					</h3>
					<div className="max-h-64 overflow-y-auto overflow-x-hidden pr-2">
						<TaskChecklist
							tasks={cardData.checklist}
							onUpdate={handleChecklistUpdate}
							isCreating={true}
							readOnly={isSubmitting}
							projectMembers={projectMembers}
							isLoadingMembers={isLoadingMembers}
							onAssigneeChange={
								handleChecklistItemAssigneesChange
							}
							enableEditing={true}
							enhancedCreation={true}
							disableCompletion={true}
							positioningConfig={{
								preferredPosition: "top",
								forcePosition: true,
								offsetAdjustment: { top: 2, right: 0 },
							}}
						/>
					</div>
				</div>

				{/* Attachments Section */}
				<div className="mb-6">
					<h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center">
						<Paperclip className="w-4 h-4 mr-1" />
						Attachments
						{selectedFiles.length > 0 && (
							<span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-400 midnight:text-blue-400 rounded-full">
								{selectedFiles.length}
							</span>
						)}
					</h3>

					{/* File Upload Area */}
					<div className="border border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-8 text-center hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-indigo-600 transition-colors">
						<label
							className={`${
								isSubmitting
									? "cursor-not-allowed"
									: "cursor-pointer"
							} block`}
						>
							<div className="flex flex-col items-center">
								<div className="w-10 h-10 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center">
									<Upload className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
								</div>
								<span className="text-sm text-gray-600 dark:text-gray-300 midnight:text-gray-400 mb-2">
									Drop files here or click to browse
								</span>
								<span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									Supports images, documents, spreadsheets,
									archives & more (max 10MB)
								</span>
							</div>
							<input
								type="file"
								id="file-upload"
								className="hidden"
								accept=".pdf,.png,.jpeg,.jpg,.gif,.webp,.svg,.bmp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html,.css,.js,.json,.xml,.zip,.rar,.7z,.tar,.gz"
								multiple
								onChange={handleFileChange}
								disabled={isSubmitting}
							/>
						</label>
					</div>

					{/* Error Message */}
					{fileError && (
						<div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900/20 midnight:border-red-800">
							<div className="flex items-start space-x-3">
								<AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 midnight:text-red-500 flex-shrink-0 mt-0.5" />
								<span className="text-sm text-red-600 dark:text-red-400 midnight:text-red-400">
									{fileError}
								</span>
							</div>
						</div>
					)}

					{/* Selected Files List */}
					{selectedFiles.length > 0 && (
						<div className="mt-4 space-y-3">
							<div className="flex items-center space-x-2">
								<div className="w-2 h-2 bg-blue-500 rounded-full"></div>
								<h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
									Uploaded Attachments
								</h5>
								<span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
									({selectedFiles.length}{" "}
									{selectedFiles.length === 1
										? "file"
										: "files"}
									)
								</span>
							</div>
							<div className="space-y-2 max-h-64 overflow-y-auto pr-2">
								{selectedFiles.map((file, index) => (
									<div
										key={index}
										className="group flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-indigo-700 transition-colors bg-white dark:bg-gray-900 midnight:bg-gray-950"
									>
										<div className="flex items-center space-x-3 overflow-hidden min-w-0 flex-1">
											{getFileIcon(file.type)}
											<div className="min-w-0 flex-1">
												<div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200 truncate">
													{file.name}
												</div>
												<div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
													{file.size
														? `${(
																file.size / 1024
														  ).toFixed(1)} KB`
														: "File"}
												</div>
											</div>
										</div>
										<button
											onClick={() =>
												handleRemoveFile(index)
											}
											className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 midnight:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2"
											disabled={isSubmitting}
											aria-label="Remove file"
										>
											<X className="w-4 h-4" />
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Empty State */}
					{selectedFiles.length === 0 && !fileError && (
						<div className="mt-4 text-center py-4">
							<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								No files selected yet
							</p>
						</div>
					)}
				</div>
			</div>
		);
	};

	// Render current step content
	const renderStepContent = () => {
		switch (currentStep) {
			case 0:
				return renderStep1Content();
			case 1:
				return renderStep2Content();
			default:
				return renderStep1Content();
		}
	};

	// Render both modals - card modal and column creation modal
	return (
		<>
			{/* Main Card Creation Modal */}
			{createPortal(
				<div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
					<div
						className="fixed inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
						onClick={handleBackdropClick}
					/>
					<div className="relative z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-gray-950/95 backdrop-blur-sm rounded-xl w-full max-w-5xl mx-6 shadow-2xl border border-gray-200/80 dark:border-gray-700 midnight:border-gray-800 flex flex-col overflow-hidden max-h-[95vh] min-w-0">
						{/* Header */}
						<div className="flex items-center justify-between p-8 border-b border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
							<div>
								<h2 className="text-xl font-medium text-gray-900 dark:text-white midnight:text-indigo-200">
									Create New Task
								</h2>
								<p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-500 mt-1">
									{currentStep === 0
										? "Enter the basic details for your task"
										: "Configure subtasks and attachments"}
								</p>
							</div>
							<button
								onClick={() => {
									onClose();
								}}
								className="p-2 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						{/* Content area */}
						<div className="flex-1 overflow-y-auto overflow-x-hidden p-8 min-w-0">
							{renderStepContent()}
						</div>

						{/* Footer */}
						<div className="flex items-center justify-between p-8 border-t border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
							{/* Left: Cancel */}
							<div>
								<button
									type="button"
									onClick={() => {
										onClose();
									}}
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

							{/* Right: Navigation */}
							<div className="flex items-center space-x-3">
								{currentStep > 0 && (
									<button
										type="button"
										onClick={prevStep}
										disabled={isSubmitting}
										className="px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-indigo-800 shadow-sm
											text-gray-600 dark:text-gray-300 midnight:text-gray-400 
											hover:text-gray-800 dark:hover:text-gray-100 midnight:hover:text-indigo-200 
											hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900
											focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 midnight:focus-visible:ring-indigo-700
											disabled:text-gray-300 dark:disabled:text-gray-600 midnight:disabled:text-gray-700"
									>
										<ArrowLeft className="w-4 h-4" />
										<span>Back</span>
									</button>
								)}

								{currentStep < 1 ? (
									<button
										type="button"
										onClick={nextStep}
										disabled={!canProceedToStep2() || isSubmitting}
										className="px-6 py-2 bg-gray-900 dark:bg-gray-700 midnight:bg-indigo-900
											text-white rounded-lg transition-colors flex items-center space-x-2 shadow-sm
											hover:bg-gray-800 dark:hover:bg-gray-600 midnight:hover:bg-indigo-700
											focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 midnight:focus-visible:ring-indigo-700
											disabled:bg-gray-300 dark:disabled:bg-gray-600 midnight:disabled:bg-indigo-600/20
											disabled:cursor-not-allowed"
									>
										<span>Next</span>
										<ArrowRight className="w-4 h-4" />
									</button>
								) : (
									<button
										type="button"
										onClick={handleFinalSubmit}
										disabled={!canSubmit() || isSubmitting}
										className="px-6 py-2 bg-gray-900 dark:bg-gray-700 midnight:bg-indigo-900
											text-white rounded-lg transition-colors
											hover:bg-gray-800 dark:hover:bg-gray-600 midnight:hover:bg-indigo-700
											focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 midnight:focus-visible:ring-indigo-700
											disabled:bg-gray-300 dark:disabled:bg-gray-600 midnight:disabled:bg-indigo-600/20
											disabled:cursor-not-allowed flex items-center space-x-2 shadow-sm"
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
												<span>Create Card</span>
												<Check className="w-4 h-4 ml-1" />
											</>
										)}
									</button>
								)}
							</div>
						</div>
					</div>
				</div>,
				document.body
			)}
			
			{/* Column Creation Modal - Higher z-index to appear on top */}
			{showCreateColumnModal && (
				<AddColumnModal
					onClose={() => setShowCreateColumnModal(false)}
					onSuccess={handleColumnCreated}
					projectId={selectedProject?.id}
				/>
			)}
		</>
	);
};

export default AddCardModal;
