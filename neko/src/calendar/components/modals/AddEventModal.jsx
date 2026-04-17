import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Calendar, Clock, User, FolderOpen } from "lucide-react";
import { useForm } from "react-hook-form";
import { COLORS } from "../../data/ColourConstants";
import ProjectSelection from "./ProjectSelection";
import CustomDatePicker from "../shared/CustomDatePicker";
import CustomTimePicker from "../shared/CustomTimePicker";

export function AddEventModal({
	isOpen,
	onClose,
	onAddEvent,
	initialDate,
	initialTitle,
	initialeventid,
	initialProject = null,
}) {
	const formatDateYMD = (date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	};

	const [isPersonalEvent, setIsPersonalEvent] = useState(true);
	const [projectId, setProjectId] = useState(initialProject || null);
	const [isMultiDay, setIsMultiDay] = useState(false);
	const [isCreating, setIsCreating] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
		watch,
		setValue,
		reset,
	} = useForm({
		defaultValues: {
			title: initialTitle || "",
			startDate: initialDate
				? formatDateYMD(new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000))
				: formatDateYMD(new Date()),
			endDate: initialDate
				? formatDateYMD(new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000))
				: formatDateYMD(new Date()),
			startTime: initialDate
				? new Date(initialDate.getTime()).toTimeString().slice(0, 5)
				: "09:00",
			endTime: initialDate
				? new Date(initialDate.getTime() + 60 * 60 * 1000).toTimeString().slice(0, 5)
				: "10:00",
			color: "blue",
			description: "",
		},
	});

	const startTime = watch("startTime");
	const endTime = watch("endTime");
	const startDate = watch("startDate");
	const endDate = watch("endDate");

	// Reset project when toggling personal event
	useEffect(() => {
		if (isPersonalEvent) setProjectId(null);
	}, [isPersonalEvent]);

	// Initialize from props
	useEffect(() => {
		if (initialDate) {
			const adjusted = new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000);
			setValue("startDate", formatDateYMD(adjusted));
			setValue("endDate", formatDateYMD(adjusted));
			setValue("startTime", initialDate.toTimeString().slice(0, 5));
			setValue("endTime", new Date(initialDate.getTime() + 60 * 60 * 1000).toTimeString().slice(0, 5));
		}
	}, [initialDate, setValue]);

	useEffect(() => {
		if (initialProject && initialProject !== "personal") {
			setProjectId(initialProject);
			setIsPersonalEvent(false);
		} else {
			setProjectId(null);
			setIsPersonalEvent(true);
		}
	}, [initialProject]);

	// Auto-fix end time if before start
	useEffect(() => {
		if (!startDate || !endDate || !startTime || !endTime) return;
		const startDT = new Date(`${startDate}T${startTime}`);
		const endDT = new Date(`${endDate}T${endTime}`);
		if (endDT <= startDT) {
			const adjusted = new Date(startDT);
			adjusted.setHours(adjusted.getHours() + 1);
			if (adjusted.getDate() > startDT.getDate()) {
				const nextDay = new Date(startDT);
				nextDay.setDate(nextDay.getDate() + 1);
				setValue("endDate", formatDateYMD(nextDay));
				setIsMultiDay(true);
			}
			setValue("endTime", adjusted.toTimeString().slice(0, 5));
		}
		setIsMultiDay(startDate !== endDate);
	}, [startTime, endTime, startDate, endDate, setValue]);

	const onSubmit = async (data) => {
		const startDT = new Date(`${data.startDate}T${data.startTime}`);
		const endDT = new Date(`${data.endDate}T${data.endTime}`);
		if (endDT <= startDT) {
			alert("End time must be after start time.");
			return;
		}

		try {
			setIsCreating(true);
			await onAddEvent({
				title: data.title,
				startDate: data.startDate,
				startTime: data.startTime,
				endDate: data.endDate,
				endTime: data.endTime,
				color: data.color,
				description: data.description || "",
				isMultiDay: data.startDate !== data.endDate,
				isPersonalEvent,
				projectId: isPersonalEvent ? null : projectId,
				attendees: [],
			});
			reset();
			onClose();
		} catch (error) {
			console.error("Error creating event:", error);
			alert("Failed to create event. Please try again.");
		} finally {
			setIsCreating(false);
		}
	};

	if (!isOpen) return null;

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[9999]"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<motion.div
				initial={{ scale: 0.95, opacity: 0, y: 10 }}
				animate={{ scale: 1, opacity: 1, y: 0 }}
				exit={{ scale: 0.95, opacity: 0, y: 10 }}
				className="bg-white dark:bg-gray-900 midnight:bg-gray-950 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg mx-4 flex flex-col overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
					<h2 className="text-xl font-semibold text-gray-900 dark:text-white">
						{initialeventid ? "Edit Event" : "Create New Event"}
					</h2>
					<button
						onClick={onClose}
						className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
					>
						<X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
					</button>
				</div>

				{/* Body */}
				<div className="p-6 overflow-y-auto">
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
						{/* Title */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Event Title *
							</label>
							<input
								{...register("title", { required: "Title is required" })}
								placeholder="Enter event title"
								className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
							/>
							{errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
						</div>

						{/* Personal / Project toggle */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Event Type
							</label>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => setIsPersonalEvent(true)}
									className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										isPersonalEvent
											? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
											: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
									}`}
								>
									<User className="w-4 h-4" />
									Personal
								</button>
								<button
									type="button"
									onClick={() => setIsPersonalEvent(false)}
									className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										!isPersonalEvent
											? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
											: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
									}`}
								>
									<FolderOpen className="w-4 h-4" />
									Project
								</button>
							</div>
						</div>

						{/* Project selection */}
						{!isPersonalEvent && (
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Project
								</label>
								<ProjectSelection
									projectId={projectId}
									setProjectId={setProjectId}
									isPersonalEvent={isPersonalEvent}
								/>
							</div>
						)}

						{/* Dates */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Start Date
								</label>
								<CustomDatePicker
									name="startDate"
									value={startDate}
									onChange={(e) => setValue("startDate", e.target.value)}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									End Date
								</label>
								<CustomDatePicker
									name="endDate"
									value={endDate}
									onChange={(e) => setValue("endDate", e.target.value)}
								/>
							</div>
						</div>

						{/* Times */}
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Start Time
								</label>
								<CustomTimePicker
									name="startTime"
									value={startTime}
									onChange={(e) => setValue("startTime", e.target.value)}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									End Time
								</label>
								<CustomTimePicker
									name="endTime"
									value={endTime}
									onChange={(e) => setValue("endTime", e.target.value)}
								/>
							</div>
						</div>

						{/* Color */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Color
							</label>
							<div className="flex flex-wrap gap-2">
								{Object.values(COLORS).map((color) => (
									<label key={color.value} className="cursor-pointer">
										<input
											type="radio"
											value={color.value}
											{...register("color")}
											className="sr-only"
										/>
										<div
											className={`w-7 h-7 rounded-full transition-all ${
												watch("color") === color.value
													? "ring-2 ring-offset-2 ring-gray-400 scale-110"
													: "hover:scale-105"
											}`}
											style={{ backgroundColor: color.hex }}
											title={color.name || color.value}
										/>
									</label>
								))}
							</div>
						</div>

						{/* Description */}
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Description
							</label>
							<textarea
								{...register("description")}
								placeholder="Add a description..."
								rows={3}
								onKeyDown={(e) => { if (e.key === " " || e.code === "Space") e.stopPropagation(); }}
								className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
							/>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-3 pt-2">
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={isCreating}
								className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
							>
								{isCreating ? (
									<>
										<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
										Creating...
									</>
								) : (
									initialeventid ? "Save Changes" : "Create Event"
								)}
							</button>
						</div>
					</form>
				</div>
			</motion.div>
		</motion.div>
	);
}

export default AddEventModal;
