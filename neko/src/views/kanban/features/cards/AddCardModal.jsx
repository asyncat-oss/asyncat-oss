import { useState, useEffect, useRef } from "react";
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
	UserPlus,
	User,
	CheckCircle,
	Paperclip,
	Siren,
	Disc3Icon,
	LifeBuoy,
	Upload,
	Plus,
	Columns3,
	Link2,
	Clock,
	Search,
	ChevronUp,
	ChevronDown,
	Link2Off,
} from "lucide-react";
import { useColumnContext } from "../../../context/ColumnContext";
import { useCardContext } from "../../../context/CardContext";
import { useCardActions } from "../../../hooks/useCardActions";
import TaskChecklist from "../shared/components/TaskChecklist";
import DropdownBar from "../shared/components/DropdownBar";
import viewsApi from "../../../viewsApi";
import CustomDatePicker from "../shared/components/CustomDatePicker";
import AddColumnModal from "../columns/components/AddColumnModal";

import catDP from "../../../../assets/dp/CAT.webp";
import dogDP from "../../../../assets/dp/DOG.webp";
import dolphinDP from "../../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../../assets/dp/FOX.webp";
import lionDP from "../../../../assets/dp/LION.webp";
import owlDP from "../../../../assets/dp/OWL.webp";
import penguinDP from "../../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../../assets/dp/WOLF.webp";

