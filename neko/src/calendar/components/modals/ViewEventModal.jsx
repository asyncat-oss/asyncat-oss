import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	X,
	Clock,
	Calendar,
	AlignLeft,
	Edit2,
	Trash2,
	MapPin,
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import { COLORS } from "../../data/ColourConstants";

const ViewEventModal = ({
	isOpen,
	onClose,
	event,
	onEdit,
	onDelete,
	currentUserId,
}) => {
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [expandedSections, setExpandedSections] = useState({
		details: true,
		description: true,
	});

	const canEdit = !currentUserId || event?.createdBy === currentUserId;
	const canDelete = canEdit;

	const { dateDisplay, timeDisplay } = useMemo(() => {
		const startDateTime = new Date(
			event.startTime || `${event.date}T${event.start}`
		);
		const endDateTime = new Date(event.endTime || `${event.date}T${event.end}`);

		if (startDateTime.toDateString() === endDateTime.toDateString()) {
			return {
				dateDisplay: startDateTime.toLocaleDateString(),
				timeDisplay: `${
					event.start || startDateTime.toTimeString().slice(0, 5)
				} - ${event.end || endDateTime.toTimeString().slice(0, 5)}`,
			};
		}

		return {
			dateDisplay: `${startDateTime.toLocaleDateString()} - ${endDateTime.toLocaleDateString()}`,
			timeDisplay: `${startDateTime
				.toTimeString()
				.slice(0, 5)} - ${endDateTime.toTimeString().slice(0, 5)}`,
		};
	}, [event]);

	if (!isOpen || !event) return null;

	const baseColor = COLORS[event.color] || COLORS.blue;

	const toggleSection = (section) => {
		setExpandedSections((prev) => ({
			...prev,
			[section]: !prev[section],
		}));
	};

	const confirmDelete = () => {
		setIsDeleting(true);
		setTimeout(() => {
			onDelete(event);
		}, 300);
	};

	return (
		<motion.div
			className="fixed inset-0 bg-black/30 dark:bg-black/60 midnight:bg-black/80 backdrop-blur-[2px] flex items-center justify-center z-[9999]"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<motion.div
				className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 midnight:border-gray-900 w-[65vw] max-w-[760px] max-h-[85vh] flex flex-col"
				initial={{ scale: 0.95, opacity: 0, y: 10 }}
				animate={{
					scale: isDeleting ? 0.9 : 1,
					y: isDeleting ? -10 : 0,
					opacity: isDeleting ? 0 : 1,
				}}
				transition={{ duration: 0.3 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="p-5 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between">
					<div className="flex items-center min-w-0 flex-1 mr-3">
						<motion.div
							className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
							style={{ backgroundColor: baseColor.hex }}
						/>
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-indigo-200 break-words">
							{event.title}
						</h2>
					</div>
					<div className="flex items-center gap-1">
						{canDelete && (
							<button
								onClick={() => setShowDeleteConfirm(true)}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									showDeleteConfirm
										? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
										: "text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900"
								}`}
								aria-label="Delete event"
							>
								<Trash2 className="w-4 h-4" />
							</button>
						)}
						<button
							onClick={onClose}
							className="h-8 w-8 flex items-center justify-center rounded-full text-gray-600 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
							aria-label="Close"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<AnimatePresence>
					{showDeleteConfirm && (
						<motion.div
							className="mx-5 my-2 p-3 bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5 border border-red-100 dark:border-red-800 midnight:border-red-900 rounded-lg"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
						>
							<p className="text-sm text-red-700 dark:text-red-400 midnight:text-red-300 font-medium">
								Delete this event? This action cannot be undone.
							</p>
							<div className="flex justify-end space-x-2 mt-3">
								<button
									onClick={() => setShowDeleteConfirm(false)}
									className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-md transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={confirmDelete}
									className="px-3 py-1.5 text-sm bg-red-600 dark:bg-red-700 midnight:bg-red-800 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-800 midnight:hover:bg-red-900 transition-colors"
								>
									Delete
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<div className="overflow-y-auto p-6 flex-grow">
					<div className="mb-6">
						<div
							className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
							onClick={() => toggleSection("details")}
						>
							<div className="flex items-center space-x-3">
								<Calendar className="h-5 w-5 text-blue-500 dark:text-blue-400 midnight:text-blue-400" />
								<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-200">
									Event Details
								</h3>
							</div>
							{expandedSections.details ? (
								<ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
							) : (
								<ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
							)}
						</div>

						<AnimatePresence>
							{expandedSections.details && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2 }}
									className="overflow-hidden"
								>
									<div className="mt-4 bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div className="flex items-start gap-3">
												<Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
												<div>
													<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
														Date
													</p>
													<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
														{dateDisplay}
													</p>
												</div>
											</div>
											<div className="flex items-start gap-3">
												<Clock className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
												<div>
													<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
														Time
													</p>
													<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
														{timeDisplay}
													</p>
												</div>
											</div>
											{event.location && (
												<div className="flex items-start gap-3">
													<MapPin className="w-5 h-5 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-0.5" />
													<div>
														<p className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500">
															Location
														</p>
														<p className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mt-1">
															{event.location}
														</p>
													</div>
												</div>
											)}
										</div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{event.description && (
						<div className="mb-6">
							<div
								className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
								onClick={() => toggleSection("description")}
							>
								<div className="flex items-center space-x-3">
									<AlignLeft className="h-5 w-5 text-green-500 dark:text-green-400 midnight:text-green-400" />
									<h3 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-gray-200">
										Description
									</h3>
								</div>
								{expandedSections.description ? (
									<ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
								) : (
									<ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400 midnight:text-gray-500" />
								)}
							</div>

							<AnimatePresence>
								{expandedSections.description && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.2 }}
										className="overflow-hidden"
									>
										<div className="mt-4 bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-900/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
											<p className="text-gray-700 dark:text-gray-300 midnight:text-gray-400 whitespace-pre-wrap leading-relaxed">
												{event.description}
											</p>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					)}
				</div>

				<div className="p-6 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-900 flex items-center justify-between">
					<div className="flex items-center space-x-3">
						{canEdit && (
							<motion.button
								onClick={() => onEdit(event)}
								className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 midnight:from-blue-700 midnight:to-indigo-800 text-white rounded-lg transition-all hover:shadow-md hover:from-blue-600 hover:to-indigo-700 dark:hover:from-blue-700 dark:hover:to-indigo-800 midnight:hover:from-blue-800 midnight:hover:to-indigo-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-600/50 midnight:focus:ring-blue-700/50 flex items-center space-x-2"
								whileHover={{ scale: 1.02 }}
								whileTap={{ scale: 0.98 }}
							>
								<Edit2 className="w-4 h-4" />
								<span>Edit Event</span>
							</motion.button>
						)}
					</div>

					<button
						onClick={onClose}
						className="px-5 py-2.5 text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
					>
						Close
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
};

export default ViewEventModal;
