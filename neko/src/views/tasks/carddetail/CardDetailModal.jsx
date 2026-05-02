import {
	useState,
	useEffect,
	useCallback,
	useRef,
} from "react";

const getProfilePicture = (profilePicId) => {
	if (!profilePicId) return null;
	const baseUrl = import.meta.env?.VITE_API_URL || '';
	return profilePicId.startsWith('http') 
		? profilePicId 
		: `${baseUrl}/api/files/${profilePicId}`;
};
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
 	X,
 	Paperclip,
 	Timer,
 	Calendar,
 	CalendarDays,
 	Lock,
 	Eye,
 	Edit3,
 	Link2,
 	Plus,
 	Search,
 	Columns3,
 	ArrowLeft,
 	ArrowRight,
 	Loader,
 	Link2Off,
	Network,
} from "lucide-react";
import { useCardActions } from "../../hooks/useCardActions";
import { useColumnContext } from "../../context/ColumnContext";
import { useCardContext } from "../../context/CardContext";
import viewsApi from "../../viewsApi";

// Import needed components
import CardSubtasksSection from "../subtask/CardSubtasksSection";
import CardAttachmentsSection from "../attachments/CardAttachmentsSection";
import CardTimeTracking from "../time/CardTimeTracking";

import { InteractiveStatusBadge } from "../../list/ListViewCard";
import CustomDatePicker from "../../kanban/features/shared/components/CustomDatePicker";
import DropdownBar from "../../kanban/features/shared/components/DropdownBar";

// Get all cards helper function
const getAllCards = (columns) => {
	return columns.flatMap((column) =>
		Array.isArray(column.Cards)
			? column.Cards.map((card) => ({
					...card,
					columnId: column.id,
					Column: {
						id: column.id,
						title: column.title,
						isCompletionColumn: column.isCompletionColumn,
					},
			  }))
			: []
	);
};