const profilePictureMap = {
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

const getProfilePicture = (profilePicId) => {
	if (!profilePicId) return null;

	if (profilePicId.startsWith("https://")) {
		return profilePicId;
	}

	if (profilePictureMap[profilePicId]) {
		return profilePictureMap[profilePicId];
	}
	return null;
};

const getMemberInitial = (member) => {
	if (!member) return "U";

	const name = member.name || "";
	if (name) return name.charAt(0).toUpperCase();

	const email = member.email || "";
	if (email) return email.charAt(0).toUpperCase();

	return "U";
};

const AdministratorAvatar = ({ member, size = "medium" }) => {
	const [imageLoadError, setImageLoadError] = useState(false);

	if (!member) return null;

	const sizeClasses =
		size === "small"
			? "w-4 h-4"
			: size === "medium"
			? "w-6 h-6"
			: "w-8 h-8";
	const profilePicture = getProfilePicture(member.profile_picture);

	const handleImageError = () => setImageLoadError(true);
	const handleImageLoad = () => setImageLoadError(false);

	return (
		<div
			className={`${sizeClasses} rounded-full border-2 border-gray-200 dark:border-gray-700 midnight:border-gray-800 
        flex items-center justify-center overflow-hidden transition-transform duration-200 hover:scale-110`}
			title={member.name || member.email || "Administrator"}
		>
			{profilePicture && !imageLoadError ? (
				<img
					src={profilePicture}
					alt={member.name || member.email || "Administrator"}
					className="w-full h-full object-cover"
					onError={handleImageError}
					onLoad={handleImageLoad}
				/>
			) : (
				<div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-medium text-xs">
					{getMemberInitial(member)}
				</div>
			)}
		</div>
	);
};

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

	// Add this ref at the top with other refs
	const administratorSelectorRef = useRef(null);

	// Add this useEffect
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (
				administratorSelectorRef.current &&
				!administratorSelectorRef.current.contains(event.target)
			) {
				setShowAddAdministrator(false);
				setAdministratorSearch("");
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const [cardData, setCardData] = useState({
		title: "",
		description: "",
		priority: "Medium",
		columnId:
			defaultColumnId &&
			!columns.find((col) => col.id === defaultColumnId)
				?.isCompletionColumn
				? defaultColumnId
				: columns.find((col) => !col.isCompletionColumn)?.id || "",
		startDate: new Date().toISOString().split("T")[0],
		dueDate: new Date().toISOString().split("T")[0],
		//duration: null,
		comments: [],
		progress: 0,
		checklist: [],
		tasks: { completed: 0, total: 0 },
		administrator_id: null,
		createdBy: createdBy,
	});

	const [projectMembers, setProjectMembers] = useState([]);
	const [isLoadingMembers, setIsLoadingMembers] = useState(false);
	const [showAddAdministrator, setShowAddAdministrator] = useState(false);
	const [administratorSearch, setAdministratorSearch] = useState("");

	const [fileError, setFileError] = useState(null);
	const [selectedFiles, setSelectedFiles] = useState([]);

	// Dependencies state
	const [dependencies, setDependencies] = useState([]);
	const [activeDependencyType, setActiveDependencyType] = useState(null); // Which dependency type is being edited
	const [dependencySearch, setDependencySearch] = useState("");
	const [selectedLagTime, setSelectedLagTime] = useState(0);

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

	const getAdministrator = () => {
		if (!cardData.administrator_id) return null;
		const administratorId =
			typeof cardData.administrator_id === "string"
				? cardData.administrator_id
				: cardData.administrator_id?.id;
		const member = projectMembers.find(
			(member) => member.id === administratorId
		);
		return (
			member || {
				id: administratorId,
				name: `User ${administratorId?.slice(0, 5) || "Unknown"}`,
				email: "No email available",
			}
		);
	};

	const administrator = getAdministrator();

	const availableMembers = projectMembers.filter(
		(member) =>
			member.name
				.toLowerCase()
				.includes(administratorSearch.toLowerCase()) &&
			member.id !== administrator?.id
	);

	const handleAddAdministrator = (member) => {
		setCardData((prev) => ({
			...prev,
			administrator_id: member.id,
		}));
		setShowAddAdministrator(false);
		setAdministratorSearch("");
	};

	const handleRemoveAdministrator = () => {
		setCardData((prev) => ({
			...prev,
			administrator_id: null,
		}));
	};

	const resetAdministratorState = () => {
		setShowAddAdministrator(false);
		setAdministratorSearch("");
	};

	// Dependency handlers
	const handleAddDependency = (targetCard, type) => {
		// Check if dependency already exists
		if (dependencies.some(dep => dep.targetCardId === targetCard.id && dep.type === type)) {
			return;
		}

		const newDependency = {
			targetCardId: targetCard.id,
			targetCardTitle: targetCard.title,
			targetCardColumn: columns.find(col => col.id === targetCard.columnId)?.title || "Unknown",
			type: type,
			lag: parseFloat(selectedLagTime) || 0,
		};

		setDependencies([...dependencies, newDependency]);
		setActiveDependencyType(null);
		setDependencySearch("");
		setSelectedLagTime(0);
	};

	const handleRemoveDependency = (targetCardId, type) => {
		setDependencies(dependencies.filter(dep => !(dep.targetCardId === targetCardId && dep.type === type)));
	};

	const resetDependencyState = () => {
		setActiveDependencyType(null);
		setDependencySearch("");
		setSelectedLagTime(0);
	};

	// Get all available cards for dependency selection
	const getAvailableCards = () => {
		const allCards = [];
		columns.forEach(column => {
			// Check both Cards (capital C from backend) and cards (lowercase)
			const columnCards = column.Cards || column.cards || [];
			if (Array.isArray(columnCards)) {
				columnCards.forEach(card => {
					allCards.push({
						...card,
						columnTitle: column.title,
					});
				});
			}
		});
		return allCards;
	};

	const availableCards = getAvailableCards().filter(card =>
		card.title.toLowerCase().includes(dependencySearch.toLowerCase())
	);

	// Get dependency type styling
	const getDependencyTypeStyle = (type) => {
		const styles = {
			FS: {
				bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
				border: "border-blue-200 dark:border-blue-800 midnight:border-blue-700",
				text: "text-blue-700 dark:text-blue-400 midnight:text-blue-400",
				hoverBg: "hover:bg-blue-100 dark:hover:bg-blue-900/30 midnight:hover:bg-blue-900/20",
				activeBg: "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/30",
				icon: "text-blue-600 dark:text-blue-500 midnight:text-blue-500",
			},
			SS: {
				bg: "bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10",
				border: "border-green-200 dark:border-green-800 midnight:border-green-700",
				text: "text-green-700 dark:text-green-400 midnight:text-green-400",
				hoverBg: "hover:bg-green-100 dark:hover:bg-green-900/30 midnight:hover:bg-green-900/20",
				activeBg: "bg-green-100 dark:bg-green-900/40 midnight:bg-green-900/30",
				icon: "text-green-600 dark:text-green-500 midnight:text-green-500",
			},
			FF: {
				bg: "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/10",
				border: "border-purple-200 dark:border-purple-800 midnight:border-purple-700",
				text: "text-purple-700 dark:text-purple-400 midnight:text-purple-400",
				hoverBg: "hover:bg-purple-100 dark:hover:bg-purple-900/30 midnight:hover:bg-purple-900/20",
				activeBg: "bg-purple-100 dark:bg-purple-900/40 midnight:bg-purple-900/30",
				icon: "text-purple-600 dark:text-purple-500 midnight:text-purple-500",
			},
			SF: {
				bg: "bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10",
				border: "border-orange-200 dark:border-orange-800 midnight:border-orange-700",
				text: "text-orange-700 dark:text-orange-400 midnight:text-orange-400",
				hoverBg: "hover:bg-orange-100 dark:hover:bg-orange-900/30 midnight:hover:bg-orange-900/20",
				activeBg: "bg-orange-100 dark:bg-orange-900/40 midnight:bg-orange-900/30",
				icon: "text-orange-600 dark:text-orange-500 midnight:text-orange-500",
			},
		};
		return styles[type] || styles.FS;
	};

	// Priority options for dropdown
	const priorityOptions = [
		{ value: "High", label: "High" },
		{ value: "Medium", label: "Medium" },
		{ value: "Low", label: "Low" },
	];

	const columnOptions = columns
		.filter((column) => !column.isCompletionColumn)
		.map((column) => ({
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

			// Create dependencies if any were added
			if (dependencies.length > 0 && createdCard?.id) {
				const dependencyPromises = dependencies.map((dep) =>
					viewsApi.dependency.addDependency(
						createdCard.id,
						dep.targetCardId,
						dep.type,
						dep.lag
					).catch(err => {
						console.error("Error creating dependency:", err);
						// Don't fail the entire operation if dependency creation fails
						return null;
					})
				);

				await Promise.all(dependencyPromises);
			}

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
		if (currentStep < 2) {
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
			resetAdministratorState();
			resetDependencyState();
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
				{/* Administrator Section - like Card.jsx */}
				<div className="mb-6">
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center">
							<User className="w-4 h-4 mr-1" />
							Administrator
						</h3>
						{!administrator && (
							<button
								type="button"
								onClick={() => setShowAddAdministrator(true)}
								className="text-sm text-blue-600 dark:text-blue-400 midnight:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 midnight:hover:text-blue-300 flex items-center space-x-1"
								disabled={isSubmitting}
							>
								<UserPlus className="w-4 h-4" />
								<span>Assign</span>
							</button>
						)}
					</div>

					{showAddAdministrator && (
						<div
							ref={administratorSelectorRef}
							className="mb-3 p-3 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950"
						>
							<input
								type="text"
								value={administratorSearch}
								onChange={(e) =>
									setAdministratorSearch(e.target.value)
								}
								placeholder="Search members..."
								className="w-full mb-3 px-0 py-2 border-0 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-transparent focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 midnight:focus:border-indigo-500 text-gray-900 dark:text-white midnight:text-indigo-200 placeholder-gray-400 midnight:placeholder-gray-600"
								disabled={isSubmitting}
							/>
							<div className="max-h-32 overflow-y-auto space-y-1">
								{availableMembers.map((member) => (
									<button
										key={member.id}
										type="button"
										onClick={() =>
											handleAddAdministrator(member)
										}
										className="w-full flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-md text-left"
										disabled={isSubmitting}
									>
										<AdministratorAvatar
											member={member}
											size="medium"
										/>
										<div className="flex-1">
											<div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
												{member.name}
											</div>
											<div className="text-xs text-gray-500 midnight:text-gray-500">
												{member.email}
											</div>
										</div>
									</button>
								))}
								{availableMembers.length === 0 && (
									<div className="text-sm text-gray-500 midnight:text-gray-500 text-center py-2">
										{administratorSearch
											? "No matching members"
											: "No available members"}
									</div>
								)}
							</div>
						</div>
					)}

					<div className="space-y-2">
						{!administrator ? (
							<div className="text-sm text-gray-500 midnight:text-gray-500">
								No administrator assigned
							</div>
						) : (
							<div className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-md">
								<div className="flex items-center space-x-2 min-w-0 flex-1">
									<AdministratorAvatar
										member={administrator}
										size="medium"
									/>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-indigo-200 truncate">
											{administrator.name}
										</div>
										<div className="text-xs text-gray-500 midnight:text-gray-500 truncate">
											{administrator.email}
										</div>
									</div>
								</div>
								<button
									type="button"
									onClick={handleRemoveAdministrator}
									className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 midnight:text-red-500 midnight:hover:text-red-400 p-1"
									disabled={isSubmitting}
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						)}
					</div>
				</div>

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

	// Render step 3 content - Dependencies
	const renderStep3Content = () => {
		// Check if card has subtasks
		const hasSubtasks = cardData.checklist && cardData.checklist.length > 0;

		if (!hasSubtasks) {
			return (
				<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
					<div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/40 flex items-center justify-center">
						<Link2Off className="w-10 h-10 text-amber-500" />
					</div>
					<div className="text-center space-y-2 max-w-md">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200">
							No Subtasks Available
						</h3>
						<p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
							Please add subtasks to this card before managing dependencies. Dependencies help track relationships between tasks with subtasks.
						</p>
					</div>
				</div>
			);
		}

		const dependencyTypes = [
			{
				value: "FS",
				label: "Finish-to-Start",
				shortLabel: "FS",
				description: "Target card must finish before this card can start"
			},
			{
				value: "SS",
				label: "Start-to-Start",
				shortLabel: "SS",
				description: "Target card must start before this card can start"
			},
			{
				value: "FF",
				label: "Finish-to-Finish",
				shortLabel: "FF",
				description: "Target card must finish before this card can finish"
			},
			{
				value: "SF",
				label: "Start-to-Finish",
				shortLabel: "SF",
				description: "Target card must start before this card can finish"
			},
		];

		// Card selection view
		if (activeDependencyType) {
			const style = getDependencyTypeStyle(activeDependencyType);
			const selectedType = dependencyTypes.find(t => t.value === activeDependencyType);

			return (
				<div className="space-y-6 min-h-[500px]">
					{/* Back Button */}
					<div className="flex items-center space-x-3">
						<button
							type="button"
							onClick={() => {
								setActiveDependencyType(null);
								setDependencySearch("");
							}}
							className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-colors"
							disabled={isSubmitting}
						>
							<ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
						</button>
						<div>
							<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 flex items-center">
								<div className={`w-8 h-8 rounded-lg ${style.activeBg} flex items-center justify-center mr-3`}>
									<span className={`text-sm font-bold ${style.icon}`}>
										{selectedType.shortLabel}
									</span>
								</div>
								{selectedType.label}
							</h3>
							<p className={`text-sm mt-1 ${style.text}`}>
								{selectedType.description}
							</p>
						</div>
					</div>

					{/* Search Bar */}
					<div className={`p-4 rounded-lg border-2 ${style.border} ${style.bg}`}>
						<div className="relative">
							<Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${style.icon}`} />
							<input
								type="text"
								value={dependencySearch}
								onChange={(e) => setDependencySearch(e.target.value)}
								placeholder="Search cards..."
								className={`w-full pl-12 pr-4 py-3 rounded-lg border-2 ${style.border} bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-white midnight:text-indigo-200 focus:ring-2 focus:ring-offset-0 ${style.icon.replace('text-', 'focus:ring-')}`}
								disabled={isSubmitting}
								autoFocus
							/>
						</div>
					</div>

					{/* Card List */}
					<div className="space-y-2 max-h-96 overflow-y-auto pr-2">
						{availableCards.length === 0 ? (
							<div className="p-8 text-center">
								<div className={`w-16 h-16 rounded-full ${style.bg} flex items-center justify-center mx-auto mb-3`}>
									<Search className={`w-8 h-8 ${style.icon}`} />
								</div>
								<p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 text-sm">
									{dependencySearch ? "No matching cards found" : "No cards available"}
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
										onClick={() => !alreadyAdded && handleAddDependency(card, activeDependencyType)}
										disabled={alreadyAdded || isSubmitting}
										className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
											alreadyAdded
												? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border-gray-200 dark:border-gray-700 midnight:border-gray-800'
												: `${style.border} ${style.bg} ${style.hoverBg} hover:shadow-md`
										}`}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1 min-w-0">
												<div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 mb-1">
													{card.title}
												</div>
												<div className={`text-xs ${style.text} flex items-center space-x-2`}>
													<Columns3 className="w-3 h-3" />
													<span>{card.columnTitle}</span>
													{alreadyAdded && (
														<>
															<span>•</span>
															<span className="font-medium">Already added</span>
														</>
													)}
												</div>
											</div>
											{!alreadyAdded && (
												<Plus className={`w-5 h-5 ${style.icon} flex-shrink-0 ml-3`} />
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
			<div className="space-y-6 min-h-[500px]">
				{/* Header */}
				<div>
					<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 flex items-center mb-2">
						<Link2 className="w-5 h-5 mr-2" />
						Card Dependencies
						{dependencies.length > 0 && (
							<span className="ml-2 px-2.5 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 midnight:text-indigo-400 rounded-full">
								{dependencies.length}
							</span>
						)}
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
						Set which cards must be completed before this card can begin
					</p>
				</div>

				{/* Added Dependencies List */}
				<div className="space-y-3">
					<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
						Added Dependencies
					</h4>
					{dependencies.length === 0 ? (
						<div className="p-6 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg">
							<div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 flex items-center justify-center mx-auto mb-3">
								<Link2 className="w-6 h-6 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
							</div>
							<p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								No dependencies added yet
							</p>
							<p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-1">
								This card can start immediately
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{dependencies.map((dep, index) => {
								const style = getDependencyTypeStyle(dep.type);
								return (
									<div
										key={`${dep.targetCardId}-${dep.type}-${index}`}
										className={`p-4 rounded-lg border-2 ${style.border} ${style.bg} flex items-start justify-between`}
									>
										<div className="flex items-start space-x-3 flex-1 min-w-0">
											<div className={`w-10 h-10 rounded-lg ${style.activeBg} flex items-center justify-center flex-shrink-0`}>
												<span className={`text-xs font-bold ${style.icon}`}>
													{dep.type}
												</span>
											</div>
											<div className="flex-1 min-w-0">
												<div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-indigo-200 mb-1">
													{dep.targetCardTitle}
												</div>
												<div className={`text-xs ${style.text} flex items-center flex-wrap gap-2`}>
													<span className="flex items-center space-x-1">
														<Columns3 className="w-3 h-3" />
														<span>{dep.targetCardColumn}</span>
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
										<button
											type="button"
											onClick={() => handleRemoveDependency(dep.targetCardId, dep.type)}
											className="p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/10 rounded-lg transition-colors ml-3 flex-shrink-0"
											disabled={isSubmitting}
										>
											<X className="w-4 h-4" />
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Dependency Type Buttons */}
				<div className="space-y-3">
					<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
						Add Dependency by Type
					</h4>
					<div className="space-y-2">
						{dependencyTypes.map((type) => {
							const style = getDependencyTypeStyle(type.value);
							const typeDependencies = dependencies.filter(d => d.type === type.value);

							return (
								<button
									key={type.value}
									type="button"
									onClick={() => setActiveDependencyType(type.value)}
									className={`w-full p-4 rounded-lg border-2 transition-all text-left ${style.border} ${style.bg} ${style.hoverBg} hover:shadow-md`}
									disabled={isSubmitting}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center space-x-3">
											<div className={`w-10 h-10 rounded-lg ${style.activeBg} flex items-center justify-center flex-shrink-0`}>
												<span className={`text-sm font-bold ${style.icon}`}>
													{type.shortLabel}
												</span>
											</div>
											<div>
												<div className={`text-sm font-semibold ${style.text} mb-0.5`}>
													{type.label}
												</div>
												<div className={`text-xs ${style.text}`}>
													{type.description}
												</div>
											</div>
										</div>
										<div className="flex items-center space-x-3">
											{typeDependencies.length > 0 && (
												<span className={`px-2.5 py-1 text-xs font-medium rounded-full ${style.activeBg} ${style.text}`}>
													{typeDependencies.length}
												</span>
											)}
											<ArrowRight className={`w-5 h-5 ${style.icon} flex-shrink-0`} />
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</div>

				{/* Lag Time Configuration - Moved below dependency types */}
				<div className="p-4 bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg">
					<label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300 midnight:text-indigo-200 flex items-center">
						<Clock className="w-4 h-4 mr-2" />
						Lag Time for New Dependencies
					</label>
					<div className="relative">
						<input
							type="number"
							value={selectedLagTime}
							onChange={(e) => setSelectedLagTime(Math.max(0, parseFloat(e.target.value) || 0))}
							min="0"
							step="0.5"
							className="w-full pl-4 pr-24 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-white midnight:text-indigo-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 midnight:focus:ring-indigo-500 focus:border-transparent
							[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
							disabled={isSubmitting}
						/>
						<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
							<span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
								hours
							</span>
							<div className="flex flex-col">
								<button
									type="button"
									onClick={() => setSelectedLagTime(prev => Math.max(0, (parseFloat(prev) || 0) + 0.5))}
									className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-400 transition-colors rounded-t"
									disabled={isSubmitting}
								>
									<ChevronUp className="w-3.5 h-3.5" />
								</button>
								<button
									type="button"
									onClick={() => setSelectedLagTime(prev => Math.max(0, (parseFloat(prev) || 0) - 0.5))}
									className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-400 transition-colors rounded-b"
									disabled={isSubmitting}
								>
									<ChevronDown className="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
					</div>
					<p className="mt-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
						Time delay applied to dependencies you add next
					</p>
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
			case 2:
				return renderStep3Content();
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
										: currentStep === 1
										? "Configure administrator, subtasks, and attachments"
										: activeDependencyType
										? "Select a card to add as a dependency"
										: "Set up card dependencies"}
								</p>
							</div>
							<button
								onClick={() => {
									resetAdministratorState();
									resetDependencyState();
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
										resetAdministratorState();
										resetDependencyState();
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

								{currentStep < 2 ? (
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
