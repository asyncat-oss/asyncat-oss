import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	DndContext,
	useSensor,
	useSensors,
	PointerSensor,
	DragOverlay,
} from "@dnd-kit/core";
import DraggableEvent from "./DraggableEvent";
import DraggableCard from "./DraggableCard";
import MultipleEventsModal from "./MultipleEventsModal";
import { DAYS_OF_WEEK } from "../data/CalendarConstants";
import DroppableDay from "./DroppableDay";
import { motion, AnimatePresence } from "framer-motion";

const MonthView = ({
	events,
	cards = [], // Added cards prop with default empty array
	isToday,
	isSelectedDate,
	monthDays,
	firstDayOfMonth,
	onEventClick,
	onCardClick, // Added handler for card clicks
	onShowMoreClick,
	getEventStyle,
	setSelectedTimeSlot,
	setShowAddEvent,
	onEventUpdate,
	onCardUpdate, // Added handler for card updates
	fetchEvents,
	currentDate, // Add currentDate prop for navigation
	onDateChange, // Add onDateChange prop for navigation
	currentUserId, // Add current user ID
	currentUserEmail, // Add current user email
	allProjects = [], // Add allProjects prop for permissions
	// Modal props
	showMultipleEvents = false,
	selectedDateEvents = [],
	selectedDateCards = [],
	selectedDatePosition = null,
	onCloseMultipleEvents = () => {},
	onEventClickFromModal = () => {},
	onCardClickFromModal = () => {},
}) => {
	const [activeEvent, setActiveEvent] = useState(null);
	const [activeCard, setActiveCard] = useState(null); // Add state for active card
	const [processedEvents, setProcessedEvents] = useState([]);
	const [processedCards, setProcessedCards] = useState([]);
	// Refs for scroll functionality
	const containerRef = useRef(null);
	const isScrollingRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const indicatorTimeoutRef = useRef(null); // Separate timeout for indicator
	// Scroll handling with debounce
	const handleWheel = useCallback(
		(e) => {
			if (!onDateChange) return;

			// Prevent default scrolling
			e.preventDefault();

			// Debounce scroll events to avoid rapid month changes
			if (isScrollingRef.current) return;

			isScrollingRef.current = true;
			// Clear existing timeouts
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
			if (indicatorTimeoutRef.current) {
				clearTimeout(indicatorTimeoutRef.current);
			}
			// Determine scroll direction - support both vertical and horizontal scrolling
			const deltaY = e.deltaY;
			const deltaX = e.deltaX;
			const threshold = 15; // Minimum scroll threshold (increased for better control)

			// Check which axis has more significant movement
			const absY = Math.abs(deltaY);
			const absX = Math.abs(deltaX);

			if (absY > threshold || absX > threshold) {
				const newDate = new Date(currentDate);

				// Prioritize the axis with more movement
				if (absY >= absX) {
					// Vertical scrolling
					if (deltaY > 0) {
						// Scroll down - next month
						newDate.setMonth(newDate.getMonth() + 1);
					} else {
						// Scroll up - previous month
						newDate.setMonth(newDate.getMonth() - 1);
					}
				} else {
					// Horizontal scrolling
					if (deltaX > 0) {
						// Scroll right - next month
						newDate.setMonth(newDate.getMonth() + 1);
					} else {
						// Scroll left - previous month
						newDate.setMonth(newDate.getMonth() - 1);
					}
				}

				onDateChange(newDate);
			}

			// Hide indicator quickly (400ms)
			indicatorTimeoutRef.current = setTimeout(() => {
				isScrollingRef.current = false;
			}, 400);

			// Reset scrolling flag after longer delay for debouncing (prevent rapid scrolling)
			scrollTimeoutRef.current = setTimeout(() => {
				// This ensures we don't process more scroll events too quickly
			}, 800);
		},
		[currentDate, onDateChange]
	);

	// Add wheel event listener with non-passive option to allow preventDefault
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// Add wheel event listener with passive: false to allow preventDefault
		container.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			container.removeEventListener("wheel", handleWheel);
		};
	}, [handleWheel]); // Touch/swipe handling for mobile - support both horizontal and vertical swipes
	const [touchStart, setTouchStart] = useState(null);
	const [touchEnd, setTouchEnd] = useState(null);

	const handleTouchStart = useCallback((e) => {
		setTouchEnd(null);
		setTouchStart({
			x: e.targetTouches[0].clientX,
			y: e.targetTouches[0].clientY,
		});
	}, []);

	const handleTouchMove = useCallback((e) => {
		setTouchEnd({
			x: e.targetTouches[0].clientX,
			y: e.targetTouches[0].clientY,
		});
	}, []);

	const handleTouchEnd = useCallback(() => {
		if (!touchStart || !touchEnd || !onDateChange) return;

		const deltaX = touchStart.x - touchEnd.x;
		const deltaY = touchStart.y - touchEnd.y;
		const minSwipeDistance = 50;

		// Check which direction has more significant movement
		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);

		if (absX > minSwipeDistance || absY > minSwipeDistance) {
			const newDate = new Date(currentDate);

			// Prioritize the axis with more movement
			if (absX >= absY) {
				// Horizontal swipe
				if (deltaX > 0) {
					// Swipe left - next month
					newDate.setMonth(newDate.getMonth() + 1);
				} else {
					// Swipe right - previous month
					newDate.setMonth(newDate.getMonth() - 1);
				}
			} else {
				// Vertical swipe
				if (deltaY > 0) {
					// Swipe up - previous month
					newDate.setMonth(newDate.getMonth() - 1);
				} else {
					// Swipe down - next month
					newDate.setMonth(newDate.getMonth() + 1);
				}
			}

			onDateChange(newDate);
		}
	}, [touchStart, touchEnd, currentDate, onDateChange]);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e) => {
			if (!onDateChange) return;

			// Only handle if container is focused and no input elements are focused
			if (
				document.activeElement?.tagName === "INPUT" ||
				document.activeElement?.tagName === "TEXTAREA"
			)
				return;

			const newDate = new Date(currentDate);

			switch (e.key) {
				case "ArrowLeft":
					e.preventDefault();
					newDate.setMonth(newDate.getMonth() - 1);
					onDateChange(newDate);
					break;
				case "ArrowRight":
					e.preventDefault();
					newDate.setMonth(newDate.getMonth() + 1);
					onDateChange(newDate);
					break;
				case "PageUp":
					e.preventDefault();
					newDate.setMonth(newDate.getMonth() - 1);
					onDateChange(newDate);
					break;
				case "PageDown":
					e.preventDefault();
					newDate.setMonth(newDate.getMonth() + 1);
					onDateChange(newDate);
					break;
				default:
					break;
			}
		},
		[currentDate, onDateChange]
	);

	// Add keyboard event listener
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		container.addEventListener("keydown", handleKeyDown);
		// Make container focusable
		container.setAttribute("tabindex", "0");

		return () => {
			container.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);
	// Cleanup timeouts on unmount
	useEffect(() => {
		return () => {
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
			if (indicatorTimeoutRef.current) {
				clearTimeout(indicatorTimeoutRef.current);
			}
		};
	}, []);

	// Process multi-day events into individual day events
	useEffect(() => {
		// Helper function to parse date strings consistently to a local calendar day (midnight local time)
		const parseDateStringToLocalDate = (dateStr) => {
			if (
				typeof dateStr === "string" &&
				dateStr.match(/^\\d{4}-\\d{2}-\\d{2}$/)
			) {
				// For 'YYYY-MM-DD' strings, parse as local date
				const [year, month, day] = dateStr.split("-").map(Number);
				return new Date(year, month - 1, day); // month is 0-indexed
			}
			// For full ISO strings or other Date-parsable strings
			// Create a Date object (it will be in local time if source is UTC Z-string)
			// Then, get a new Date object representing midnight of that local day.
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) {
				// Handle invalid date strings
				// Return null or a sensible default, e.g., today's date, to avoid further errors
				// For now, returning null and letting the calling code handle it.
				return null;
			}
			return new Date(d.getFullYear(), d.getMonth(), d.getDate());
		};

		const allEvents = [];
		events.forEach((event) => {
			const primaryDateSource = event.startTime || event.date;
			if (!primaryDateSource) {
				return; // Skip events without enough date information
			}

			let startCalDay;
			// Prioritize event.date for the calendar day if it's 'YYYY-MM-DD'
			if (
				event.date &&
				typeof event.date === "string" &&
				event.date.match(/^\\d{4}-\\d{2}-\\d{2}$/)
			) {
				startCalDay = parseDateStringToLocalDate(event.date);
			} else {
				// Otherwise, use startTime or fallback to event.date (even if not 'YYYY-MM-DD')
				startCalDay = parseDateStringToLocalDate(primaryDateSource);
			}

			if (!startCalDay) {
				// If parsing failed
				return;
			}

			let endCalDay;
			// Determine end date source: endTime, or date (if endTime is missing), or startTime as last resort
			const endDateSource =
				event.endTime || event.date || event.startTime;

			// If event.date is the most specific end information (and no event.endTime)
			// and it's a 'YYYY-MM-DD' string, use it.
			if (
				event.date &&
				!event.endTime &&
				typeof event.date === "string" &&
				event.date.match(/^\\d{4}-\\d{2}-\\d{2}$/)
			) {
				endCalDay = parseDateStringToLocalDate(event.date);
			} else if (event.endTime) {
				// If event.endTime is present, it's the primary source for end date
				endCalDay = parseDateStringToLocalDate(event.endTime);
			} else if (endDateSource) {
				// Fallback to general endDateSource if more specific parsing didn't apply
				endCalDay = parseDateStringToLocalDate(endDateSource);
			} else {
				// Should ideally not happen if startCalDay was determined
				endCalDay = new Date(startCalDay);
			}

			if (!endCalDay) {
				// If parsing failed
				// Fallback to startCalDay to treat as single-day if end is indeterminate
				endCalDay = new Date(startCalDay);
			}

			// Ensure endCalDay is not before startCalDay
			if (endCalDay < startCalDay) {
				endCalDay = new Date(startCalDay);
			}

			// If it's a single calendar day event
			if (
				startCalDay.getFullYear() === endCalDay.getFullYear() &&
				startCalDay.getMonth() === endCalDay.getMonth() &&
				startCalDay.getDate() === endCalDay.getDate()
			) {
				allEvents.push({
					...event,
					isMultiDay: false,
					isFirstDay: true,
					isLastDay: true,
					displayDate: startCalDay, // This is local midnight of the correct calendar day
				});
				return;
			}

			// Multi-day event processing
			let currentDate = new Date(startCalDay);
			while (currentDate <= endCalDay) {
				const isFirstDay =
					currentDate.getTime() === startCalDay.getTime();
				const isLastDay = currentDate.getTime() === endCalDay.getTime();

				allEvents.push({
					...event,
					isMultiDay: true,
					isFirstDay,
					isLastDay,
					displayDate: new Date(currentDate), // Represents local midnight of this segment's day
					multiDayPosition: isFirstDay
						? "start"
						: isLastDay
						? "end"
						: "middle",
				});

				if (isLastDay) break;

				const nextDate = new Date(currentDate);
				nextDate.setDate(nextDate.getDate() + 1);
				currentDate = nextDate;
			}
		});
		setProcessedEvents(allEvents);
	}, [events]);

	// Process cards for calendar display
	useEffect(() => {
		// Map cards to a format suitable for the calendar
		const formattedCards = cards.map((card) => {
			// Use dueDate as the display date
			const dueDate = new Date(card.dueDate);
			return {
				...card,
				displayDate: dueDate,
			};
		});

		setProcessedCards(formattedCards);
	}, [cards]);


	// Handle day click
	const handleDayClick = (date) => {
		const now = new Date();
		const nextHour = now.getHours() + 1;
		const selectedDateTime = new Date(date);
		selectedDateTime.setHours(nextHour, 0, 0, 0);

		setSelectedTimeSlot(selectedDateTime);
		setShowAddEvent(true);
	};

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		})
	);

	const handleDragStart = (event) => {
		const { active } = event;

		// Close modal when drag starts
		if (showMultipleEvents) {
			onCloseMultipleEvents();
		}

		// Check if it's a card being dragged (support modal IDs and data type)
		const isCard =
			active?.data?.current?.type === "card" ||
			String(active.id).startsWith("card-") ||
			String(active.id).startsWith("modal-card-");

		if (isCard) {
			const draggedCard =
				active.data?.current ||
				cards.find((c) => `card-${c.id}` === active.id);

			if (!draggedCard) {
				console.error("Could not find card with id:", active.id);
				return;
			}

			setActiveCard(draggedCard);
		} else {
			// It's an event being dragged
			const rawData = active.data?.current;
			let draggedEvent = null;
			if (rawData && rawData.id) {
				draggedEvent = rawData;
			} else {
				const idStr = String(active.id);
				const plainId = idStr.startsWith("modal-event-")
					? idStr.replace("modal-event-", "")
					: idStr;
				draggedEvent = processedEvents.find(
					(e) => String(e.id) === plainId
				);
			}

			if (!draggedEvent) {
				console.error("Could not find event with id:", active.id);
				return;
			}

			setActiveEvent(draggedEvent);
		}
	};

	const handleDragEnd = async (event) => {
		const { active, over } = event;

		if (!over || active.id === over.id) {
			setActiveEvent(null);
			setActiveCard(null);
			return;
		}

		// Check if it's a card being dragged (support modal IDs and data type)
		const isCard =
			active?.data?.current?.type === "card" ||
			String(active.id).startsWith("card-") ||
			String(active.id).startsWith("modal-card-");

		if (isCard) {
			const draggedCard = activeCard;

			// Clear drag state immediately for faster UI response
			setActiveCard(null);

			if (!draggedCard || !onCardUpdate) {
				console.error("No card data or onCardUpdate handler available");
				return;
			}

			try {
				const targetDate = new Date(over.id);

				// Update card due date
				const updatedCardData = {
					...draggedCard,
					dueDate: targetDate.toISOString(),
				};

				// Fire and forget - don't await to avoid blocking UI
				onCardUpdate(updatedCardData).catch((error) => {
					console.error(
						"Error updating card in MonthView.handleDragEnd:",
						error
					);
				});
			} catch (error) {
				console.error(
					"Error updating card in MonthView.handleDragEnd:",
					error
				);
			}
		} else {
			// Handle event dragging (existing logic)
			const draggedEvent = activeEvent;

			// Clear drag state immediately for faster UI response
			setActiveEvent(null);

			try {
				const targetDate = new Date(over.id);

				let updatedEventData = {
					...draggedEvent,
					id: draggedEvent.id,
					title: draggedEvent.title,
					color: draggedEvent.color,
					description: draggedEvent.description,
				};

				if (draggedEvent.isMultiDay) {
					const originalStart = new Date(
						draggedEvent.startTime || draggedEvent.date
					);
					const originalEnd = new Date(
						draggedEvent.endTime || draggedEvent.date
					);
					const draggedDisplayDate = new Date(
						draggedEvent.displayDate
					);

					const daysDiff = Math.round(
						(targetDate.getTime() - draggedDisplayDate.getTime()) /
							(24 * 60 * 60 * 1000)
					);

					const newStartDate = new Date(originalStart);
					newStartDate.setDate(originalStart.getDate() + daysDiff);

					const newEndDate = new Date(originalEnd);
					newEndDate.setDate(originalEnd.getDate() + daysDiff);

					updatedEventData.startTime = newStartDate.toISOString();
					updatedEventData.endTime = newEndDate.toISOString();
					updatedEventData.date = newStartDate
						.toISOString()
						.split("T")[0];
				} else {
					// Single-day event
					const originalStartTime = new Date(
						draggedEvent.startTime ||
							`${draggedEvent.date}T${
								draggedEvent.start || "00:00:00"
							}`
					);
					const originalEndTime = new Date(
						draggedEvent.endTime ||
							`${draggedEvent.date}T${
								draggedEvent.end || "23:59:59"
							}`
					);

					const newStartDate = new Date(targetDate);
					newStartDate.setHours(
						originalStartTime.getHours(),
						originalStartTime.getMinutes(),
						originalStartTime.getSeconds()
					);

					const newEndDate = new Date(targetDate);
					newEndDate.setHours(
						originalEndTime.getHours(),
						originalEndTime.getMinutes(),
						originalEndTime.getSeconds()
					);

					if (draggedEvent.isAllDay) {
						newStartDate.setHours(0, 0, 0, 0);
						newEndDate.setHours(23, 59, 59, 999);
						updatedEventData.date = newStartDate
							.toISOString()
							.split("T")[0];
						updatedEventData.startTime = newStartDate.toISOString();
						updatedEventData.endTime = newEndDate.toISOString();
					} else {
						updatedEventData.date = newStartDate
							.toISOString()
							.split("T")[0];
						updatedEventData.startTime = newStartDate.toISOString();
						updatedEventData.endTime = newEndDate.toISOString();
					}
				}

				// Fire and forget - don't await to avoid blocking UI
				onEventUpdate(updatedEventData).catch((error) => {
					console.error(
						"Error updating event in MonthView.handleDragEnd:",
						error
					);
				});
			} catch (error) {
				console.error(
					"Error updating event in MonthView.handleDragEnd:",
					error
				);
			}
		}
	};

	const isSameDate = (date1, date2) => {
		if (!date1 || !date2) return false;
		const d1 = new Date(date1);
		const d2 = new Date(date2);
		return (
			d1.getFullYear() === d2.getFullYear() &&
			d1.getMonth() === d2.getMonth() &&
			d1.getDate() === d2.getDate()
		);
	};
	const getPreviousMonthDays = (year, month) => {
		const date = new Date(year, month, 1);
		const days = [];
		// For Monday-based week: Monday = 1, Sunday = 0, so we need to fill until Monday (1)
		const dayOfWeek = date.getDay();
		const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0

		for (let i = 0; i < mondayOffset; i++) {
			date.setDate(date.getDate() - 1);
			days.unshift(new Date(date));
		}
		return days;
	};

	const getNextMonthDays = (year, month) => {
		const date = new Date(year, month + 1, 0); // Last day of current month
		const days = [];
		// For Monday-based week: fill until Sunday (0)
		const dayOfWeek = date.getDay();
		const sundayOffset = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // Days needed to reach Sunday

		for (let i = 0; i < sundayOffset; i++) {
			date.setDate(date.getDate() + 1);
			days.push(new Date(date));
		}
		return days;
	};

	// Get a special style for multi-day events
	const getMultiDayEventStyle = (event) => {
		let baseStyle = getEventStyle(event);

		// Add rounded corners based on position
		if (event.multiDayPosition === "start") {
			baseStyle += " rounded-l-md rounded-r-none";
		} else if (event.multiDayPosition === "end") {
			baseStyle += " rounded-r-md rounded-l-none";
		} else if (event.multiDayPosition === "middle") {
			baseStyle += " rounded-none";
		}

		return baseStyle;
	};

	const previousMonthDays = getPreviousMonthDays(
		monthDays[0].getFullYear(),
		monthDays[0].getMonth()
	);
	const nextMonthDays = getNextMonthDays(
		monthDays[0].getFullYear(),
		monthDays[0].getMonth()
	);

	// Get combined items (events and cards) for a date
	const getItemsForDate = (date) => {
		const dateEvents = processedEvents
			.filter((event) => isSameDate(event.displayDate, date))
			.filter((event) => {
				// Hide the event only if it's being dragged (moved), not resized
				// Note: MonthView typically doesn't have resize operations, but keeping consistent logic
				return !activeEvent || activeEvent.id !== event.id;
			});
		const dateCards = processedCards
			.filter((card) => isSameDate(card.displayDate, date))
			.filter((card) => {
				// Hide the card if it's being dragged
				return !activeCard || activeCard.id !== card.id;
			});

		// Return combined array with cards first (typically fewer), then events
		return [...dateCards, ...dateEvents];
	};
	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			{" "}
			<div
				ref={containerRef}
				className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-gray-950 select-none relative"
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				style={{
					touchAction: "pan-x pan-y", // Allow both horizontal and vertical scrolling
					overscrollBehavior: "contain", // Prevent overscroll from affecting parent
				}}
			>
				{" "}
				{/* Month transition indicator */}
				<AnimatePresence>
					{isScrollingRef.current && (
						<motion.div
							initial={{ opacity: 0, y: -20, scale: 0.9 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -20, scale: 0.9 }}
							transition={{
								duration: 0.2,
								ease: "easeOut",
								exit: { duration: 0.15 }, // Faster exit animation
							}}
							className="absolute top-10 left-1/2 transform -translate-x-1/2 z-20 
                bg-black/90 dark:bg-white/90 midnight:bg-gray-800/95 
                text-white dark:text-black midnight:text-white 
                px-4 py-2 rounded-xl text-sm font-semibold shadow-xl
                backdrop-blur-sm border border-white/20 dark:border-black/20 midnight:border-gray-600/40"
						>
							<div className="flex items-center space-x-2">
								<span>
									{currentDate?.toLocaleString("default", {
										month: "long",
										year: "numeric",
									})}
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
				<div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-gray-950">
					<div className="grid grid-cols-7 gap-4 p-4">
						{DAYS_OF_WEEK.map((day) => (
							<div
								key={day}
								className="text-center text-base font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-500"
							>
								{day}
							</div>
						))}
					</div>
				</div>
				<motion.div
					className="flex-1 overflow-auto bg-white dark:bg-gray-900 midnight:bg-gray-950 h-full"
					key={
						currentDate?.getMonth() +
						"-" +
						currentDate?.getFullYear()
					} // Key for animation
					initial={{ opacity: 0, x: 20 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					<div className="grid grid-cols-7 h-full">
						{previousMonthDays.map((date, index) => {
							// Get all items (events and cards) for this date
							const dateItems = getItemsForDate(date);

							return (
								<DroppableDay
									key={`prev-${index}`}
									date={date}
									isToday={isToday}
									isSelectedDate={isSelectedDate}
									onClick={handleDayClick}
								>
									<div className="text-gray-400 dark:text-gray-600 midnight:text-gray-600">
										{date.getDate()}
									</div>
									<div className="space-y-0.5 h-16">
										{" "}
										{/* Fixed height and overflow hidden */}
										{/* Show first 2 items (cards and events combined) */}
										{dateItems.slice(0, 2).map((item) => {
											// Item with dueDate property is a card
											if ("dueDate" in item) {
												return (
													<DraggableCard
														key={`card-${item.id}`}
														card={item}
														onCardClick={
															onCardClick
														}
														currentUserId={
															currentUserId
														}
													/>
												);
											} else {
												// Otherwise it's an event
												return (
													<DraggableEvent
														key={`event-${item.id}`}
														event={item}
														onEventClick={
															onEventClick
														}
														getEventStyle={(e) =>
															e.isMultiDay
																? getMultiDayEventStyle(
																		e
																  )
																: getEventStyle(
																		e
																  )
														}
														showIcons={true}
														resizable={false} // Disable resizing in month view
														style={{
															marginLeft:
																item.isMultiDay &&
																!item.isFirstDay
																	? "-0.5rem"
																	: "0",
															marginRight:
																item.isMultiDay &&
																!item.isLastDay
																	? "-0.5rem"
																	: "0",
														}}
														compact={true} // Add compact prop to make events smaller
														currentUserId={
															currentUserId
														}
														currentUserEmail={
															currentUserEmail
														}
														allProjects={
															allProjects
														} // Pass allProjects for permissions
													/>
												);
											}
										})}
										{/* Show "more" link if there are more than 2 items */}
										{dateItems.length > 2 && (
											<div
												className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 pl-1 font-medium cursor-pointer hover:underline"
												onClick={(e) => {
													e.stopPropagation();

													// Get button position for smart positioning
													const rect =
														e.currentTarget.getBoundingClientRect();
													const position = {
														top: rect.top,
														bottom: rect.bottom,
														left: rect.left,
														right: rect.right,
													};

													onShowMoreClick(
														date,
														position
													);
												}}
											>
												{dateItems.length - 2} more...
											</div>
										)}
									</div>
								</DroppableDay>
							);
						})}
						{monthDays.map((date) => {
							// Get all items (events and cards) for this date
							const dateItems = getItemsForDate(date);

							return (
								<DroppableDay
									key={date.toISOString()}
									date={date}
									isToday={isToday}
									isSelectedDate={isSelectedDate}
									onClick={handleDayClick}
								>
									<div
										className={`
                    flex items-center justify-center w-8 h-8 mb-2
                    ${
						isToday(date)
							? "bg-blue-500 dark:bg-blue-700 midnight:bg-blue-800 text-white rounded-full"
							: "text-gray-600 dark:text-gray-300 midnight:text-gray-300"
					}
                    ${
						isSelectedDate(date)
							? "ring-2 ring-blue-500 dark:ring-blue-400 midnight:ring-blue-300"
							: ""
					}
                    ml-auto hover:bg-gray-100 dark:hover:bg-gray-700/50 midnight:hover:bg-gray-800/50 rounded-full transition-colors duration-200
                  `}
									>
										{date.getDate()}
									</div>
									<div className="space-y-0.5 h-16">
										{" "}
										{/* Fixed height and overflow hidden */}
										{/* Show first 2 items (cards and events combined) */}
										{dateItems.slice(0, 2).map((item) => {
											// Item with dueDate property is a card
											if ("dueDate" in item) {
												return (
													<DraggableCard
														key={`card-${item.id}`}
														card={item}
														onCardClick={
															onCardClick
														}
														currentUserId={
															currentUserId
														}
													/>
												);
											} else {
												// Otherwise it's an event
												return (
													<DraggableEvent
														key={`event-${item.id}`}
														event={item}
														onEventClick={
															onEventClick
														}
														getEventStyle={(e) =>
															e.isMultiDay
																? getMultiDayEventStyle(
																		e
																  )
																: getEventStyle(
																		e
																  )
														}
														showIcons={true}
														resizable={false} // Disable resizing in month view
														style={{
															marginLeft:
																item.isMultiDay &&
																!item.isFirstDay
																	? "-0.5rem"
																	: "0",
															marginRight:
																item.isMultiDay &&
																!item.isLastDay
																	? "-0.5rem"
																	: "0",
														}}
														compact={true} // Add compact prop to make events smaller
														currentUserId={
															currentUserId
														}
														currentUserEmail={
															currentUserEmail
														}
														allProjects={
															allProjects
														} // Pass allProjects for permissions
													/>
												);
											}
										})}
										{/* Show "more" link if there are more than 2 items */}
										{dateItems.length > 2 && (
											<div
												className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 pl-1 font-medium cursor-pointer hover:underline"
												onClick={(e) => {
													e.stopPropagation();

													// Get button position for smart positioning
													const rect =
														e.currentTarget.getBoundingClientRect();
													const position = {
														top: rect.top,
														bottom: rect.bottom,
														left: rect.left,
														right: rect.right,
													};

													onShowMoreClick(
														date,
														position
													);
												}}
											>
												{dateItems.length - 2} more...
											</div>
										)}
									</div>
								</DroppableDay>
							);
						})}
						{nextMonthDays.map((date, index) => {
							// Get all items (events and cards) for this date
							const dateItems = getItemsForDate(date);

							return (
								<DroppableDay
									key={`next-${index}`}
									date={date}
									isToday={isToday}
									isSelectedDate={isSelectedDate}
									onClick={handleDayClick}
								>
									<div className="text-gray-400 dark:text-gray-600 midnight:text-gray-600">
										{date.getDate()}
									</div>
									<div className="space-y-0.5 h-16">
										{" "}
										{/* Fixed height and overflow hidden */}
										{/* Show first 2 items (cards and events combined) */}
										{dateItems.slice(0, 2).map((item) => {
											// Item with dueDate property is a card
											if ("dueDate" in item) {
												return (
													<DraggableCard
														key={`card-${item.id}`}
														card={item}
														onCardClick={
															onCardClick
														}
														currentUserId={
															currentUserId
														}
													/>
												);
											} else {
												// Otherwise it's an event
												return (
													<DraggableEvent
														key={`event-${item.id}`}
														event={item}
														onEventClick={
															onEventClick
														}
														getEventStyle={(e) =>
															e.isMultiDay
																? getMultiDayEventStyle(
																		e
																  )
																: getEventStyle(
																		e
																  )
														}
														showIcons={true}
														resizable={false} // Disable resizing in month view
														style={{
															marginLeft:
																item.isMultiDay &&
																!item.isFirstDay
																	? "-0.5rem"
																	: "0",
															marginRight:
																item.isMultiDay &&
																!item.isLastDay
																	? "-0.5rem"
																	: "0",
														}}
														compact={true} // Add compact prop to make events smaller
														currentUserId={
															currentUserId
														}
														currentUserEmail={
															currentUserEmail
														}
														allProjects={
															allProjects
														} // Pass allProjects for permissions
													/>
												);
											}
										})}
										{/* Show "more" link if there are more than 2 items */}
										{dateItems.length > 2 && (
											<div
												className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 pl-1 font-medium cursor-pointer hover:underline"
												onClick={(e) => {
													e.stopPropagation();

													// Get button position for smart positioning
													const rect =
														e.currentTarget.getBoundingClientRect();
													const position = {
														top: rect.top,
														bottom: rect.bottom,
														left: rect.left,
														right: rect.right,
													};

													onShowMoreClick(
														date,
														position
													);
												}}
											>
												{dateItems.length - 2} more...
											</div>
										)}
									</div>
								</DroppableDay>
							);
						})}
					</div>
				</motion.div>
			</div>
			{/* DragOverlay styled exactly like event/card */}
			{createPortal(
				<DragOverlay dropAnimation={null}>
					{activeEvent ? (
						<DraggableEvent
							event={activeEvent}
							onEventClick={() => {}} // No-op for drag overlay
							getEventStyle={(e) =>
								e.isMultiDay
									? getMultiDayEventStyle(e)
									: getEventStyle(e)
							}
							style={{
								maxWidth: "280px",
								opacity: 0.9,
								boxShadow:
									"0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
								transform: "rotate(2deg)", // Slight rotation to indicate dragging
							}}
							showIcons={true}
							currentUserId={currentUserId}
							currentUserEmail={currentUserEmail}
							allProjects={allProjects} // Pass allProjects for permissions
							resizable={false} // Disable resize handles in drag overlay
						/>
					) : null}
					{activeCard ? (
						<DraggableCard
							card={activeCard}
							onCardClick={() => {}} // No-op for drag overlay
							currentUserId={currentUserId}
							style={{
								maxWidth: "280px",
								opacity: 0.9,
								boxShadow:
									"0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
								transform: "rotate(2deg)", // Slight rotation to indicate dragging
							}}
						/>
					) : null}
				</DragOverlay>,
				document.body
			)}
			{/* MultipleEventsModal inside DndContext for drag and drop support */}
			{showMultipleEvents && (
				<MultipleEventsModal
					isOpen={showMultipleEvents}
					onClose={onCloseMultipleEvents}
					events={selectedDateEvents}
					cards={selectedDateCards}
					date={
						selectedDateEvents[0]?.date ||
						(selectedDateCards[0]?.dueDate
							? new Date(selectedDateCards[0].dueDate)
							: null)
					}
					position={selectedDatePosition}
					onEventClick={onEventClickFromModal}
					onCardClick={onCardClickFromModal}
					getEventStyle={getEventStyle}
					currentUserId={currentUserId}
					currentUserEmail={currentUserEmail}
					allProjects={allProjects}
				/>
			)}
		</DndContext>
	);
};

export default MonthView;
