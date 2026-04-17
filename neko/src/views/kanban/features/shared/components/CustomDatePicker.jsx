/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = [
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

const CustomDatePicker = ({
	value,
	onChange,
	name,
	className = "",
	disabled = false,
	onKeyDown = () => {},
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [currentDate, setCurrentDate] = useState(
		value ? new Date(value) : new Date()
	);
	const [selectedDate, setSelectedDate] = useState(
		value ? new Date(value) : null
	);
	const [inputValue, setInputValue] = useState(
		selectedDate ? formatDateForDisplay(selectedDate) : ""
	);
	const datePickerRef = useRef(null);
	const dropdownRef = useRef(null);
	const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0 });
	// Store the original value in a normalized format
	const originalValue = useRef(
		value ? formatDateForInput(new Date(value)) : ""
	);

	// Format functions (defined outside to avoid re-creation)
	function formatDateForInput(date) {
		if (!date) return "";
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function formatDateForDisplay(date) {
		if (!date) return "";
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	}

	// Normalize a date string to YYYY-MM-DD format for reliable comparison
	function normalizeDate(dateStr) {
		if (!dateStr) return "";
		try {
			const date = new Date(dateStr);
			if (isNaN(date.getTime())) return "";
			return date.toISOString().split("T")[0];
		} catch (e) {
			return "";
		}
	}

	// Define tryParseManualInput with useCallback to safely use it in dependencies
	const tryParseManualInput = useCallback(() => {
		if (!inputValue) {
			// If input is cleared, clear the date
			setSelectedDate(null);

			// Only trigger if actually changed from original
			if (normalizeDate(originalValue.current) !== "") {
				const e = { target: { name, value: "" } };
				onChange(e);
			}
			return;
		}

		// Try various date parsing strategies
		const possibleFormats = [
			// Direct parsing (works well for many locales)
			new Date(inputValue),
			// MM/DD/YYYY or DD/MM/YYYY
			new Date(inputValue.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2")),
			// MM-DD-YYYY or DD-MM-YYYY
			new Date(inputValue.replace(/(\d+)-(\d+)-(\d+)/, "$3-$1-$2")),
			// Month DD, YYYY (e.g., March 15, 2023)
			new Date(inputValue),
		];

		// Find the first valid date
		const validDate = possibleFormats.find(
			(date) => !isNaN(date.getTime())
		);

		if (validDate) {
			setSelectedDate(validDate);
			setCurrentDate(validDate);
			const formattedDate = formatDateForInput(validDate);

			// Only call onChange if the value is different from the original
			// Use normalized comparison to prevent false detections
			if (
				normalizeDate(formattedDate) !==
				normalizeDate(originalValue.current)
			) {
				const e = { target: { name, value: formattedDate } };
				onChange(e);
			}

			setInputValue(formatDateForDisplay(validDate));
		} else {
			// If we can't parse the input, revert to the previous selected date display
			setInputValue(
				selectedDate ? formatDateForDisplay(selectedDate) : ""
			);
		}
	}, [inputValue, selectedDate, onChange, name]);

	// Only update when the value prop changes and is different from original
	useEffect(() => {
		if (
			value &&
			normalizeDate(value) !== normalizeDate(originalValue.current)
		) {
			const dateObj = new Date(value);
			if (!isNaN(dateObj.getTime())) {
				setSelectedDate(dateObj);
				setCurrentDate(dateObj);
				setInputValue(formatDateForDisplay(dateObj));
			}
		}
	}, [value]);

	useEffect(() => {
		const handleClickOutside = (event) => {
			const insideInput =
				datePickerRef.current &&
				datePickerRef.current.contains(event.target);
			const insideDropdown =
				dropdownRef.current &&
				dropdownRef.current.contains(event.target);
			if (!insideInput && !insideDropdown) {
				setIsOpen(false);

				// When clicking outside, try to parse the manual input and update if valid
				tryParseManualInput();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [tryParseManualInput]);

	// Portal-based positioning relative to viewport so it overlays above the modal content
	useEffect(() => {
		if (!isOpen) return;

		const position = () => {
			if (!datePickerRef.current) return;
			const inputRect = datePickerRef.current.getBoundingClientRect();
			const dropdownWidth = 256; // w-64
			const dropdownHeight = 320; // approximate
			const viewportW = window.innerWidth;
			const viewportH = window.innerHeight;

			const spaceBelow = viewportH - inputRect.bottom;
			const spaceAbove = inputRect.top;
			const openBelow =
				spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove;

			const top = openBelow
				? inputRect.bottom + 8
				: Math.max(8, inputRect.top - dropdownHeight - 8);

			// Center horizontally relative to the input field
			let left = inputRect.left + inputRect.width / 2 - dropdownWidth / 2;
			const minLeft = 8;
			const maxLeft = viewportW - dropdownWidth - 8;
			if (left < minLeft) left = minLeft;
			if (left > maxLeft) left = maxLeft;

			setDropdownStyle({ top, left });
		};

		position();
		window.addEventListener("resize", position);
		document.addEventListener("scroll", position, true);
		return () => {
			window.removeEventListener("resize", position);
			document.removeEventListener("scroll", position, true);
		};
	}, [isOpen]);

	const handleMonthChange = (increment) => {
		const newDate = new Date(currentDate);
		newDate.setMonth(newDate.getMonth() + increment);
		setCurrentDate(newDate);
	};

	const handleDateSelect = (day) => {
		const newDate = new Date(currentDate);
		newDate.setDate(day);
		setSelectedDate(newDate);

		// Format the date as YYYY-MM-DD for the onChange handler
		const formattedDate = formatDateForInput(newDate);
		setInputValue(formatDateForDisplay(newDate));

		// Only call onChange if the value is different from the original
		// Using normalized comparison
		if (
			normalizeDate(formattedDate) !==
			normalizeDate(originalValue.current)
		) {
			const e = { target: { name, value: formattedDate } };
			onChange(e);
		}

		setIsOpen(false);
	};

	const handleInputChange = (e) => {
		setInputValue(e.target.value);
	};

	const handleInputKeyDown = (e) => {
		// Call the passed onKeyDown handler
		onKeyDown(e);

		// Parse and update date on Enter key
		if (e.key === "Enter") {
			e.preventDefault();
			tryParseManualInput();
			setIsOpen(false);
		}
	};

	const handleInputBlur = () => {
		tryParseManualInput();
	};

	const renderCalendar = () => {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();

		// Get first day of the month
		const firstDay = new Date(year, month, 1).getDay();

		// Get number of days in month
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		// Get days from previous month to fill the first row
		const prevMonthDays = [];
		const prevMonth = new Date(year, month, 0);
		const prevMonthDaysCount = prevMonth.getDate();

		for (let i = 0; i < firstDay; i++) {
			prevMonthDays.unshift(prevMonthDaysCount - i);
		}

		// Create array for current month days
		const currentMonthDays = Array.from(
			{ length: daysInMonth },
			(_, i) => i + 1
		);

		// Calculate how many days from next month we need
		const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
		const nextMonthDays = Array.from(
			{ length: totalCells - (firstDay + daysInMonth) },
			(_, i) => i + 1
		);

		// Today's date for highlighting
		const today = new Date();
		const isToday = (day) => {
			return (
				today.getDate() === day &&
				today.getMonth() === month &&
				today.getFullYear() === year
			);
		};

		const isSelected = (day) => {
			return (
				selectedDate &&
				selectedDate.getDate() === day &&
				selectedDate.getMonth() === month &&
				selectedDate.getFullYear() === year
			);
		};

		return (
			<div className="p-2">
				{/* Calendar Header with Month/Year and Navigation */}
				<div className="flex items-center justify-between mb-3 px-2">
					<button
						type="button"
						onClick={() => handleMonthChange(-1)}
						className="p-1 rounded-full
              hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 
              text-gray-600 dark:text-gray-400 midnight:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-indigo-700"
					>
						<ChevronLeft className="w-4 h-4" />
					</button>
					<span className="text-sm font-medium text-gray-800 dark:text-white midnight:text-indigo-200">
						{months[month]} {year}
					</span>
					<button
						type="button"
						onClick={() => handleMonthChange(1)}
						className="p-1 rounded-full
              hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 
              text-gray-600 dark:text-gray-400 midnight:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-indigo-700"
					>
						<ChevronRight className="w-4 h-4" />
					</button>
				</div>

				{/* Day Headers */}
				<div className="grid grid-cols-7 gap-1 mb-2">
					{daysOfWeek.map((day) => (
						<div
							key={day}
							className="text-center text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-500"
						>
							{day}
						</div>
					))}
				</div>

				{/* Calendar Grid */}
				<div className="grid grid-cols-7 gap-1">
					{/* Previous month days */}
					{prevMonthDays.map((day, index) => (
						<button
							key={`prev-${index}`}
							type="button"
							disabled
							className="w-7 h-7 rounded-full text-center text-xs flex items-center justify-center
                text-gray-400 dark:text-gray-600 midnight:text-gray-700"
						>
							{day}
						</button>
					))}

					{/* Current month days */}
					{currentMonthDays.map((day) => (
						<button
							key={`current-${day}`}
							type="button"
							onClick={() => handleDateSelect(day)}
							className={`
                w-7 h-7 rounded-full text-center text-xs flex items-center justify-center
                transition-colors duration-200 focus:outline-none
                ${
					isSelected(day)
						? "bg-blue-500 dark:bg-blue-600 midnight:bg-indigo-600 text-white focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 midnight:focus:ring-indigo-400"
						: isToday(day)
						? "border border-blue-500 dark:border-blue-400 midnight:border-indigo-500 text-blue-700 dark:text-blue-400 midnight:text-indigo-400 focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 midnight:focus:ring-indigo-400"
						: "hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-800 dark:text-gray-300 midnight:text-indigo-200 focus:bg-gray-200 dark:focus:bg-gray-600 midnight:focus:bg-gray-700"
				}
              `}
						>
							{day}
						</button>
					))}

					{/* Next month days */}
					{nextMonthDays.map((day, index) => (
						<button
							key={`next-${index}`}
							type="button"
							disabled
							className="w-7 h-7 rounded-full text-center text-xs flex items-center justify-center
                text-gray-400 dark:text-gray-600 midnight:text-gray-700"
						>
							{day}
						</button>
					))}
				</div>
			</div>
		);
	};

	// Today button for quickly jumping to today's date
	const handleTodayClick = () => {
		const today = new Date();
		setCurrentDate(today);
		setSelectedDate(today);
		setInputValue(formatDateForDisplay(today));

		// Format the date as YYYY-MM-DD for the onChange handler
		const formattedDate = formatDateForInput(today);

		// Only call onChange if the value is different from the original
		// Using normalized comparison
		if (
			normalizeDate(formattedDate) !==
			normalizeDate(originalValue.current)
		) {
			const e = { target: { name, value: formattedDate } };
			onChange(e);
		}
	};

	return (
		<div className={`relative w-full ${className}`} ref={datePickerRef}>
			<div className="flex items-center gap-2 w-full">
				<CalendarIcon className="w-4 h-4 text-gray-500 dark:text-gray-300 midnight:text-indigo-300" />
				<div className="flex-1 relative">
					<input
						type="text"
						value={inputValue}
						onClick={() => !disabled && setIsOpen(true)}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						onBlur={handleInputBlur}
						className="w-full px-2 py-1 
              border border-gray-200 dark:border-gray-600 midnight:border-gray-800 
              rounded-lg 
              focus:outline-none focus:ring-1 
              focus:ring-gray-300 dark:focus:ring-gray-500 midnight:focus:ring-indigo-500 
              hover:border-gray-300 dark:hover:border-gray-500 midnight:hover:border-indigo-800 
              bg-white dark:bg-gray-800 midnight:bg-gray-900 
              text-gray-800 dark:text-gray-300 midnight:text-indigo-200
              placeholder-gray-500 dark:placeholder-gray-500 midnight:placeholder-gray-600"
						placeholder="Select or type date..."
						disabled={disabled}
					/>

					{/* Hidden input for form submission */}
					<input
						type="date"
						name={name}
						value={formatDateForInput(selectedDate)}
						onChange={(e) => {
							const dateObj = new Date(e.target.value);
							if (!isNaN(dateObj.getTime())) {
								setSelectedDate(dateObj);
								setCurrentDate(dateObj);
								setInputValue(formatDateForDisplay(dateObj));

								// Only call onChange if the value is different from the original
								// Using normalized comparison
								if (
									normalizeDate(e.target.value) !==
									normalizeDate(originalValue.current)
								) {
									onChange(e);
								}
							}
						}}
						className="absolute opacity-0 pointer-events-none"
						tabIndex="-1"
						aria-hidden="true"
					/>
				</div>
			</div>

			{isOpen &&
				createPortal(
					<div
						ref={dropdownRef}
						data-calendar-dropdown
						className="z-[10000] w-64
    bg-white dark:bg-gray-800 midnight:bg-gray-900
    border border-gray-200 dark:border-gray-700 midnight:border-gray-800
    rounded-lg shadow-lg dark:shadow-black/20 midnight:shadow-black/30
    overflow-hidden"
						style={{
							position: "fixed",
							top: dropdownStyle.top,
							left: dropdownStyle.left,
						}}
					>
						{renderCalendar()}

						{/* Calendar Footer */}
						<div className="px-2 py-2 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex justify-between">
							<button
								type="button"
								onClick={handleTodayClick}
								className="text-xs px-2 py-1 
                  text-blue-600 dark:text-blue-400 midnight:text-indigo-400 
                  hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-indigo-900/20 
                  rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 midnight:focus:ring-indigo-500"
							>
								Today
							</button>

							<button
								type="button"
								onClick={() => setIsOpen(false)}
								className="text-xs px-2 py-1 
                  text-gray-600 dark:text-gray-400 midnight:text-gray-500
                  hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 
                  rounded focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700"
							>
								Cancel
							</button>
						</div>
					</div>,
					document.body
				)}
		</div>
	);
};

export default CustomDatePicker;
