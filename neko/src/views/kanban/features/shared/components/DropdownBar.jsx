import React from "react";
import { createPortal } from "react-dom";
import {
	ChevronDown,
	AlertCircle,
	Tag,
	Sun,
	BadgeAlert,
	ListTodo,
	Timer,
	ScrollText,
	CheckCircle2,
	Columns,
	Siren,
	Disc3Icon,
	BookCheckIcon,
	ChartNoAxesColumn,
	LifeBuoy,
	Search,
	X,
} from "lucide-react";

const Dropdownbar = ({
	value,
	onChange,
	options,
	placeholder = "Select option...",
	label,
	type = "default",
	className = "",
	enableSearch = false, // New prop to enable search functionality
	disabled = false, // Handle disabled state
}) => {
	const [isOpen, setIsOpen] = React.useState(false);
	const [hoveredIndex, setHoveredIndex] = React.useState(null);
	const [searchTerm, setSearchTerm] = React.useState(""); // New state for search
	const dropdownRef = React.useRef(null);
	const triggerRef = React.useRef(null);
	const searchInputRef = React.useRef(null);
	const [dropdownStyle, setDropdownStyle] = React.useState({
		top: 0,
		left: 0,
		width: 0,
	});

	// Filter options based on search term
	const filteredOptions = React.useMemo(() => {
		if (!enableSearch || !searchTerm.trim()) {
			return options;
		}
		return options.filter((option) =>
			option.label.toLowerCase().includes(searchTerm.toLowerCase())
		);
	}, [options, searchTerm, enableSearch]);

	// Focus search input when dropdown opens
	React.useEffect(() => {
		if (isOpen && enableSearch && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 100);
		}
	}, [isOpen, enableSearch]);

	// Clear search when dropdown closes
	React.useEffect(() => {
		if (!isOpen) {
			setSearchTerm("");
			setHoveredIndex(null);
		}
	}, [isOpen]);

	// Handle keyboard navigation
	const handleKeyDown = (e) => {
		if (!isOpen) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHoveredIndex((prev) =>
					prev === null || prev >= filteredOptions.length - 1
						? 0
						: prev + 1
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setHoveredIndex((prev) =>
					prev === null || prev <= 0
						? filteredOptions.length - 1
						: prev - 1
				);
				break;
			case "Enter":
				e.preventDefault();
				if (hoveredIndex !== null && filteredOptions[hoveredIndex]) {
					onChange(filteredOptions[hoveredIndex].value);
					setIsOpen(false);
				}
				break;
			case "Escape":
				e.preventDefault();
				setIsOpen(false);
				break;
		}
	};

	const getIconColor = (type, optionType) => {
		const isDarkMode = document.documentElement.classList.contains("dark");
		const isMidnightMode =
			document.documentElement.classList.contains("midnight");

		switch (type) {
			case "column":
			case "column-custom":
				return isDarkMode
					? "#FFFFFF"
					: isMidnightMode
					? "#a5b4fc"
					: "#000000"; // White for dark, indigo-200 for midnight, black for light
			case "tag":
				switch (optionType?.toLowerCase()) {
					case "feature":
						return isMidnightMode ? "#a5b4fc" : "#8B5CF6"; // indigo-200 for midnight, violet-500 for others
					case "bug":
						return isMidnightMode ? "#fca5a5" : "#EF4444"; // red-300 for midnight, red-500 for others
					case "design":
						return isMidnightMode ? "#f9a8d4" : "#EC4899"; // pink-300 for midnight, pink-500 for others
					default:
						return isDarkMode
							? "#9CA3AF"
							: isMidnightMode
							? "#a5b4fc"
							: "#6B7280"; // Gray-400 for dark, indigo-200 for midnight, Gray-500 for light
				}
			default:
				return isDarkMode
					? "#9CA3AF"
					: isMidnightMode
					? "#a5b4fc"
					: "#6B7280"; // Gray-400 for dark, indigo-200 for midnight, Gray-500 for light
		}
	};

	const getIcon = (optionType) => {
		const iconColor = getIconColor(type, optionType);

		if (type === "column-custom") {
			return (
				<ChartNoAxesColumn
					className="w-4 h-4"
					style={{ color: iconColor }}
				/>
			);
		}

		switch (type) {
			case "column":
				switch (optionType?.toLowerCase()) {
					case "backlog":
						return (
							<ListTodo
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					case "in progress":
						return (
							<Timer
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					case "review":
						return (
							<ScrollText
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					case "done":
						return (
							<CheckCircle2
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					default:
						return (
							<Columns
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
				}
			case "priority":
				switch (optionType?.toLowerCase()) {
					case "high":
						return (
							<Siren className="w-4 h-4 text-red-400 dark:text-red-600 midnight:text-red-400" />
						);
					case "medium":
						return (
							<Disc3Icon className="w-4 h-4 text-yellow-400 dark:text-yellow-600 midnight:text-yellow-400" />
						);
					case "low":
						return (
							<LifeBuoy className="w-4 h-4 text-green-400 dark:text-green-600 midnight:text-green-400" />
						);
					default:
						return (
							<BadgeAlert className="w-4 h-4 text-gray-500 midnight:text-gray-400" />
						);
				}
			case "tag":
				switch (optionType?.toLowerCase()) {
					case "feature":
						return (
							<Tag
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					case "bug":
						return (
							<AlertCircle
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					case "design":
						return (
							<Sun
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
					default:
						return (
							<BookCheckIcon
								className="w-4 h-4"
								style={{ color: iconColor }}
							/>
						);
				}
			default:
				return <Tag className="w-4 h-4" style={{ color: iconColor }} />;
		}
	};

	// Positioning logic for portal dropdown
	React.useEffect(() => {
		if (!isOpen || !triggerRef.current) return;

		const SPACING = 8; // px

		const computePosition = () => {
			if (!triggerRef.current) return;
			const rect = triggerRef.current.getBoundingClientRect();
			const width = rect.width;
			// Default place below
			let top = rect.bottom + SPACING;
			let left = Math.min(
				Math.max(rect.left, SPACING),
				Math.max(SPACING, window.innerWidth - width - SPACING)
			);

			// If we can measure dropdown height, decide above/below
			if (dropdownRef.current) {
				const dh = dropdownRef.current.offsetHeight;
				const fitsBelow =
					rect.bottom + SPACING + dh <= window.innerHeight - SPACING;
				if (!fitsBelow) {
					top = Math.max(SPACING, rect.top - dh - SPACING);
				}
			}

			setDropdownStyle({ top, left, width });
		};

		// Compute initially and on next frame (to ensure ref is measured)
		computePosition();
		const rAF = requestAnimationFrame(computePosition);

		const onResize = () => computePosition();
		const onScroll = () => computePosition();
		window.addEventListener("resize", onResize);
		window.addEventListener("scroll", onScroll, true);

		return () => {
			cancelAnimationFrame(rAF);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("scroll", onScroll, true);
		};
	}, [isOpen]);

	// Outside click and keyboard handling when open
	React.useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event) => {
			const t = triggerRef.current;
			const d = dropdownRef.current;
			if (!t || !d) return;
			if (!t.contains(event.target) && !d.contains(event.target)) {
				setIsOpen(false);
			}
		};

		const handleGlobalKeyDown = (event) => {
			// Route navigation keys while focus is inside dropdown
			if (
				dropdownRef.current &&
				dropdownRef.current.contains(event.target)
			) {
				handleKeyDown(event);
			}
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleGlobalKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, [isOpen, hoveredIndex, filteredOptions]);

	return (
		<div className="relative" ref={triggerRef}>
			<div className={`relative w-full ${className}`}>
				<button
					type="button"
					onClick={() => !disabled && setIsOpen(!isOpen)}
					disabled={disabled}
					className={`relative w-full rounded-lg pl-3 pr-8 py-2 text-left cursor-pointer transition-colors 
            border border-gray-200 dark:border-gray-500 midnight:border-gray-800 /* Added light border */
            bg-white dark:bg-gray-800 midnight:bg-gray-900
            ${
				disabled
					? "opacity-50 cursor-not-allowed hover:border-gray-200 dark:hover:border-gray-500 midnight:hover:border-gray-800"
					: ""
			}`}
				>
					<div className="flex items-center gap-2">
						{value &&
							getIcon(
								options.find((opt) => opt.value === value)
									?.label
							)}
						<span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
							{value
								? options.find((opt) => opt.value === value)
										?.label
								: placeholder}
						</span>
					</div>
					<span className="absolute inset-y-0 right-2 flex items-center">
						<ChevronDown
							className={`h-4 w-4 transition-transform duration-200 text-gray-500 dark:text-gray-400 midnight:text-gray-500 ${
								isOpen ? "transform rotate-180" : ""
							}`}
						/>
					</span>
				</button>

				{isOpen &&
					!disabled &&
					createPortal(
						<div
							ref={dropdownRef}
							className="z-[10000]"
							style={{
								position: "fixed",
								top: dropdownStyle.top,
								left: dropdownStyle.left,
								width: dropdownStyle.width,
							}}
						>
							<div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-600 midnight:border-gray-800 bg-white dark:bg-gray-800 midnight:bg-gray-900 shadow-xl">
								{/* Search input for column dropdowns */}
								{enableSearch && type === "column-custom" && (
									<div className="p-2 border-b border-gray-200 dark:border-gray-600 midnight:border-gray-800">
										<div className="relative">
											<Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-500" />
											<input
												ref={searchInputRef}
												type="text"
												placeholder="Search columns..."
												value={searchTerm}
												onChange={(e) =>
													setSearchTerm(
														e.target.value
													)
												}
												onKeyDown={handleKeyDown}
												className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-md 
                          bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 
                          text-gray-900 dark:text-gray-100 midnight:text-gray-100
                          placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-gray-500
                          focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 midnight:focus:ring-indigo-400
                          focus:border-indigo-500 dark:focus:border-indigo-400 midnight:focus:border-indigo-400"
												onClick={(e) =>
													e.stopPropagation()
												}
											/>
											{searchTerm && (
												<button
													onClick={(e) => {
														e.stopPropagation();
														setSearchTerm("");
													}}
													className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
												>
													<X className="w-3 h-3 text-gray-400 dark:text-gray-500 midnight:text-gray-500" />
												</button>
											)}
										</div>
									</div>
								)}

								<div className="max-h-60 overflow-auto py-1">
									{filteredOptions.length > 0 ? (
										filteredOptions.map((option, index) => (
											<div
												key={option.value}
												onClick={() => {
													onChange(option.value);
													setIsOpen(false);
												}}
												onMouseEnter={() =>
													setHoveredIndex(index)
												}
												onMouseLeave={() =>
													setHoveredIndex(null)
												}
												className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm 
                          ${
								hoveredIndex === index
									? "bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800"
									: value === option.value
									? "bg-gray-50 dark:bg-gray-600 midnight:bg-gray-800"
									: "bg-white dark:bg-gray-800 midnight:bg-gray-900"
							}
                          ${
								value === option.value
									? "border-l-2 border-black dark:border-gray-700 midnight:border-indigo-500"
									: "border-l-2 border-transparent"
							}`}
											>
												{getIcon(option.label)}
												<span
													className={`text-gray-700 dark:text-gray-300 midnight:text-indigo-200 ${
														value === option.value
															? "font-medium"
															: ""
													}`}
												>
													{option.label}
												</span>
											</div>
										))
									) : (
										<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-center">
											No columns found
										</div>
									)}
								</div>
							</div>
						</div>,
						document.body
					)}
			</div>
		</div>
	);
};

export default Dropdownbar;
