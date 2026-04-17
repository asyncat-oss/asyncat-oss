import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const CustomDatePicker = ({
	value,
	onChange,
	placeholder = "Select date",
	error,
	className = "",
	label,
	disabled = false,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [displayDate, setDisplayDate] = useState(new Date());
	const containerRef = useRef(null);

	// Parse the current value or use today's date
	const currentDate = value ? new Date(value) : null;

	// Set display date to current value's month/year when value changes
	useEffect(() => {
		if (currentDate) {
			setDisplayDate(
				new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
			);
		}
	}, [value]);

	// Close picker when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Format date for display
	const formatDate = (date) => {
		if (!date) return "";
		return date.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};
	// Get days in month
	const getDaysInMonth = (date) => {
		const year = date.getFullYear();
		const month = date.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const firstDayOfWeek = firstDay.getDay();
		const daysInMonth = lastDay.getDate();

		const days = [];

		// Add empty cells for days before the first day of the month
		// For Monday-based week: Monday = 1, Sunday = 0, so we need to adjust
		const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Sunday becomes 6, Monday becomes 0
		for (let i = 0; i < mondayOffset; i++) {
			days.push(null);
		}

		// Add days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			days.push(new Date(year, month, day));
		}

		return days;
	};

	const days = getDaysInMonth(displayDate);
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const handleDateSelect = (date) => {
		if (date) {
			// Format date as YYYY-MM-DD without timezone conversion
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const formattedDate = `${year}-${month}-${day}`;
			onChange(formattedDate);
			setIsOpen(false);
		}
	};

	const navigateMonth = (direction) => {
		const newDate = new Date(displayDate);
		newDate.setMonth(newDate.getMonth() + direction);
		setDisplayDate(newDate);
	};

	const isToday = (date) => {
		const today = new Date();
		return (
			date &&
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	};

	const isSelected = (date) => {
		return (
			currentDate &&
			date &&
			date.getDate() === currentDate.getDate() &&
			date.getMonth() === currentDate.getMonth() &&
			date.getFullYear() === currentDate.getFullYear()
		);
	};

	return (
		<div className={`relative ${className}`} ref={containerRef}>
			{label && (
				<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-1">
					{label}
				</label>
			)}

			{/* Date Input */}
			<button
				type="button"
				onClick={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
				className={`
          w-full px-3 py-2 border rounded-lg flex items-center justify-between
          focus:outline-none focus:ring-1 transition-colors
          ${
				error
					? "border-red-300 dark:border-red-600 midnight:border-red-700 focus:ring-red-500"
					: "border-gray-200 dark:border-gray-700 midnight:border-gray-800 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700"
			}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          bg-white dark:bg-gray-800 midnight:bg-gray-900 
          text-gray-900 dark:text-gray-100 midnight:text-gray-100
        `}
			>
				<span
					className={
						currentDate
							? ""
							: "text-gray-500 dark:text-gray-400 midnight:text-gray-500"
					}
				>
					{currentDate ? formatDate(currentDate) : placeholder}
				</span>
				<Calendar className="w-4 h-4 text-gray-400" />
			</button>

			{error && <p className="mt-1 text-sm text-red-500">{error}</p>}

			{/* Date Picker Dropdown */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0, y: -10, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -10, scale: 0.95 }}
						transition={{ duration: 0.2 }}
						className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg p-4 min-w-[280px]"
					>
						{/* Header */}
						<div className="flex items-center justify-between mb-4">
							<button
								type="button"
								onClick={() => navigateMonth(-1)}
								className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-full transition-colors"
							>
								<ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
							</button>

							<h3 className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
								{monthNames[displayDate.getMonth()]}{" "}
								{displayDate.getFullYear()}
							</h3>

							<button
								type="button"
								onClick={() => navigateMonth(1)}
								className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-full transition-colors"
							>
								<ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
							</button>
						</div>{" "}
						{/* Days of week */}
						<div className="grid grid-cols-7 gap-1 mb-2">
							{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(
								(day) => (
									<div
										key={day}
										className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500 py-2"
									>
										{day}
									</div>
								)
							)}
						</div>
						{/* Calendar Days */}
						<div className="grid grid-cols-7 gap-1">
							{days.map((date, index) => (
								<button
									key={index}
									type="button"
									onClick={() => handleDateSelect(date)}
									disabled={!date}
									className={`
                    w-8 h-8 text-sm rounded-full flex items-center justify-center transition-colors
                    ${!date ? "invisible" : ""}
                    ${
						isSelected(date)
							? "bg-blue-500 text-white font-medium"
							: "hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300"
					}
                    ${
						isToday(date) && !isSelected(date)
							? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-medium"
							: ""
					}
                  `}
								>
									{date?.getDate()}
								</button>
							))}
						</div>{" "}
						{/* Quick Actions */}
						<div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
							<button
								type="button"
								onClick={() => {
									const today = new Date();
									const year = today.getFullYear();
									const month = String(
										today.getMonth() + 1
									).padStart(2, "0");
									const day = String(
										today.getDate()
									).padStart(2, "0");
									const formattedDate = `${year}-${month}-${day}`;
									onChange(formattedDate);
									setIsOpen(false);
								}}
								className="text-sm text-blue-500 dark:text-blue-400 midnight:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 midnight:hover:text-blue-300 transition-colors"
							>
								Today
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

export default CustomDatePicker;