// Duration Display Component
const DurationDisplay = ({
	duration,
	timeSpent = 0,
	showTimeSpent = false,
	className = "",
	compact = false,
}) => {
	const formatDuration = (minutes) => {
		if (!minutes || minutes === 0) return null;

		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;

		if (compact) {
			if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
			if (hours > 0) return `${hours}h`;
			return `${mins}m`;
		} else {
			const parts = [];
			if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
			if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
			return parts.join(" ");
		}
	};

	const formatTimeSpent = (seconds) => {
		if (!seconds || seconds === 0) return null;

		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);

		if (compact) {
			if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
			if (hours > 0) return `${hours}h`;
			return `${mins}m`;
		} else {
			const parts = [];
			if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
			if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
			return parts.join(" ");
		}
	};

	const estimatedText = formatDuration(duration);
	const spentText = formatTimeSpent(timeSpent);

	if (!estimatedText && (!showTimeSpent || !spentText)) {
		return null;
	}

	const progress =
		duration && timeSpent
			? Math.min((timeSpent / 60 / duration) * 100, 100)
			: null;
	const isOvertime = duration && timeSpent && timeSpent / 60 > duration;

	return (
		<div className={`flex items-center space-x-2 ${className}`}>
			<Clock
				className={`w-4 h-4 ${
					isOvertime ? "text-red-500" : "text-gray-400"
				}`}
			/>

			<div
				className={`flex items-center space-x-2 text-sm ${
					isOvertime
						? "text-red-600"
						: "text-gray-600 dark:text-gray-400 midnight:text-gray-300"
				}`}
			>
				{estimatedText && <span>{estimatedText}</span>}

				{showTimeSpent && spentText && (
					<>
						<span className="text-gray-400">/</span>
						<span
							className={
								isOvertime
									? "text-red-600 font-medium"
									: "text-gray-900 dark:text-gray-400 midnight:text-gray-300"
							}
						>
							{spentText}
						</span>
					</>
				)}
			</div>
		</div>
	);
};

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
	// New props for real-time features (with fallbacks for backward compatibility)
	readOnly = false,
	editingUser = null,
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

	const [currentUser, setCurrentUser] = useState(null);

	// FREEZE initial card data to prevent external prop changes from affecting modal state
	const frozenInitialCard = useRef(null);
	if (!frozenInitialCard.current) {
		frozenInitialCard.current = { ...initialCard };
	}

	// Section expansion states
	const [expandedSections, setExpandedSections] = useState({
		subtasks: true,
		attachments: false,
		dependencies: false,
		dependentTasks: false,
		timeTracking: false,
	});

	const allCards = getAllCards(columns);

	// Initialize from FROZEN card data to prevent external prop updates
	const [localCard, setLocalCard] = useState({
		...frozenInitialCard.current,
		tasks: frozenInitialCard.current.tasks || { completed: 0, total: 0 },
		checklist: frozenInitialCard.current.checklist || [],
		files: [], // attachments disabled
		attachments: frozenInitialCard.current.attachments || [],
		timeSpent: frozenInitialCard.current.timeSpent || 0,
		startDate: frozenInitialCard.current.startDate || null,
		dueDate: frozenInitialCard.current.dueDate || null,
		predictedMinutes: frozenInitialCard.current.predictedMinutes || null,
	});

	const { setSelectedCard } = useCardContext();
	const [fileError, setFileError] = useState(null);

	// Dependencies state
	const [dependencies, setDependencies] = useState([]);
	const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
	const [activeDependencyType, setActiveDependencyType] = useState(null);
	const [dependencySearch, setDependencySearch] = useState("");
	const [selectedLagTime, setSelectedLagTime] = useState(0);
	const [addingDependencyCardId, setAddingDependencyCardId] = useState(null);

	// Dependent cards state (cards that depend on this card)
	const [dependentCards, setDependentCards] = useState([]);
	const [isLoadingDependents, setIsLoadingDependents] = useState(false);

	useEffect(() => {
		setIsEntering(false);
	}, []);

	// Track editing session for real-time features
	useEffect(() => {
		if (!readOnly) {
			editingStartTimeRef.current = Date.now();
			setIsLocallyEditing(true);
		}
	}, [readOnly]);

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

	// Handle optimistic updates for real-time features
	const handleOptimisticUpdate = (updates) => {
		if (readOnly) return;

		setHasUnsavedChanges(true);
		if (onOptimisticUpdate) {
			onOptimisticUpdate(localCard.id, updates);
		}
	};

	// Calculate editing duration
	const getEditingDuration = () => {
		if (!editingUser?.startedAt) return "";

		const startTime = new Date(editingUser.startedAt);
		const now = new Date();
		const diffMinutes = Math.floor((now - startTime) / (1000 * 60));

		if (diffMinutes < 1) return "just started";
		if (diffMinutes === 1) return "1 minute";
		return `${diffMinutes} minutes`;
	};

	// Editing user info component
	const EditingUserInfo = ({ user }) => {
		const profilePic = getProfilePicture(user.profilePicture);

		return (
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-full border-2 border-blue-200 dark:border-blue-700 midnight:border-blue-800 overflow-hidden">
					{profilePic ? (
						<img
							src={profilePic}
							alt={user.userName}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full bg-blue-100 dark:bg-blue-900 midnight:bg-blue-900 text-blue-600 dark:text-blue-300 midnight:text-blue-300 flex items-center justify-center text-sm font-medium">
							{user.userName.charAt(0).toUpperCase()}
						</div>
					)}
				</div>
				<div>
					<div className="font-medium text-blue-700 dark:text-blue-400 midnight:text-blue-400">
						{user.userName}
					</div>
					<div className="text-xs text-blue-600 dark:text-blue-500 midnight:text-blue-500">
						Editing for {getEditingDuration()}
					</div>
				</div>
			</div>
		);
	};

	// Memoize the current user fetch to prevent duplicate calls
	const fetchCurrentUser = useCallback(async () => {
		try {
			const userData = await viewsApi.user.getCurrentUser();
			setCurrentUser(userData.data);
		} catch (error) {}
	}, []);

	useEffect(() => {
		fetchCurrentUser();
	}, [fetchCurrentUser]);

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
				timeSpent: localCard.timeSpent,
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

	// Load dependencies when modal opens or when dependencies are updated
	useEffect(() => {
		const loadDependencies = async () => {
			if (!localCard?.id) return;

			setIsLoadingDependencies(true);
			try {
				const deps = await viewsApi.dependency.getDependencies(localCard.id);
				setDependencies(Array.isArray(deps) ? deps : []);
			} catch (error) {
				console.error("Error loading dependencies:", error);
				setDependencies([]);
			} finally {
				setIsLoadingDependencies(false);
			}
		};

		loadDependencies();
	}, [localCard?.id, initialCard?.dependenciesUpdated]);

	// Load dependent cards (cards that depend on this card) when modal opens or when dependencies are updated
	useEffect(() => {
		const loadDependentCards = async () => {
			if (!localCard?.id) return;

			setIsLoadingDependents(true);
			try {
				const dependents = await viewsApi.dependency.getDependentCards(localCard.id);
				setDependentCards(Array.isArray(dependents) ? dependents : []);
			} catch (error) {
				console.error("Error loading dependent cards:", error);
				setDependentCards([]);
			} finally {
				setIsLoadingDependents(false);
			}
		};

		loadDependentCards();
	}, [localCard?.id, initialCard?.dependenciesUpdated]);

	// Helper function to check if adding a dependency would create a circular dependency
	const wouldCreateCircularDependency = useCallback((targetCardId) => {
		// Check if localCard can reach targetCard through existing dependencies
		// If yes, then adding targetCard -> localCard would create a cycle
		const visited = new Set();

		const canReach = (currentCardId, targetId) => {
			if (currentCardId === targetId) return true;
			if (visited.has(currentCardId)) return false;

			visited.add(currentCardId);

			// Get all dependencies of the current card
			const cardDeps = dependencies.filter(d => d.sourceCardId === currentCardId);

			// Recursively check each dependency
			for (const dep of cardDeps) {
				if (canReach(dep.targetCardId, targetId)) {
					return true;
				}
			}

			return false;
		};

		return canReach(localCard?.id, targetCardId);
	}, [localCard?.id, dependencies]);

	// Dependency handlers
	const handleAddDependency = async (targetCard, dependencyType) => {
		if (!localCard?.id || !targetCard?.id) return;

		try {
			setAddingDependencyCardId(targetCard.id);
			setSaveStatus("saving");
			await viewsApi.dependency.addDependency(
				localCard.id,
				targetCard.id,
				dependencyType,
				selectedLagTime
			);

			// Reload dependencies
			const updatedDeps = await viewsApi.dependency.getDependencies(localCard.id);
			setDependencies(Array.isArray(updatedDeps) ? updatedDeps : []);

			// Reset view
			setActiveDependencyType(null);
			setDependencySearch("");

			setSaveStatus("saved");
			setTimeout(() => setSaveStatus(null), 2000);
		} catch (error) {
			console.error("Error adding dependency:", error);
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
		} finally {
			setAddingDependencyCardId(null);
		}
	};

	const handleRemoveDependency = async (targetCardId) => {
		if (!localCard?.id) return;

		try {
			setSaveStatus("saving");
			await viewsApi.dependency.removeDependency(localCard.id, targetCardId);

			// Update local state
			setDependencies(deps => deps.filter(d => d.targetCardId !== targetCardId));

			setSaveStatus("saved");
			setTimeout(() => setSaveStatus(null), 2000);
		} catch (error) {
			console.error("Error removing dependency:", error);
			setSaveStatus("error");
			setTimeout(() => setSaveStatus(null), 2000);
		}
	};

	const getDependencyTypeStyle = (type) => {
		const styles = {
			FS: {
				bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
				text: "text-blue-700 dark:text-blue-400 midnight:text-blue-400",
				border: "border-blue-200 dark:border-blue-700 midnight:border-blue-800",
				activeBg: "bg-blue-100 dark:bg-blue-800/30 midnight:bg-blue-800/20",
				icon: "text-blue-600 dark:text-blue-400 midnight:text-blue-400",
				hoverBg: "hover:bg-blue-100 dark:hover:bg-blue-900/30 midnight:hover:bg-blue-900/20",
			},
			SS: {
				bg: "bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10",
				text: "text-green-700 dark:text-green-400 midnight:text-green-400",
				border: "border-green-200 dark:border-green-700 midnight:border-green-800",
				activeBg: "bg-green-100 dark:bg-green-800/30 midnight:bg-green-800/20",
				icon: "text-green-600 dark:text-green-400 midnight:text-green-400",
				hoverBg: "hover:bg-green-100 dark:hover:bg-green-900/30 midnight:hover:bg-green-900/20",
			},
			FF: {
				bg: "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/10",
				text: "text-purple-700 dark:text-purple-400 midnight:text-purple-400",
				border: "border-purple-200 dark:border-purple-700 midnight:border-purple-800",
				activeBg: "bg-purple-100 dark:bg-purple-800/30 midnight:bg-purple-800/20",
				icon: "text-purple-600 dark:text-purple-400 midnight:text-purple-400",
				hoverBg: "hover:bg-purple-100 dark:hover:bg-purple-900/30 midnight:hover:bg-purple-900/20",
			},
			SF: {
				bg: "bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10",
				text: "text-orange-700 dark:text-orange-400 midnight:text-orange-400",
				border: "border-orange-200 dark:border-orange-700 midnight:border-orange-800",
				activeBg: "bg-orange-100 dark:bg-orange-800/30 midnight:bg-orange-800/20",
				icon: "text-orange-600 dark:text-orange-400 midnight:text-orange-400",
				hoverBg: "hover:bg-orange-100 dark:hover:bg-orange-900/30 midnight:hover:bg-orange-900/20",
			},
		};
		return styles[type] || styles.FS;
	};

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
            ${
				readOnly
					? "border-2 border-blue-200 dark:border-blue-700 midnight:border-blue-800"
					: ""
			}
            ${isLeaving ? "scale-95 opacity-0" : "scale-100 opacity-100"}
          `}
				>
					{/* Enhanced Header */}
					<div
						className={`
            sticky top-0 z-10 px-6 py-4 bg-gradient-to-b from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95 dark:to-transparent midnight:from-gray-950 midnight:via-gray-950/95 midnight:to-transparent
            ${
				readOnly
					? "from-blue-50/50 via-blue-50/25 to-transparent dark:from-blue-900/10 dark:via-blue-900/5 dark:to-transparent midnight:from-blue-950/10 midnight:via-blue-950/5 midnight:to-transparent"
					: ""
			}
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
										disabled={readOnly}
										className="text-2xl font-semibold bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 disabled:opacity-75 flex-1 transition-colors duration-200"
										placeholder="Untitled"
									/>

									{/* Status Indicators - moved to right side */}
									<div className="flex items-center gap-1.5">
										{readOnly && editingUser && (
											<div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-950/20 rounded-md">
												<Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
												<span className="text-xs font-medium text-blue-700 dark:text-blue-400 midnight:text-blue-400">
													Being Edited
												</span>
											</div>
										)}

										{!readOnly && isLocallyEditing && (
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

								{/* Editing User Info */}
								{readOnly && editingUser && (
									<div className="flex items-center justify-between">
										<EditingUserInfo user={editingUser} />
										<div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 midnight:text-blue-400">
											<Eye className="w-4 h-4" />
											<span className="text-sm">
												Read-only mode
											</span>
										</div>
									</div>
								)}

							</div>

							{/* Action Buttons */}
							{!readOnly && (
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
							)}
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
						{readOnly && editingUser ? (
							// Read-only content with limited functionality
							<div className="p-6">
								<div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-950/10 rounded-lg border border-blue-200 dark:border-blue-800 midnight:border-blue-800">
									<div className="flex items-start gap-3">
										<Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 midnight:text-blue-400 mt-0.5" />
										<div>
											<h3 className="font-medium text-blue-900 dark:text-blue-300 midnight:text-blue-300 mb-1">
												Card is currently being edited
											</h3>
											<p className="text-sm text-blue-700 dark:text-blue-400 midnight:text-blue-400">
												<strong>
													{editingUser.userName}
												</strong>{" "}
												is currently editing this card.
												You can view the content but
												cannot make changes until they
												finish editing.
											</p>
											<p className="text-xs text-blue-600 dark:text-blue-500 midnight:text-blue-500 mt-2">
												The card will be available for
												editing once{" "}
												{editingUser.userName} closes
												their editor or after 5 minutes
												of inactivity.
											</p>
										</div>
									</div>
								</div>

								<div className="space-y-4 opacity-75">
									<div>
										<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
											{localCard.title}
										</h3>
										{localCard.description && (
											<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
												{localCard.description}
											</p>
										)}
									</div>

									{localCard.progress > 0 && (
										<div>
											<div className="flex justify-between items-center mb-2">
												<span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
													Progress
												</span>
												<span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400">
													{localCard.progress}%
												</span>
											</div>
											<div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-2 overflow-hidden">
												<div
													className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 midnight:from-blue-300 midnight:to-blue-400 h-2 rounded-full transition-all duration-500 ease-out"
													style={{
														width: `${localCard.progress}%`,
													}}
												/>
											</div>
										</div>
									)}

									<div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg text-center">
										<p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
											Full card details are not available
											while the card is being edited.
										</p>
									</div>
								</div>
							</div>
						) : (
							// Full editable content
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
												disabled={readOnly}
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
														readOnly={readOnly}
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
													readOnly={readOnly}
													isUploading={
														isUploadingFiles
													}
													onFileChange={async (e) => {
														if (readOnly) return;
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
														if (readOnly) return;
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
														if (readOnly) return;
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
												title="Dependencies"
												icon={<Link2 className="w-4 h-4 text-gray-600" />}
												isExpanded={expandedSections.dependencies}
												onToggle={() => toggleSection("dependencies")}
												count={isLoadingDependencies ? <Loader className="w-3 h-3 animate-spin" /> : dependencies.length}
											>
												{(() => {
													// Check if card has subtasks
													const hasSubtasks = localCard?.checklist && localCard.checklist.length > 0;

													if (!hasSubtasks) {
														return (
															<div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800/50">
																<div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/40 flex items-center justify-center mx-auto mb-2">
																	<Link2Off className="w-5 h-5 text-amber-500" />
																</div>
																<p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
																	No Subtasks Available
																</p>
																<p className="text-xs text-gray-500 dark:text-gray-400">
																	Add subtasks to this card before managing dependencies
																</p>
															</div>
														);
													}

													const dependencyTypes = [
														{
															value: "FS",
															label: "Finish-to-Start",
															shortLabel: "FS",
															description: "Target must finish before this starts",
														},
														{
															value: "SS",
															label: "Start-to-Start",
															shortLabel: "SS",
															description: "Target must start before this starts",
														},
														{
															value: "FF",
															label: "Finish-to-Finish",
															shortLabel: "FF",
															description: "Target must finish before this finishes",
														},
														{
															value: "SF",
															label: "Start-to-Finish",
															shortLabel: "SF",
															description: "Target must start before this finishes",
														},
													];

													const availableCards = allCards
														.filter(c =>
															c.id !== localCard.id &&
															c.title.toLowerCase().includes(dependencySearch.toLowerCase()) &&
															!wouldCreateCircularDependency(c.id)
														);

													// Card selection view
													if (activeDependencyType) {
														const style = getDependencyTypeStyle(activeDependencyType);
														const selectedType = dependencyTypes.find(t => t.value === activeDependencyType);

														return (
															<div className="space-y-3">
																{/* Back Button */}
																<div className="flex items-center space-x-2">
																	<button
																		type="button"
																		onClick={(e) => {
																			e.preventDefault();
																			e.stopPropagation();
																			setActiveDependencyType(null);
																			setDependencySearch("");
																		}}
																		className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded transition-colors"
																	>
																		<ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
																	</button>
																	<div className="flex-1">
																		<h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 flex items-center">
																			<div className={`w-6 h-6 rounded ${style.activeBg} flex items-center justify-center mr-2`}>
																				<span className={`text-xs font-bold ${style.icon}`}>
																					{selectedType.shortLabel}
																				</span>
																			</div>
																			{selectedType.label}
																		</h4>
																		<p className={`text-xs mt-0.5 ${style.text}`}>
																			{selectedType.description}
																		</p>
																	</div>
																</div>

																{/* Search Bar */}
																<div className={`p-2 rounded border ${style.border} ${style.bg}`}>
																	<div className="relative">
																		<Search className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${style.icon}`} />
																		<input
																			type="text"
																			value={dependencySearch}
																			onChange={(e) => setDependencySearch(e.target.value)}
																			placeholder="Search cards..."
																			className={`w-full pl-8 pr-2 py-1.5 text-xs rounded border ${style.border} bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-gray-100 midnight:text-indigo-200`}
																			autoFocus
																		/>
																	</div>
																</div>

																{/* Card List */}
																<div className="space-y-1.5 max-h-48 overflow-y-auto">
																	{availableCards.length === 0 ? (
																		<div className="p-6 text-center">
																			<div className={`w-12 h-12 rounded-full ${style.bg} flex items-center justify-center mx-auto mb-2`}>
																				<Search className={`w-6 h-6 ${style.icon}`} />
																			</div>
																			<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 text-xs">
																				{dependencySearch ? "No matching cards" : "No cards available"}
																			</p>
																		</div>
																	) : (
																		availableCards.map((card) => {
																			const alreadyAdded = dependencies.some(
																				d => d.targetCardId === card.id && d.type === activeDependencyType
																			);
																			return (
																				<button
																					key={card.id}
																					type="button"
																					onClick={(e) => {
																						e.preventDefault();
																						e.stopPropagation();
																						if (!alreadyAdded && !readOnly) {
																							handleAddDependency(card, activeDependencyType);
																						}
																					}}
																					disabled={alreadyAdded || readOnly}
																					className={`w-full p-2.5 rounded border transition-all text-left ${
																						alreadyAdded
																							? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border-gray-200 dark:border-gray-700 midnight:border-gray-800'
																							: `${style.border} ${style.bg} ${style.hoverBg}`
																					}`}
																				>
																					<div className="flex items-start justify-between">
																						<div className="flex-1 min-w-0">
																							<div className="text-xs font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 mb-0.5 truncate">
																								{card.title}
																							</div>
																							<div className={`text-xs ${style.text} flex items-center space-x-1.5`}>
																								<Columns3 className="w-3 h-3" />
																								<span>{columns.find(col => col.id === card.columnId)?.title || 'Unknown'}</span>
																								{alreadyAdded && (
																									<>
																										<span>•</span>
																										<span className="font-medium">Added</span>
																									</>
																								)}
																							</div>
																						</div>
																						{!alreadyAdded && (
																							addingDependencyCardId === card.id ? (
												<Loader className={`w-4 h-4 ${style.icon} flex-shrink-0 ml-2 animate-spin`} />
											) : (
												<Plus className={`w-4 h-4 ${style.icon} flex-shrink-0 ml-2`} />
											)
																						)}
																					</div>
																				</button>
																			);
																		})
																	)}
																</div>
															</div>
														);
													}

													// Main view
													return (
														<div className="space-y-3">
															{/* Loading State */}
															{isLoadingDependencies ? (
																<div className="flex items-center justify-center py-4">
																	<Loader className="w-4 h-4 animate-spin text-gray-400" />
																</div>
															) : (
																<>
																	{/* Added Dependencies List */}
																	{dependencies.length === 0 ? (
																		<div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded">
																			<div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-2">
																				<Link2 className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
																			</div>
																			<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-600">
																				No dependencies added
																			</p>
																		</div>
																	) : (
																		<div className="space-y-1.5">
																			{dependencies.map((dep) => {
																				const style = getDependencyTypeStyle(dep.type);
																				const targetCard = allCards.find(c => c.id === dep.targetCardId);

																				return (
																					<div
																						key={dep.id}
																						className={`p-2.5 rounded border ${style.border} ${style.bg} flex items-start justify-between`}
																					>
																						<div className="flex items-start space-x-2 flex-1 min-w-0">
																							<div className={`w-7 h-7 rounded ${style.activeBg} flex items-center justify-center flex-shrink-0`}>
																								<span className={`text-xs font-bold ${style.icon}`}>
																									{dep.type}
																								</span>
																							</div>
																							<div className="flex-1 min-w-0">
																								<div className="text-xs font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 mb-0.5 truncate">
																									{targetCard?.title || 'Unknown Card'}
																								</div>
																								<div className={`text-xs ${style.text} flex items-center flex-wrap gap-1.5`}>
																									<span className="flex items-center space-x-1">
																										<Columns3 className="w-3 h-3" />
																										<span>{columns.find(col => col.id === targetCard?.columnId)?.title || 'Unknown'}</span>
																									</span>
																									{dep.lag > 0 && (
																										<>
																											<span>•</span>
																											<span className="flex items-center space-x-1">
																												<Clock className="w-3 h-3" />
																												<span>{dep.lag}h lag</span>
																											</span>
																										</>
																									)}
																								</div>
																							</div>
																						</div>
																						{!readOnly && (
																							<button
																								type="button"
																								onClick={() => handleRemoveDependency(dep.targetCardId)}
																								className="p-1 text-red-500 hover:text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/10 rounded transition-colors ml-2 flex-shrink-0"
																							>
																								<X className="w-3.5 h-3.5" />
																							</button>
																						)}
																					</div>
																				);
																			})}
																		</div>
																	)}

																	{!readOnly && (
																		<>
																			{/* Separator */}
																			{dependencies.length > 0 && (
																				<div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>
																			)}

																			{/* Dependency Type Buttons */}
																			<div className="space-y-1.5">
																				<h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 mb-2">
																					Add New Dependency
																				</h4>
																				{dependencyTypes.map((type) => {
																					const style = getDependencyTypeStyle(type.value);
																					const typeDependencies = dependencies.filter(d => d.type === type.value);

																					return (
																						<button
																							key={type.value}
																							type="button"
																							onClick={(e) => {
																								e.preventDefault();
																								e.stopPropagation();
																								setActiveDependencyType(type.value);
																							}}
																							className={`w-full p-2.5 rounded border transition-all text-left ${style.border} ${style.bg} ${style.hoverBg}`}
																						>
																							<div className="flex items-center justify-between">
																								<div className="flex items-center space-x-2">
																									<div className={`w-7 h-7 rounded ${style.activeBg} flex items-center justify-center flex-shrink-0`}>
																										<span className={`text-xs font-bold ${style.icon}`}>
																											{type.shortLabel}
																										</span>
																									</div>
																									<div>
																										<div className={`text-xs font-semibold ${style.text} mb-0.5`}>
																											{type.label}
																										</div>
																										<div className={`text-xs ${style.text}`}>
																											{type.description}
																										</div>
																									</div>
																								</div>
																								<div className="flex items-center space-x-2">
																									{typeDependencies.length > 0 && (
																										<span className={`px-1.5 py-0.5 text-xs font-medium rounded ${style.activeBg} ${style.text}`}>
																											{typeDependencies.length}
																										</span>
																									)}
																									<ArrowRight className={`w-4 h-4 ${style.icon} flex-shrink-0`} />
																								</div>
																							</div>
																						</button>
																					);
																				})}
																			</div>

																			{/* Lag Time Configuration */}
																			<div className="p-2.5 bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded mt-4">
																				<label className="block text-xs font-medium mb-2 text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center">
																					<Clock className="w-3.5 h-3.5 mr-1.5" />
																					Lag Time for New Dependencies
																				</label>
																				<div className="relative">
																					<input
																						type="number"
																						value={selectedLagTime}
																						onChange={(e) => setSelectedLagTime(Math.max(0, parseFloat(e.target.value) || 0))}
																						min="0"
																						step="0.5"
																						className="w-full pl-2 pr-20 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-indigo-200
																						[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
																					/>
																					<div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
																						<span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
																							hours
																						</span>
																						<div className="flex flex-col">
																							<button
																								type="button"
																								onClick={() => setSelectedLagTime(prev => Math.max(0, (parseFloat(prev) || 0) + 0.5))}
																								className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 transition-colors rounded-t"
																							>
																								<ChevronUp className="w-3 h-3" />
																							</button>
																							<button
																								type="button"
																								onClick={() => setSelectedLagTime(prev => Math.max(0, (parseFloat(prev) || 0) - 0.5))}
																								className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 transition-colors rounded-b"
																							>
																								<ChevronDown className="w-3 h-3" />
																							</button>
																						</div>
																					</div>
																				</div>
																				<p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
																					Delay applied to new dependencies
																				</p>
																			</div>
																		</>
																	)}
																</>
															)}
														</div>
													);
												})()}
											</CollapsibleSection>

											<CollapsibleSection
												title="Dependent Tasks"
												icon={<Network className="w-4 h-4 text-gray-600" />}
												isExpanded={expandedSections.dependentTasks}
												onToggle={() => toggleSection("dependentTasks")}
												count={isLoadingDependents ? <Loader className="w-3 h-3 animate-spin" /> : dependentCards.length}
											>
												<div className="space-y-3">
													{isLoadingDependents ? (
														<div className="flex items-center justify-center py-8">
															<Loader className="w-5 h-5 animate-spin text-gray-400" />
														</div>
													) : dependentCards.length === 0 ? (
														<div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800/50">
															<div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/40 flex items-center justify-center mx-auto mb-2">
																<Network className="w-5 h-5 text-blue-500" />
															</div>
															<p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
																No Dependent Tasks
															</p>
															<p className="text-xs text-gray-500 dark:text-gray-400">
																No other tasks are waiting on this one
															</p>
														</div>
													) : (
														<>
															<div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
																These tasks are waiting for this task to be completed
															</div>
															<div className="space-y-2">
																{dependentCards.map((dependent) => {
																	const dependencyType = dependent.type || "FS";
																	const style = getDependencyTypeStyle(dependencyType);

																	// Find the actual card that depends on this one
																	const sourceCard = allCards.find(c => c.id === dependent.sourceCardId);
																	const sourceColumn = columns.find(col => col.id === sourceCard?.columnId);

																	return (
																		<div
																			key={dependent.id || dependent.sourceCardId}
																			className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
																		>
																			<div className="flex items-center space-x-3 flex-1 min-w-0">
																				<div className={`w-7 h-7 rounded ${style.activeBg} flex items-center justify-center flex-shrink-0`}>
																					<span className={`text-xs font-bold ${style.icon}`}>
																						{dependencyType}
																					</span>
																				</div>
																				<div className="flex-1 min-w-0">
																					<p className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-100 truncate">
																						{sourceCard?.title || "Unknown Task"}
																					</p>
																					<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
																						{sourceColumn?.title || "Unknown Column"}
																					</p>
																				</div>
																			</div>
																			{dependent.lag !== 0 && (
																				<div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-2">
																					<Clock className="w-3 h-3 mr-1" />
																					{dependent.lag > 0 ? `+${dependent.lag}d` : `${dependent.lag}d`}
																				</div>
																			)}
																		</div>
																	);
																})}
															</div>
														</>
													)}
												</div>
											</CollapsibleSection>

											<CollapsibleSection
												title="Time Tracking"
												icon={
													<Timer className="w-4 h-4 text-gray-600" />
												}
												isExpanded={
													expandedSections.timeTracking
												}
												onToggle={() =>
													toggleSection(
														"timeTracking"
													)
												}
												summary={
													localCard.timeSpent > 0
														? `${Math.floor(
																localCard.timeSpent /
																	3600
														  )}h ${Math.floor(
																(localCard.timeSpent %
																	3600) /
																	60
														  )}m logged`
														: null
												}
											>
												<CardTimeTracking
													card={localCard}
													readOnly={readOnly}
													onCardUpdated={(
														updatedCard
													) => {
														if (readOnly) return;
														setLocalCard(
															(prev) => ({
																...prev,
																...updatedCard,
															})
														);
													}}
												/>
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
															disabled={readOnly}
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

											{/* Time Tracking Summary */}
											<div className="space-y-2">
												<span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-300">
													Time Spent:
												</span>
												<DurationDisplay
													duration={
														localCard.predictedMinutes
													}
													timeSpent={
														localCard.timeSpent
													}
													showTimeSpent={
														localCard.timeSpent > 0
													}
												/>
												{!localCard.predictedMinutes && (
													<span className="text-sm text-gray-600 dark:text-gray-500 midnight:text-gray-400">
														No time tracked
													</span>
												)}
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
														isSubmitting || readOnly
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
														isSubmitting || readOnly
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
													if (readOnly) return;
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
												disabled={readOnly}
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
					)}

						{/* Optimistic update overlay for main content area */}
						{hasUnsavedChanges && !readOnly && (
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
