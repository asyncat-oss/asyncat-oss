import {
	useState,
	useEffect,
	useCallback,
	useRef,
} from "react";

import {
 	FileText,
 	File,
 	Image,
 	FileSpreadsheet,
 	ClipboardList,
 	Clock,
 	Trash2,
 	Save,
 	AlertTriangle,
 	ChevronUp,
 	ChevronDown,
 	Paperclip,
 	Calendar,
 	CalendarDays,
 	Edit3,
 	Loader,
	Bot,
	ExternalLink,
	Play,
	RotateCcw,
} from "lucide-react";
import { useCardActions } from "../../hooks/useCardActions";
import { useColumnContext } from "../../context/viewContexts";
import { useCardContext } from "../../context/viewContexts";
import { agentTaskRunsApi, profilesApi } from "../../../CommandCenter/commandCenterApi";

// Import needed components
import CardSubtasksSection from "../subtask/CardSubtasksSection";
import CardAttachmentsSection from "../attachments/CardAttachmentsSection";

import { InteractiveStatusBadge } from "../../list/ListViewCard";
import CustomDatePicker from "../../kanban/features/shared/components/CustomDatePicker";
import DropdownBar from "../../kanban/features/shared/components/DropdownBar";

// Collapsible Section Component
const CollapsibleSection = ({
	title,
	icon,
	isExpanded,
	onToggle,
	children,
	summary = null,
	count = null,
}) => {
	return (
		<div className="border-b border-gray-100 dark:border-gray-800 midnight:border-gray-900/80 last:border-b-0">
			<button
				onClick={onToggle}
				className="w-full flex items-center justify-between py-4 px-2 text-left hover:bg-gray-50/70 dark:hover:bg-gray-900/40 midnight:hover:bg-gray-950/40 rounded-lg transition-all duration-200 hover:shadow-sm"
			>
				<div className="flex items-center space-x-3">
					{icon}
					<span className="font-medium text-gray-900 dark:text-gray-400 midnight:text-gray-300">
						{title}
					</span>
					{count !== null && (
						<span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 px-2 py-0.5 rounded-full">
							{count}
						</span>
					)}
				</div>
				<div className="flex items-center space-x-2">
					{summary && !isExpanded && (
						<span className="text-sm text-gray-500">{summary}</span>
					)}
					{isExpanded ? (
						<ChevronUp className="w-4 h-4 text-gray-400" />
					) : (
						<ChevronDown className="w-4 h-4 text-gray-400" />
					)}
				</div>
			</button>

			<div
				className={`transition-all duration-200 overflow-hidden ${
					isExpanded ? "max-h-[2000px] pb-6" : "max-h-0"
				}`}
			>
				{children}
			</div>
		</div>
	);
};

/**
 * CardDetailModal Component with Real-time Editing Features
 */
