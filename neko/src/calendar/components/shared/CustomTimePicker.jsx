import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";

const CustomTimePicker = ({
	value,
	onChange,
	placeholder = "Select time",
	error,
	className = "",
	label,
	disabled = false,
	format12Hour = true,
	dropUp = false,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [hours, setHours] = useState(9);
	const [minutes, setMinutes] = useState(0);
	const [period, setPeriod] = useState("AM");
	const [isEditingHours, setIsEditingHours] = useState(false);
	const [isEditingMinutes, setIsEditingMinutes] = useState(false);
	const [tempHours, setTempHours] = useState("");
	const [tempMinutes, setTempMinutes] = useState("");
	const containerRef = useRef(null);
	const hoursInputRef = useRef(null);
	const minutesInputRef = useRef(null);

	// Parse current value and update state
	useEffect(() => {
		if (value) {
			const [h, m] = value.split(":").map(Number);

			if (format12Hour) {
				if (h === 0) {
					setHours(12);
					setPeriod("AM");
				} else if (h < 12) {
					setHours(h);
					setPeriod("AM");
				} else if (h === 12) {
					setHours(12);
					setPeriod("PM");
				} else {
					setHours(h - 12);
					setPeriod("PM");
				}
			} else {
				setHours(h);
			}

			setMinutes(m);
		}
	}, [value, format12Hour]); // Close picker when clicking outside
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

	// Format time for display
	const formatTime = (h, m, p) => {
		const formattedMinutes = m.toString().padStart(2, "0");

		if (format12Hour) {
			return `${h}:${formattedMinutes} ${p}`;
		} else {
			return `${h.toString().padStart(2, "0")}:${formattedMinutes}`;
		}
	};

	// Convert to 24-hour format for onChange
	const convertTo24Hour = (h, m, p) => {
		let hour24 = h;

		if (format12Hour) {
			if (p === "AM" && h === 12) {
				hour24 = 0;
			} else if (p === "PM" && h !== 12) {
				hour24 = h + 12;
			}
		}

		return `${hour24.toString().padStart(2, "0")}:${m
			.toString()
			.padStart(2, "0")}`;
	};

	// Helpers to convert between 12-hour state and 24-hour math for accurate rollovers
	const to24HourInt = (h, p) => {
		if (!format12Hour) return h; // already 24h
		// 12 AM -> 0, 1-11 AM -> 1-11, 12 PM -> 12, 1-11 PM -> 13-23
		const base = h % 12; // 12 becomes 0
		return p === "AM" ? base : base + 12;
	};

	const from24HourInt = (h24) => {
		if (!format12Hour) return { h: h24, p: period };
		if (h24 === 0) return { h: 12, p: "AM" };
		if (h24 < 12) return { h: h24, p: "AM" };
		if (h24 === 12) return { h: 12, p: "PM" };
		return { h: h24 - 12, p: "PM" };
	};

	const handleTimeChange = (
		newHours = hours,
		newMinutes = minutes,
		newPeriod = period
	) => {
		setHours(newHours);
		setMinutes(newMinutes);
		setPeriod(newPeriod);

		const timeString = convertTo24Hour(newHours, newMinutes, newPeriod);
		onChange(timeString);
	};

	const adjustTime = (type, direction) => {
		// Work in 24-hour to correctly roll over hours and AM/PM
		let h24 = to24HourInt(hours, period);
		let m = minutes;

		if (type === "hours") {
			// single-hour step
			h24 = (h24 + direction + 24) % 24;
		} else if (type === "minutes") {
			// 5-minute steps with hour carry/borrow
			m += direction * 5;
			while (m >= 60) {
				m -= 60;
				h24 = (h24 + 1) % 24;
			}
			while (m < 0) {
				m += 60;
				h24 = (h24 + 23) % 24; // -1 mod 24
			}
		}

		if (format12Hour) {
			const { h: newH, p: newP } = from24HourInt(h24);
			handleTimeChange(newH, m, newP);
		} else {
			handleTimeChange(h24, m, period);
		}
	};

	const togglePeriod = () => {
		const newPeriod = period === "AM" ? "PM" : "AM";
		handleTimeChange(hours, minutes, newPeriod);
	};

	// Quick time options
	const quickTimes = format12Hour
		? [
				{ label: "9:00 AM", value: "09:00" },
				{ label: "12:00 PM", value: "12:00" },
				{ label: "1:00 PM", value: "13:00" },
				{ label: "2:00 PM", value: "14:00" },
				{ label: "5:00 PM", value: "17:00" },
				{ label: "6:00 PM", value: "18:00" },
		  ]
		: [
				{ label: "09:00", value: "09:00" },
				{ label: "12:00", value: "12:00" },
				{ label: "13:00", value: "13:00" },
				{ label: "14:00", value: "14:00" },
				{ label: "17:00", value: "17:00" },
				{ label: "18:00", value: "18:00" },
		  ];
	const handleQuickTime = (timeValue) => {
		onChange(timeValue);
		setIsOpen(false);
	};

	// Handle inline editing of hours
	const startEditingHours = () => {
		setIsEditingHours(true);
		setTempHours(
			format12Hour ? hours.toString() : hours.toString().padStart(2, "0")
		);
		setTimeout(() => hoursInputRef.current?.focus(), 0);
	};

	const finishEditingHours = () => {
		const newHours = parseInt(tempHours);
		if (!isNaN(newHours)) {
			if (format12Hour && newHours >= 1 && newHours <= 12) {
				handleTimeChange(newHours, minutes, period);
			} else if (!format12Hour && newHours >= 0 && newHours <= 23) {
				handleTimeChange(newHours, minutes, period);
			}
		}
		setIsEditingHours(false);
		setTempHours("");
	};

	const handleHoursKeyPress = (e) => {
		if (e.key === "Enter") {
			finishEditingHours();
		} else if (e.key === "Escape") {
			setIsEditingHours(false);
			setTempHours("");
		}
	};

	// Handle inline editing of minutes
	const startEditingMinutes = () => {
		setIsEditingMinutes(true);
		setTempMinutes(minutes.toString().padStart(2, "0"));
		setTimeout(() => minutesInputRef.current?.focus(), 0);
	};

	const finishEditingMinutes = () => {
		const newMinutes = parseInt(tempMinutes);
		if (!isNaN(newMinutes) && newMinutes >= 0 && newMinutes <= 59) {
			handleTimeChange(hours, newMinutes, period);
		}
		setIsEditingMinutes(false);
		setTempMinutes("");
	};
	const handleMinutesKeyPress = (e) => {
		if (e.key === "Enter") {
			finishEditingMinutes();
		} else if (e.key === "Escape") {
			setIsEditingMinutes(false);
			setTempMinutes("");
		}
	};

	return (
		<div className={`relative ${className}`} ref={containerRef}>
			{label && (
				<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-1">
					{label}
				</label>
			)}

			{/* Time Input */}
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
						value
							? ""
							: "text-gray-500 dark:text-gray-400 midnight:text-gray-500"
					}
				>
					{value ? formatTime(hours, minutes, period) : placeholder}
				</span>
				<Clock className="w-4 h-4 text-gray-400" />
			</button>

			{error && <p className="mt-1 text-sm text-red-500">{error}</p>}

			{/* Time Picker Dropdown */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{
							opacity: 0,
							y: dropUp ? 10 : -10,
							scale: 0.95,
						}}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: dropUp ? 10 : -10, scale: 0.95 }}
						transition={{ duration: 0.2 }}
						className={`absolute ${
							dropUp ? "bottom-full mb-1" : "top-full mt-1"
						} left-1/2 transform -translate-x-1/2 z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-xl p-4 min-w-[200px]`}
					>
						{/* Time Selector */}
						<div className="flex items-center justify-center space-x-4 mb-4">
							{" "}
							{/* Hours */}
							<div className="flex flex-col items-center">
								<button
									type="button"
									onClick={() => adjustTime("hours", -1)}
									className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
								>
									<ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>

								{isEditingHours ? (
									<input
										ref={hoursInputRef}
										type="text"
										value={tempHours}
										onChange={(e) =>
											setTempHours(e.target.value)
										}
										onKeyPress={handleHoursKeyPress}
										onBlur={finishEditingHours}
										className="w-12 h-12 text-center border border-blue-500 dark:border-blue-600 midnight:border-blue-700 rounded-lg font-mono text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 focus:outline-none"
										maxLength={2}
									/>
								) : (
									<div
										onClick={startEditingHours}
										className="w-12 h-12 flex items-center justify-center border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg font-mono text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 midnight:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/10 midnight:hover:bg-blue-900/5 transition-colors"
									>
										{format12Hour
											? hours
											: hours.toString().padStart(2, "0")}
									</div>
								)}

								<button
									type="button"
									onClick={() => adjustTime("hours", 1)}
									className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
								>
									<ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>
							</div>
							{/* Colon */}
							<div className="text-xl font-bold text-gray-400">
								:
							</div>{" "}
							{/* Minutes */}
							<div className="flex flex-col items-center">
								<button
									type="button"
									onClick={() => adjustTime("minutes", -1)}
									className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
								>
									<ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>

								{isEditingMinutes ? (
									<input
										ref={minutesInputRef}
										type="text"
										value={tempMinutes}
										onChange={(e) =>
											setTempMinutes(e.target.value)
										}
										onKeyPress={handleMinutesKeyPress}
										onBlur={finishEditingMinutes}
										className="w-12 h-12 text-center border border-blue-500 dark:border-blue-600 midnight:border-blue-700 rounded-lg font-mono text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 focus:outline-none"
										maxLength={2}
									/>
								) : (
									<div
										onClick={startEditingMinutes}
										className="w-12 h-12 flex items-center justify-center border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg font-mono text-lg font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 midnight:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/10 midnight:hover:bg-blue-900/5 transition-colors"
									>
										{minutes.toString().padStart(2, "0")}
									</div>
								)}

								<button
									type="button"
									onClick={() => adjustTime("minutes", 1)}
									className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded transition-colors"
								>
									<ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
								</button>
							</div>
							{/* AM/PM Toggle */}
							{format12Hour && (
								<div className="flex flex-col space-y-1">
									<button
										type="button"
										onClick={togglePeriod}
										className={`
                      px-3 py-1 text-sm rounded-lg font-medium transition-colors
                      ${
							period === "AM"
								? "bg-blue-500 text-white"
								: "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
						}
                    `}
									>
										AM
									</button>
									<button
										type="button"
										onClick={togglePeriod}
										className={`
                      px-3 py-1 text-sm rounded-lg font-medium transition-colors
                      ${
							period === "PM"
								? "bg-blue-500 text-white"
								: "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
						}
                    `}
									>
										PM
									</button>
								</div>
							)}
						</div>{" "}
						{/* Quick Times */}
						<div className="border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 pt-3">
							<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
								Quick times:
							</p>
							<div className="grid grid-cols-2 gap-1">
								{quickTimes.map((time) => (
									<button
										key={time.value}
										type="button"
										onClick={() =>
											handleQuickTime(time.value)
										}
										className="px-2 py-1 text-xs text-blue-500 dark:text-blue-400 midnight:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/10 rounded transition-colors"
									>
										{time.label}
									</button>
								))}{" "}
							</div>{" "}
							<p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-2">
								💡 Click hour/minute numbers to type directly
							</p>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

export default CustomTimePicker;