const CardDetailModal = ({
	card: initialCard,
	onClose,
	onDeleteStart,
	onOptimisticUpdate = () => {},
}) => {
	const { columns, setColumns } = useColumnContext();
	const {
		handleCardUpdate,
		handleCardDelete,
		addAttachment,
		removeAttachment,
		moveCard,
	} = useCardActions();

	const handleSaveRef = useRef();

	// UI feedback states
	const [saveStatus, setSaveStatus] = useState(null);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const [isDeletingCard, setIsDeletingCard] = useState(false);
	const [isUploadingFiles, setIsUploadingFiles] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isEntering, setIsEntering] = useState(true);
	const [isLeaving, setIsLeaving] = useState(false);
	const [dateValidationError, setDateValidationError] = useState(null);

	// Unsaved subtask text state
	const [hasUnsavedSubtaskText, setHasUnsavedSubtaskText] = useState(false);
	const [shouldBounceSaveAll, setShouldBounceSaveAll] = useState(false);

	// Real-time state
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [isLocallyEditing, setIsLocallyEditing] = useState(false);
	const modalRef = useRef(null);
	const editingStartTimeRef = useRef(null);

	// FREEZE initial card data to prevent external prop changes from affecting modal state
	const frozenInitialCard = useRef(null);
	if (!frozenInitialCard.current) {
		frozenInitialCard.current = { ...initialCard };
	}

	// Section expansion states
	const [expandedSections, setExpandedSections] = useState({
		subtasks: true,
		attachments: false,
		agentWork: true,
	});

	// Initialize from FROZEN card data to prevent external prop updates
	const [localCard, setLocalCard] = useState({
		...frozenInitialCard.current,
		tasks: frozenInitialCard.current.tasks || { completed: 0, total: 0 },
		checklist: frozenInitialCard.current.checklist || [],
		files: [], // attachments disabled
		attachments: frozenInitialCard.current.attachments || [],
		startDate: frozenInitialCard.current.startDate || null,
		dueDate: frozenInitialCard.current.dueDate || null,
		predictedMinutes: frozenInitialCard.current.predictedMinutes || null,
	});

	const { setSelectedCard } = useCardContext();
	const [fileError, setFileError] = useState(null);

	const [agentProfiles, setAgentProfiles] = useState([]);
	const [agentRuns, setAgentRuns] = useState([]);
	const [isLoadingAgentRuns, setIsLoadingAgentRuns] = useState(false);
	const [assigningAgent, setAssigningAgent] = useState(false);
	const [selectedAgentProfileId, setSelectedAgentProfileId] = useState("");

	useEffect(() => {
		setIsEntering(false);
	}, []);

	// Track editing session
	useEffect(() => {
		editingStartTimeRef.current = Date.now();
		setIsLocallyEditing(true);
	}, []);

	// Enhanced close handler
	const handleClose = useCallback(
		(e) => {
			if (e?.target === e?.currentTarget || !e) {
				setIsLeaving(true);
				setTimeout(() => {
					onClose();
				}, 200);
			}
		},
		[onClose]
	);

	// Handle escape key
	useEffect(() => {
		const handleEscape = (e) => {
			if (e.key === "Escape") {
				handleClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [handleClose]);

	// Handle optimistic updates
	const handleOptimisticUpdate = (updates) => {
		setHasUnsavedChanges(true);
		if (onOptimisticUpdate) {
			onOptimisticUpdate(localCard.id, updates);
		}
	};

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

	const handleChange = useCallback(
		(e) => {
			const { name, value } = e.target;

			// Immediate state update without causing re-renders
			setLocalCard((prev) => ({ ...prev, [name]: value }));

			// Handle date validation separately to avoid re-render during typing
			if (name === "startDate" || name === "dueDate") {
				const startDate =
					name === "startDate" ? value : localCard.startDate;
				const dueDate = name === "dueDate" ? value : localCard.dueDate;
				const error = validateDates(startDate, dueDate);
				setDateValidationError(error);
			}

			// Debounce optimistic updates to avoid frequent re-renders
			setHasUnsavedChanges(true);
		},
		[localCard.startDate, localCard.dueDate]
	);

	// Separate handlers for title and description to prevent cursor jumping
	const handleTitleChange = useCallback((e) => {
		const value = e.target.value;
		setLocalCard((prev) => ({ ...prev, title: value }));
		setHasUnsavedChanges(true);
	}, []);

	const handleDescriptionChange = useCallback((e) => {
		const value = e.target.value;
		setLocalCard((prev) => ({ ...prev, description: value }));
		setHasUnsavedChanges(true);
	}, []);

	const handleSave = useCallback(async () => {
		if (dateValidationError) {
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
			return;
		}

		try {
			setSaveStatus("saving");
			setIsSubmitting(true);
			const columnId = String(localCard.columnId);
			const cardId = String(localCard.id);

			// Get files from localCard state
			const files =
				localCard.files && localCard.files.length > 0
					? localCard.files
					: null;

			const cardUpdateData = {
				id: localCard.id,
				title: localCard.title,
				description: localCard.description,
				priority: localCard.priority,
				startDate: localCard.startDate,
				dueDate: localCard.dueDate,
				predictedMinutes: localCard.predictedMinutes,
				progress: localCard.progress,
				columnId: localCard.columnId,
				checklist: localCard.checklist,
				tasks: localCard.tasks,
				attachments: localCard.attachments,
				createdAt: localCard.createdAt,
			};

			const processedUpdateData = { ...cardUpdateData };

			const updatedCard = {
				...processedUpdateData,
				updatedAt: new Date().toISOString(),
			};

			setColumns((prevColumns) =>
				prevColumns.map((column) => {
					if (column.id === columnId) {
						return {
							...column,
							Cards: Array.isArray(column.Cards)
								? column.Cards.map((card) =>
										String(card.id) === cardId
											? updatedCard
											: card
								  )
								: [],
						};
					}
					return column;
				})
			);

			const backendUpdatedCard = await handleCardUpdate(
				columnId,
				cardId,
				processedUpdateData
			);

			if (backendUpdatedCard) {
				setLocalCard((prev) => ({
					...prev,
					...backendUpdatedCard,
					files: prev.files,
				}));
			}

			setSaveStatus("saved");
			setHasUnsavedChanges(false);
			setTimeout(() => setSaveStatus(null), 2000);
			setIsSubmitting(false);
		} catch (error) {
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
			setIsSubmitting(false);
		}
	}, [
		localCard,
		handleCardUpdate,
		setColumns,
		addAttachment,
		dateValidationError,
	]);

	useEffect(() => {
		handleSaveRef.current = handleSave;
	}, [handleSave]);

	const loadAgentRuns = useCallback(async () => {
		if (!localCard?.id) return;
		setIsLoadingAgentRuns(true);
		try {
			const result = await agentTaskRunsApi.list({ cardId: localCard.id });
			const task = (result.tasks || []).find((item) => item.id === localCard.id);
			setAgentRuns(task?.agentRuns || (task?.agentRun ? [task.agentRun] : []));
		} catch (error) {
			console.error("Error loading agent work:", error);
			setAgentRuns([]);
		} finally {
			setIsLoadingAgentRuns(false);
		}
	}, [localCard?.id]);

	useEffect(() => {
		profilesApi
			.listProfiles()
			.then((result) => {
				const profiles = result.profiles || [];
				setAgentProfiles(profiles);
				if (!selectedAgentProfileId && profiles[0]) {
					setSelectedAgentProfileId(profiles[0].id);
				}
			})
			.catch((error) => console.error("Error loading agent profiles:", error));
	}, [selectedAgentProfileId]);

	useEffect(() => {
		loadAgentRuns();
	}, [loadAgentRuns]);

	useEffect(() => {
		const active = agentRuns.some((run) =>
			["queued", "running"].includes(run?.status)
		);
		if (!active) return;
		const timer = setInterval(loadAgentRuns, 3000);
		return () => clearInterval(timer);
	}, [agentRuns, loadAgentRuns]);

	const handleAssignAgent = async (profileId = selectedAgentProfileId) => {
		if (!localCard?.id || !profileId) return;
		setAssigningAgent(true);
		try {
			const result = await agentTaskRunsApi.create({
				cardId: localCard.id,
				profileId,
			});
			setAgentRuns(result.run ? [result.run] : []);
		} catch (error) {
			console.error("Error assigning agent:", error);
		} finally {
			setAssigningAgent(false);
		}
	};

	const latestAgentRun = agentRuns[0] || null;

	const handleBlockedSaveClick = useCallback(() => {
		setShouldBounceSaveAll(true);
		setTimeout(() => setShouldBounceSaveAll(false), 1000);
	}, []);

	const handleChecklistUpdate = useCallback(
		(newChecklist, shouldImmediateSave = false) => {
			const processedChecklist = newChecklist.map((item) => {
				const normalized = { ...item };
				delete normalized.assignees;
				delete normalized.assigneeDetails;
				delete normalized.assignee_id;
				return normalized;
			});

			const completedTasks = processedChecklist.filter(
				(task) => task.completed
			).length;

			const totalDuration = processedChecklist.reduce((total, item) => {
				if (!item.completed) {
					const itemDuration = parseInt(item.duration) || 0;
					return total + itemDuration;
				}
				return total;
			}, 0);

			const updates = {
				checklist: processedChecklist,
				progress:
					Math.round(
						(completedTasks / processedChecklist.length) * 100
					) || 0,
				tasks: {
					completed: completedTasks,
					total: processedChecklist.length,
				},
				predictedMinutes: totalDuration,
			};

			// Handle optimistic update for real-time sync
			handleOptimisticUpdate(updates);

			setLocalCard((prev) => {
				const updatedCard = { ...prev, ...updates };

				if (shouldImmediateSave && handleSaveRef.current) {
					setTimeout(() => {
						handleSaveRef.current();
					}, 0);
				}

				return updatedCard;
			});
		},
		[localCard.id]
	);

	const handleDeleteCard = useCallback(() => {
		setIsConfirmingDelete((prev) => !prev);
	}, []);

	const handleConfirmDelete = useCallback(async () => {
		const columnId = String(localCard.columnId);
		const cardId = String(localCard.id);

		try {
			setIsDeletingCard(true);

			if (onDeleteStart) {
				onDeleteStart(cardId);
			}

			setColumns((prevColumns) =>
				prevColumns.map((column) => {
					if (column.id === columnId) {
						return {
							...column,
							Cards: Array.isArray(column.Cards)
								? column.Cards.filter(
										(card) => String(card.id) !== cardId
								  )
								: [],
						};
					}
					return column;
				})
			);

			setIsLeaving(true);
			setTimeout(() => {
				onClose();
			}, 200);

			setTimeout(async () => {
				await handleCardDelete(columnId, cardId);
				setSelectedCard(null);
			}, 300);
		} catch (error) {
			setIsDeletingCard(false);
		}
	}, [
		localCard,
		onDeleteStart,
		onClose,
		handleCardDelete,
		setSelectedCard,
		setColumns,
	]);

	const toggleSection = (sectionName) => {
		setExpandedSections((prev) => ({
			...prev,
			[sectionName]: !prev[sectionName],
		}));
	};

	const getDueStatus = () => {
		if (!localCard.dueDate) return null;
		const today = new Date();
		const dueDate = new Date(localCard.dueDate);
		const diffTime = dueDate - today;
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays < 0)
			return {
				status: "overdue",
				color: "text-red-600",
				bg: "bg-red-50",
			};
		if (diffDays === 0)
			return {
				status: "today",
				color: "text-amber-600",
				bg: "bg-amber-50",
			};
		if (diffDays <= 3)
			return { status: "soon", color: "text-gray-600", bg: "bg-gray-50" };
		return { status: "future", color: "text-gray-600", bg: "bg-gray-50" };
	};

	const getPriorityColor = () => {
		switch (localCard.priority) {
			case "High":
				return "text-red-600";
			case "Medium":
				return "text-amber-600";
			case "Low":
				return "text-gray-600";
			default:
				return "text-gray-500";
		}
	};

	const dueStatus = getDueStatus();

	useEffect(() => {
		for (const column of columns) {
			const foundCard = column.Cards?.find(
				(card) => String(card.id) === String(localCard.id)
			);
			if (foundCard && column.id !== localCard.columnId) {
				setLocalCard((prev) => ({
					...prev,
					columnId: column.id,
					Column: column,
				}));
				break;
			}
		}
	}, [columns, localCard.id, localCard.columnId]);

	if (!localCard) return null;

	return (
		<div
			className={`fixed inset-0 z-50 overflow-hidden transition-all duration-200 ${
				isLeaving ? "opacity-0" : "opacity-100"
			}`}
		>
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={handleClose}
			/>

			<div className="flex items-center justify-center min-h-full p-4">
				<div
					ref={modalRef}
					className={`
            relative bg-white dark:bg-gray-900 midnight:bg-gray-950 
            rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-800/50 
            w-full max-w-4xl max-h-[90vh] 
            overflow-hidden transform transition-all duration-200
            ${isLeaving ? "scale-95 opacity-0" : "scale-100 opacity-100"}
          `}
				>
					{/* Enhanced Header */}
					<div
						className={`
            sticky top-0 z-10 px-6 py-4 bg-gradient-to-b from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95 dark:to-transparent midnight:from-gray-950 midnight:via-gray-950/95 midnight:to-transparent
          `}
					>
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-3 mb-2">
									<input
										type="text"
										name="title"
										value={localCard.title || ""}
										onChange={handleTitleChange}
										className="text-2xl font-semibold bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 flex-1 transition-colors duration-200"
										placeholder="Untitled"
									/>

									{/* Status Indicators - moved to right side */}
									<div className="flex items-center gap-1.5">
										{isLocallyEditing && (
											<div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 midnight:bg-green-950/20 rounded-md">
												<Edit3 className="w-3 h-3 text-green-600 dark:text-green-400 midnight:text-green-400" />
												<span className="text-xs font-medium text-green-700 dark:text-green-400 midnight:text-green-400">
													Editing
												</span>
											</div>
										)}

										{hasUnsavedChanges && (
											<div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/20 midnight:bg-orange-950/20 rounded-md">
												<Clock className="w-3 h-3 text-orange-600 dark:text-orange-400 midnight:text-orange-400" />
												<span className="text-xs text-orange-700 dark:text-orange-400 midnight:text-orange-400">
													Unsaved
												</span>
											</div>
										)}

									</div>
								</div>

							</div>

							{/* Action Buttons */}
							<div className="ml-4 flex items-center space-x-2">
									{!isConfirmingDelete ? (
										<button
											onClick={handleDeleteCard}
											className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-md transition-colors"
										>
											<Trash2 className="w-4 h-4" />
										</button>
									) : (
										<div className="flex items-center space-x-2">
											<span className="text-sm text-gray-500">
												Are you sure?
											</span>
											<button
												onClick={handleConfirmDelete}
												disabled={isDeletingCard}
												className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
											>
												{isDeletingCard
													? "Deleting..."
													: "Delete"}
											</button>
											<button
												onClick={handleDeleteCard}
												disabled={isDeletingCard}
												className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
											>
												Cancel
											</button>
										</div>
									)}

									<button
										onClick={
											hasUnsavedSubtaskText
												? handleBlockedSaveClick
												: handleSave
										}
										disabled={
											isSubmitting ||
											isUploadingFiles ||
											dateValidationError
										}
										className="px-5 py-2.5 bg-gray-900 dark:bg-gray-600 midnight:bg-gray-400 hover:bg-gray-800 dark:hover:bg-gray-500 midnight:hover:bg-gray-300 disabled:bg-gray-300 dark:disabled:bg-gray-700 midnight:disabled:bg-gray-800 disabled:cursor-not-allowed text-white dark:text-gray-100 midnight:text-gray-900 text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-md flex items-center space-x-2"
									>
										{isSubmitting ? (
											<>
												<div className="animate-spin w-4 h-4 border-2 border-white/30 rounded-full border-t-white"></div>
												<span>Saving...</span>
											</>
										) : (
											<>
												<Save className="w-4 h-4" />
												<span>Save</span>
											</>
										)}
									</button>
								</div>
						</div>
					</div>

					{/* Date Validation Error */}
					{dateValidationError && (
						<div className="px-6 py-3 bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/20 border-b border-red-200 dark:border-red-900/20 midnight:border-red-900/30">
							<div className="flex items-center space-x-2 text-red-600 dark:text-red-400 midnight:text-red-300">
								<AlertTriangle className="w-4 h-4" />
								<span className="text-sm">
									{dateValidationError}
								</span>
							</div>
						</div>
					)}

					{/* Modal Content */}
					<div className="overflow-auto max-h-[calc(90vh-120px)]">
						<div className="flex-1 flex overflow-hidden min-w-0">
							{/* Left Column - Main Content */}
							<div className="flex-1 overflow-y-auto min-w-0">
									<div className="p-6 space-y-6">
										{/* Description */}
										<div>
											<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-2">
												Description
											</label>
											<textarea
												name="description"
												value={
													localCard.description || ""
												}
												onChange={
													handleDescriptionChange
												}
												onKeyDown={(e) => {
													// Prevent event propagation for space key
													if (e.key === ' ' || e.code === 'Space') {
														e.stopPropagation();
													}
												}}
												
												rows="4"
												className="w-full p-4 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 bg-gray-50/30 dark:bg-gray-800/50 midnight:bg-gray-900/50 rounded-xl resize-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:bg-white dark:focus:bg-gray-800 midnight:focus:bg-gray-900 disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-700 midnight:disabled:bg-gray-800 transition-all duration-200"
												placeholder="Add a description..."
											/>
										</div>

										{/* Collapsible Sections */}
										<div className="space-y-0">
											<CollapsibleSection
												title="Subtasks"
												icon={
													<ClipboardList className="w-4 h-4 text-gray-600" />
												}
												isExpanded={
													expandedSections.subtasks
												}
												onToggle={() =>
													toggleSection("subtasks")
												}
												count={
													localCard.checklist
														?.length || 0
												}
												summary={
													localCard.tasks?.total > 0
														? `${localCard.tasks.completed}/${localCard.tasks.total} completed`
														: null
												}
											>
												<div className="relative">
													<CardSubtasksSection
														checklist={
															localCard.checklist ||
															[]
														}
														tasks={
															localCard.tasks || {
																completed: 0,
																total: 0,
															}
														}
														onChecklistUpdate={
															handleChecklistUpdate
														}
														onUnsavedTextChange={
															setHasUnsavedSubtaskText
														}
														shouldBounceSaveAll={
															shouldBounceSaveAll
														}
														
													/>
												</div>
											</CollapsibleSection>

											<CollapsibleSection
												title="Attachments"
												icon={
													<Paperclip className="w-4 h-4 text-gray-600" />
												}
												isExpanded={
													expandedSections.attachments
												}
												onToggle={() =>
													toggleSection("attachments")
												}
												count={
													(localCard.attachments
														?.length || 0) +
													(localCard.files?.length ||
														0)
												}
											>
												<CardAttachmentsSection
													files={
														localCard.files || []
													}
													attachments={
														localCard.attachments ||
														[]
													}
													fileError={fileError}
													
													isUploading={
														isUploadingFiles
													}
													onFileChange={async (e) => {
														
														const newFiles =
															Array.from(
																e.target.files
															);

														if (
															newFiles.length ===
															0
														)
															return;

														// Show files as uploading immediately
														setLocalCard(
															(prev) => ({
																...prev,
																files: [
																	...(prev.files ||
																		[]),
																	...newFiles,
																],
															})
														);

														// Upload files immediately
														setIsUploadingFiles(
															true
														);
														try {
															const cardId =
																String(
																	localCard.id
																);
															const result =
																await addAttachment(
																	cardId,
																	newFiles
																);

															// Update card with new attachments and clear pending files
															setLocalCard(
																(prev) => ({
																	...prev,
																	files: [], // Clear pending files
																	attachments:
																		result.attachments ||
																		[],
																})
															);

															setFileError(null);
														} catch (error) {
															console.error(
																"Error uploading files:",
																error
															);
															setFileError(
																error.message ||
																	"Failed to upload files. Please try again."
															);
															// Remove failed files from pending list
															setLocalCard(
																(prev) => ({
																	...prev,
																	files: [],
																})
															);
														} finally {
															setIsUploadingFiles(
																false
															);
														}
													}}
													onDeleteFile={(
														fileToDelete
													) => {
														
														setLocalCard(
															(prev) => ({
																...prev,
																files: prev.files.filter(
																	(file) =>
																		file !==
																		fileToDelete
																),
															})
														);
													}}
													onDeleteAttachment={async (
														attachmentId
													) => {
														
														try {
															setSaveStatus(
																"saving"
															);
															const cardId =
																String(
																	localCard.id
																);
															const updatedCard =
																await removeAttachment(
																	cardId,
																	attachmentId
																);
															setLocalCard(
																(prev) => ({
																	...prev,
																	attachments:
																		updatedCard.attachments ||
																		[],
																})
															);
															setSaveStatus(
																"saved"
															);
															setTimeout(
																() =>
																	setSaveStatus(
																		null
																	),
																2000
															);
														} catch (error) {
															setSaveStatus(
																"error"
															);
															setTimeout(
																() =>
																	setSaveStatus(
																		null
																	),
																2000
															);
														}
													}}
													getFileIcon={(type) => {
														if (!type)
															return (
																<File className="w-4 h-4 text-gray-400" />
															);
														if (
															type.includes("pdf")
														)
															return (
																<FileText className="w-4 h-4 text-red-500" />
															);
														if (
															type.includes(
																"image"
															)
														)
															return (
																<Image className="w-4 h-4 text-blue-500" />
															);
														if (
															type.includes(
																"spreadsheet"
															) ||
															type.includes(
																"excel"
															)
														)
															return (
																<FileSpreadsheet className="w-4 h-4 text-green-500" />
															);
														if (
															type.includes(
																"word"
															)
														)
															return (
																<FileText className="w-4 h-4 text-blue-600" />
															);
														return (
															<File className="w-4 h-4 text-gray-400" />
														);
													}}
												/>
											</CollapsibleSection>

											<CollapsibleSection
												title="Agent Work"
												icon={<Bot className="w-4 h-4 text-gray-600" />}
												isExpanded={expandedSections.agentWork}
												onToggle={() => toggleSection("agentWork")}
												count={isLoadingAgentRuns ? <Loader className="w-3 h-3 animate-spin" /> : agentRuns.length}
											>
												<div className="space-y-4">
													<div className="flex items-center gap-2">
														<select
															value={selectedAgentProfileId}
															onChange={(event) => setSelectedAgentProfileId(event.target.value)}
															disabled={assigningAgent || !agentProfiles.length}
															className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
														>
															{agentProfiles.length ? agentProfiles.map((profile) => (
																<option key={profile.id} value={profile.id}>{profile.icon || ""} {profile.name}</option>
															)) : <option value="">No agents available</option>}
														</select>
														<button
															type="button"
															onClick={() => handleAssignAgent()}
															disabled={assigningAgent || !selectedAgentProfileId}
															className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:disabled:bg-gray-700"
														>
															{assigningAgent ? <Loader className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
															Assign
														</button>
													</div>

													{isLoadingAgentRuns ? (
														<div className="flex items-center justify-center py-6"><Loader className="h-5 w-5 animate-spin text-gray-400" /></div>
													) : latestAgentRun ? (
														<>
														<div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
															<div className="flex items-start justify-between gap-3">
																<div className="min-w-0">
																	<div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
																		<span>{latestAgentRun.profile?.icon || ""}</span>
																		<span>{latestAgentRun.profile?.name || "Agent"}</span>
																		<span className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">{latestAgentRun.status}</span>
																	</div>
																	<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{latestAgentRun.lastEventLabel || "Queued"}</p>
																</div>
																<div className="flex items-center gap-1">
																	{latestAgentRun.sessionId && (
																		<a href={"/agents/" + latestAgentRun.sessionId} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Open session">
																			<ExternalLink className="h-4 w-4" />
																		</a>
																	)}
																	{latestAgentRun.status === "failed" && (
																		<button type="button" onClick={() => handleAssignAgent(latestAgentRun.profileId)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Retry">
																			<RotateCcw className="h-4 w-4" />
																		</button>
																	)}
																</div>
															</div>
															{latestAgentRun.summary && <p className="mt-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{latestAgentRun.summary}</p>}
															{latestAgentRun.error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{latestAgentRun.error}</p>}
														</div>
														{agentRuns.length > 1 && (
															<div className="space-y-2">
																<p className="text-xs font-medium uppercase tracking-wide text-gray-400">Previous Runs</p>
																{agentRuns.slice(1, 5).map((run) => (
																	<div key={run.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
																		<span className="truncate text-gray-600 dark:text-gray-300">{run.profile?.name || "Agent"} · {run.status}</span>
																		{run.sessionId && (
																			<a href={"/agents/" + run.sessionId} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
																				<ExternalLink className="h-3.5 w-3.5" />
																			</a>
																		)}
																	</div>
																))}
															</div>
														)}
														</>
													) : (
														<div className="rounded-lg border border-dashed border-gray-200 p-5 text-center dark:border-gray-700">
															<Bot className="mx-auto mb-2 h-6 w-6 text-gray-400" />
															<p className="text-sm text-gray-500 dark:text-gray-400">No agent has worked on this task yet.</p>
														</div>
													)}
												</div>
											</CollapsibleSection>
										</div>
									</div>
								</div>
								{/* Right Column - Sidebar */}
								<div className="w-80 min-w-0 border-l border-gray-150 dark:border-gray-750 midnight:border-gray-850 bg-gray-50/80 dark:bg-gray-900/60 midnight:bg-gray-950/80 overflow-y-auto overflow-x-hidden backdrop-blur-sm">
									<div className="p-6 space-y-7 min-w-0">
										{/* Status */}
										<div className="space-y-4">
											<h4 className="text-sm font-semibold text-gray-800 dark:text-gray-300 midnight:text-gray-200 tracking-wide">
												Status
											</h4>

											{/* Interactive Column Badge */}
											{(() => {
												let currentColumnId =
													localCard.columnId;
												let currentColumn =
													columns.find(
														(col) =>
															col.id ===
															currentColumnId
													);

												if (!currentColumn) {
													for (const column of columns) {
														const foundCard =
															column.Cards?.find(
																(card) =>
																	String(
																		card.id
																	) ===
																	String(
																		localCard.id
																	)
															);
														if (foundCard) {
															currentColumn =
																column;
															currentColumnId =
																column.id;
															break;
														}
													}
												}

												return currentColumn ? (
													<div>
														<InteractiveStatusBadge
															columnId={
																currentColumnId
															}
															columnTitle={
																currentColumn.title
															}
															isCompletionColumn={
																currentColumn.isCompletionColumn
															}
															cardId={
																localCard.id
															}
															columns={columns}
															
														/>
													</div>
												) : null;
											})()}

											{/* Progress */}
											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-300">
														Progress
													</span>
													<span className="text-sm font-medium text-gray-900 dark:text-gray-400 midnight:text-gray-300">
														{localCard.progress ||
															0}
														%
													</span>
												</div>
												<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full overflow-hidden">
													<div
														className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 midnight:from-blue-300 midnight:to-blue-400 rounded-full transition-all duration-500 ease-out"
														style={{
															width: `${
																localCard.progress ||
																0
															}%`,
														}}
													/>
												</div>
											</div>

										</div>

										{/* Dates */}
										<div className="space-y-4">
											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-2">
													<CalendarDays className="w-4 h-4 inline mr-2" />
													Start Date
												</label>
												<CustomDatePicker
													name="startDate"
													value={(() => {
														try {
															return localCard.startDate
																? new Date(
																		localCard.startDate
																  )
																		.toISOString()
																		.split(
																			"T"
																		)[0]
																: "";
														} catch {
															return "";
														}
													})()}
													onChange={handleChange}
													disabled={
														isSubmitting
													}
												/>
											</div>

											<div>
												<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-2">
													<Calendar className="w-4 h-4 inline mr-2" />
													Due Date
												</label>
												<CustomDatePicker
													name="dueDate"
													value={(() => {
														try {
															return localCard.dueDate
																? new Date(
																		localCard.dueDate
																  )
																		.toISOString()
																		.split(
																			"T"
																		)[0]
																: "";
														} catch {
															return "";
														}
													})()}
													onChange={handleChange}
													disabled={
														isSubmitting
													}
												/>
												{dueStatus && (
													<div
														className={`mt-2 text-xs px-2 py-1 rounded ${dueStatus.bg} ${dueStatus.color}`}
													>
														{dueStatus.status ===
															"overdue" &&
															"Overdue"}
														{dueStatus.status ===
															"today" &&
															"Due today"}
														{dueStatus.status ===
															"soon" &&
															"Due soon"}
														{dueStatus.status ===
															"future" &&
															"Upcoming"}
													</div>
												)}
											</div>
										</div>

										{/* Priority */}
										<div>
											<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-2">
												Priority
											</label>
											<DropdownBar
												value={localCard.priority || ""}
												onChange={(value) => {
													
													const updates = {
														priority: value,
													};
													setLocalCard((prev) => ({
														...prev,
														...updates,
													}));
													handleOptimisticUpdate(
														updates
													);
												}}
												options={[
													{
														value: "High",
														label: "High",
													},
													{
														value: "Medium",
														label: "Medium",
													},
													{
														value: "Low",
														label: "Low",
													},
												]}
												type="priority"
												placeholder="Select priority..."
												
											/>
											{localCard.priority && (
												<div className="mt-2 text-xs">
													<span
														className={`font-medium ${getPriorityColor()}`}
													>
														{localCard.priority}{" "}
														Priority
													</span>
												</div>
											)}
										</div>

									</div>
							</div>
						</div>
							{/* Optimistic update overlay for main content area */}
						{hasUnsavedChanges && (
							<div className="absolute top-4 right-4 bg-orange-100 dark:bg-orange-900/20 midnight:bg-orange-950/20 px-3 py-1 rounded-full">
								<span className="text-xs font-medium text-orange-700 dark:text-orange-400 midnight:text-orange-400">
									Changes pending...
								</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default CardDetailModal;
