import {
	useState,
	useMemo,
	useEffect,
	useRef,
	useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
	DndContext,
	useSensor,
	useSensors,
	PointerSensor,
	DragOverlay,
	useDroppable,
} from "@dnd-kit/core";
import DraggableEvent from "./DraggableEvent";
import MultipleEventsModal from "./MultipleEventsModal";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TIME_SLOT_HEIGHT_PX = 64; // Height of a 1-hour slot
const MINUTE_INTERVAL = 15;
const SLOTS_PER_HOUR = 60 / MINUTE_INTERVAL;

// Helper function to calculate layout for overlapping events
const calculateEventLayout = (sortedEventsInSlot) => {
	if (!sortedEventsInSlot || sortedEventsInSlot.length === 0) return [];

	const augmentedEvents = sortedEventsInSlot.map((e) => ({
		...e,
		_layout: { col: 0, numCols: 1 }, // Initialize layout properties
	}));

	// Assign columns: iterate through events and place them in the earliest possible column
	const columns = []; // Each element stores the end time of the last event in that column
	for (const event of augmentedEvents) {
		let placed = false;
		for (let i = 0; i < columns.length; i++) {
			if (new Date(event.startTime).getTime() >= columns[i]) {
				event._layout.col = i;
				columns[i] = new Date(event.endTime).getTime();
				placed = true;
				break;
			}
		}
		if (!placed) {
			event._layout.col = columns.length;
			columns.push(new Date(event.endTime).getTime());
		}
	}

	// Determine numCols for each event's overlapping group
	for (let i = 0; i < augmentedEvents.length; i++) {
		let maxColForGroup = 0;
		const currentEvent = augmentedEvents[i];
		const currentEventStart = new Date(currentEvent.startTime).getTime();
		const currentEventEnd = new Date(currentEvent.endTime).getTime();

		for (let j = 0; j < augmentedEvents.length; j++) {
			const otherEvent = augmentedEvents[j];
			const otherEventStart = new Date(otherEvent.startTime).getTime();
			const otherEventEnd = new Date(otherEvent.endTime).getTime();

			// Check for overlap
			if (
				Math.max(currentEventStart, otherEventStart) <
				Math.min(currentEventEnd, otherEventEnd)
			) {
				maxColForGroup = Math.max(
					maxColForGroup,
					otherEvent._layout.col
				);
			}
		}
		currentEvent._layout.numCols = maxColForGroup + 1;
	}

	return augmentedEvents.map((e) => {
		const finalLayout = e._layout;
		delete e._layout; // Clean up temporary property
		return {
			...e,
			layout: { col: finalLayout.col, numCols: finalLayout.numCols },
		};
	});
};

// DroppableTimeSlot component with proper drop feedback
const DroppableTimeSlot = ({ id, children, className, onClick }) => {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div
			ref={setNodeRef}
			id={id}
			className={`${className} relative transition-colors duration-150 ${
				isOver
					? "bg-blue-50/30 dark:bg-blue-900/15 midnight:bg-blue-950/10"
					: ""
			}`}
			onClick={onClick}
		>
			{children}
			{isOver && (
				<div className="absolute inset-0 border border-blue-400/50 dark:border-blue-500/40 midnight:border-blue-400/30 rounded-sm pointer-events-none opacity-60"></div>
			)}
		</div>
	);
};

const DayView = ({
	currentDate,
	events = [],
	cards = [],
	isToday,
	_isSelectedDate,
	_getEventStyle,
	onEventClick,
	onCardClick,
	handleTimeSlotClick,
	handleShowMoreClick,
	getCurrentTimePosition,
	onEventUpdate,
	onCardUpdate, // Add handler for card updates
	_fetchEvents,
	currentTime, // Add currentTime prop
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
	// State for drag and drop functionality
	const [activeDragItem, setActiveDragItem] = useState(null);
	const [localEvents, setLocalEvents] = useState(events);
	const scrollContainerRef = useRef(null);

	useEffect(() => {
		setLocalEvents(events);
	}, [events]);

	// Configure sensors for drag and drop with lower activation constraint
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 4 }, // Consistent with WeekView
		})
	);

	// Add horizontal scroll handling for day navigation
	const containerRef = useRef(null);
	const isScrollingRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const indicatorTimeoutRef = useRef(null);

	// Scroll handling with debounce for day navigation
	const handleWheel = useCallback(
		(e) => {
			if (!onDateChange) return;

			// Only handle horizontal scrolling or horizontal-dominant scrolling
			const deltaY = e.deltaY;
			const deltaX = e.deltaX;
			const threshold = 15;

			const absY = Math.abs(deltaY);
			const absX = Math.abs(deltaX);

			// Only trigger day navigation if horizontal scroll is dominant or significant
			if (absX > threshold && absX >= absY * 0.7) {
				// Allow slightly more lenient horizontal detection
				e.preventDefault();

				// Debounce scroll events
				if (isScrollingRef.current) return;

				isScrollingRef.current = true;

				// Clear existing timeouts
				if (scrollTimeoutRef.current) {
					clearTimeout(scrollTimeoutRef.current);
				}
				if (indicatorTimeoutRef.current) {
					clearTimeout(indicatorTimeoutRef.current);
				}

				const newDate = new Date(currentDate);

				if (deltaX > 0) {
					// Scroll right - next day
					newDate.setDate(newDate.getDate() + 1);
				} else {
					// Scroll left - previous day
					newDate.setDate(newDate.getDate() - 1);
				}

				onDateChange(newDate);

				// Hide indicator quickly (400ms)
				indicatorTimeoutRef.current = setTimeout(() => {
					isScrollingRef.current = false;
				}, 400);

				// Reset scrolling flag after longer delay for debouncing
				scrollTimeoutRef.current = setTimeout(() => {
					// This ensures we don't process more scroll events too quickly
				}, 800);
			}
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
	}, [handleWheel]);

	// Touch/swipe handling for mobile - horizontal swipes for day navigation
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

		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);

		// Only handle horizontal swipes for day navigation
		if (absX > minSwipeDistance && absX >= absY) {
			const newDate = new Date(currentDate);

			if (deltaX > 0) {
				// Swipe left - next day
				newDate.setDate(newDate.getDate() + 1);
			} else {
				// Swipe right - previous day
				newDate.setDate(newDate.getDate() - 1);
			}

			onDateChange(newDate);
		}
	}, [touchStart, touchEnd, currentDate, onDateChange]);

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

	// Auto-scroll to business hours on mount/date change
	useEffect(() => {
		if (scrollContainerRef.current) {
			// Each time slot is TIME_SLOT_HEIGHT_PX high
			// Scroll to 8 AM (index 8) - adjust as needed
			const businessHourStart = 8;
			const scrollTop = businessHourStart * TIME_SLOT_HEIGHT_PX;
			scrollContainerRef.current.scrollTop = scrollTop;
		}
	}, [currentDate]); // Re-scroll when date changes

	// Process events for day view - Enhanced based on WeekView
	const processDayViewEvents = () => {
		const selectedDay = new Date(currentDate);
		selectedDay.setHours(0, 0, 0, 0);

		const dayEnd = new Date(selectedDay);
		dayEnd.setHours(23, 59, 59, 999);

		const eventsByHour = {};
		const allDayEvents = [];

		localEvents.forEach((event) => {
			let startDate, endDate;

			try {
				// More robust date parsing
				if (event.startTime && event.endTime) {
					startDate = new Date(event.startTime);
					endDate = new Date(event.endTime);
				} else if (event.date) {
					// Handle legacy format
					const eventDate = new Date(event.date);
					startDate = new Date(eventDate);
					endDate = new Date(eventDate);

					if (event.start && event.end) {
						const [startHour, startMin] = event.start
							.split(":")
							.map(Number);
						const [endHour, endMin] = event.end
							.split(":")
							.map(Number);
						startDate.setHours(startHour, startMin, 0, 0);
						endDate.setHours(endHour, endMin, 0, 0);
					} else {
						// Default to 9 AM - 10 AM if no time specified
						startDate.setHours(9, 0, 0, 0);
						endDate.setHours(10, 0, 0, 0);
					}
				} else {
					return; // Skip this event
				}

				// Validate parsed dates
				if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
					return; // Skip this event
				}
			} catch (e) {
				console.error(
					`Error parsing dates for event ${event.id}:`,
					e,
					event
				);
				return; // Skip this event
			}

			const isMultiDay =
				startDate.toDateString() !== endDate.toDateString();

			// Check if event overlaps with the current day
			// Event overlaps if: startDate <= dayEnd AND endDate >= selectedDay
			const overlapsWithDay =
				startDate <= dayEnd && endDate >= selectedDay;

			if (overlapsWithDay) {
				if (isMultiDay || event.isAllDay) {
					// Multi-day or all-day events go to all-day section
					const isFirstDay =
						startDate.toDateString() === selectedDay.toDateString();
					const isLastDay =
						endDate.toDateString() === selectedDay.toDateString();

					allDayEvents.push({
						...event,
						isMultiDay: isMultiDay,
						isAllDay: event.isAllDay || false,
						isFirstDay,
						isLastDay,
						displayDate: new Date(selectedDay),
						multiDayPosition: isFirstDay
							? "start"
							: isLastDay
							? "end"
							: "middle",
						startTime: startDate.toISOString(),
						endTime: endDate.toISOString(),
						date: startDate.toISOString().split("T")[0],
						start: startDate.toTimeString().slice(0, 5),
						end: endDate.toTimeString().slice(0, 5),
					});
				} else {
					// Single-day timed events
					const hourKey = startDate.getHours().toString();

					if (!eventsByHour[hourKey]) {
						eventsByHour[hourKey] = [];
					}

					eventsByHour[hourKey].push({
						...event,
						isMultiDay: false,
						startTime: startDate.toISOString(),
						endTime: endDate.toISOString(),
						date: startDate.toISOString().split("T")[0],
						start: startDate.toTimeString().slice(0, 5),
						end: endDate.toTimeString().slice(0, 5),
					});
				}
			}
		});

		// Process cards for this day
		const cardsByHour = {};

		cards.forEach((card) => {
			if (!card.dueDate) return;

			const dueDate = new Date(card.dueDate);

			if (dueDate.toDateString() === selectedDay.toDateString()) {
				if (!cardsByHour["all-day"]) {
					cardsByHour["all-day"] = [];
				}

				cardsByHour["all-day"].push(card);
			}
		});

		// Calculate layout for timed events
		const finalEventsByHour = {};
		for (const hourKey in eventsByHour) {
			let hourlyEvents = eventsByHour[hourKey];

			// Sort by start time primarily, then by duration (longer events first)
			hourlyEvents.sort((a, b) => {
				const startA = new Date(a.startTime).getTime();
				const startB = new Date(b.startTime).getTime();
				if (startA !== startB) return startA - startB;
				const durationA = new Date(a.endTime).getTime() - startA;
				const durationB = new Date(b.endTime).getTime() - startB;
				return durationB - durationA;
			});

			finalEventsByHour[hourKey] = calculateEventLayout(hourlyEvents);
		}

		return { eventsByHour: finalEventsByHour, allDayEvents, cardsByHour };
	};

	const { eventsByHour, allDayEvents, cardsByHour } = processDayViewEvents();

	// Calculate layout for all timed events on the current day
	const eventLayouts = useMemo(() => {
		const dayStart = new Date(currentDate);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(currentDate);
		dayEnd.setHours(23, 59, 59, 999);

		const dayStartMs = dayStart.getTime();
		const dayEndMs = dayEnd.getTime();

		const relevantEvents = localEvents
			.filter((event) => {
				if (
					event.isAllDay ||
					event.isMultiDay ||
					!event.startTime ||
					!event.endTime
				)
					return false; // Exclude multi-day events
				try {
					const start = new Date(event.startTime).getTime();
					const end = new Date(event.endTime).getTime();
					// Event must overlap with the current day
					return start < dayEndMs && end > dayStartMs;
				} catch (e) {
					return false;
				}
			})
			.map((event) => {
				const originalStart = new Date(event.startTime).getTime();
				const originalEnd = new Date(event.endTime).getTime();

				return {
					...event,
					// Clip event times to the current day's boundaries for layout calculation
					_layoutStartMs: Math.max(originalStart, dayStartMs),
					_layoutEndMs: Math.min(originalEnd, dayEndMs),
				};
			})
			// Filter out events that, after clipping, have no duration on this day
			.filter((event) => event._layoutStartMs < event._layoutEndMs)
			.sort((a, b) => {
				if (a._layoutStartMs !== b._layoutStartMs) {
					return a._layoutStartMs - b._layoutStartMs;
				}
				// If start times are the same, longer events first
				return (
					b._layoutEndMs -
					b._layoutStartMs -
					(a._layoutEndMs - a._layoutStartMs)
				);
			});

		if (relevantEvents.length === 0) {
			return new Map();
		}

		// Initialize layout property
		relevantEvents.forEach((event) => {
			event._layout = { column: 0, numColumns: 1 };
		});

		// Assign column index
		// columnsData stores the end time of the last event in each column
		const columnsData = [];
		for (const event of relevantEvents) {
			let placed = false;
			for (let i = 0; i < columnsData.length; i++) {
				if (event._layoutStartMs >= columnsData[i]) {
					columnsData[i] = event._layoutEndMs;
					event._layout.column = i;
					placed = true;
					break;
				}
			}
			if (!placed) {
				columnsData.push(event._layoutEndMs);
				event._layout.column = columnsData.length - 1;
			}
		}

		// Assign numColumns
		for (let i = 0; i < relevantEvents.length; i++) {
			const eventI = relevantEvents[i];
			let maxOverlappingColumnIndex = eventI._layout.column;
			for (let j = 0; j < relevantEvents.length; j++) {
				if (i === j) continue;
				const eventJ = relevantEvents[j];

				// Check for overlap
				const overlap =
					eventI._layoutStartMs < eventJ._layoutEndMs &&
					eventI._layoutEndMs > eventJ._layoutStartMs;

				if (overlap) {
					maxOverlappingColumnIndex = Math.max(
						maxOverlappingColumnIndex,
						eventJ._layout.column
					);
				}
			}
			eventI._layout.numColumns = maxOverlappingColumnIndex + 1;
		}

		// Second pass to ensure all events in an overlapping group share the same numColumns
		for (const eventI of relevantEvents) {
			let trueNumColumns = eventI._layout.numColumns;
			for (const eventJ of relevantEvents) {
				if (eventI === eventJ) continue; // Compare with other events
				const overlap =
					eventI._layoutStartMs < eventJ._layoutEndMs &&
					eventI._layoutEndMs > eventJ._layoutStartMs;
				if (overlap) {
					// eventJ._layout.numColumns here is from the first pass calculation for eventJ
					trueNumColumns = Math.max(
						trueNumColumns,
						eventJ._layout.numColumns
					);
				}
			}
			eventI._layout.numColumns = trueNumColumns;
		}
		// At this point, eventI._layout.numColumns is the effective width of its collision group.
		// And eventI._layout.column is its assigned column index within that group.

		// Calculate colspan for each event to allow stretching into free adjacent columns
		for (const eventI of relevantEvents) {
			eventI._layout.colspan = 1; // Default: spans its own column
			// Check subsequent columns to the right, up to the boundary of its group (numColumns)
			for (
				let k = eventI._layout.column + 1;
				k < eventI._layout.numColumns;
				k++
			) {
				let columnKIsBlockedForEventI = false;
				// Is column 'k' occupied by any other event 'eventJ' that overlaps in time with 'eventI'?
				for (const eventJ of relevantEvents) {
					if (eventI === eventJ) continue;

					if (eventJ._layout.column === k) {
						// eventJ is in the column we are checking
						const eventJOverlapsEventI =
							eventI._layoutStartMs < eventJ._layoutEndMs &&
							eventI._layoutEndMs > eventJ._layoutStartMs;

						if (eventJOverlapsEventI) {
							columnKIsBlockedForEventI = true;
							break; // Column k is blocked for eventI by eventJ
						}
					}
				}

				if (columnKIsBlockedForEventI) {
					break; // eventI cannot span over column k
				} else {
					eventI._layout.colspan++; // eventI can extend its span over column k
				}
			}
		}

		const layoutMap = new Map();
		relevantEvents.forEach((event) => {
			layoutMap.set(event.id, {
				column: event._layout.column,
				numColumns: event._layout.numColumns, // Group's total columns
				colspan: event._layout.colspan, // How many columns this specific event spans
			});
		});

		return layoutMap;
	}, [localEvents, currentDate]);

	// Helper function to calculate display height for events in overlay - from WeekView
	const getEventDisplayHeight = (event) => {
		if (!event || event.isAllDay || !event.startTime || !event.endTime) {
			return "50px"; // Default height for all-day or events without specific times
		}
		try {
			const start = new Date(event.startTime);
			const end = new Date(event.endTime);
			if (
				isNaN(start.getTime()) ||
				isNaN(end.getTime()) ||
				start >= end
			) {
				return "50px"; // Fallback for invalid dates
			}
			const durationMinutes =
				(end.getTime() - start.getTime()) / (1000 * 60);

			// Assuming 1 hour slot is TIME_SLOT_HEIGHT_PX
			const hourSlotHeight = TIME_SLOT_HEIGHT_PX;
			const height = (durationMinutes / 60) * hourSlotHeight;

			return `${Math.max(height, 30)}px`; // Minimum height for very short events
		} catch (e) {
			console.error(
				"Error calculating event display height for overlay:",
				e
			);
			return "50px";
		}
	};

	// Get appropriate styling for multi-day events - from WeekView
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
	// Get card priority style - from WeekView
	const getCardPriorityStyle = (priority) => {
		switch (priority?.toLowerCase()) {
			case "high":
				return "bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-l-4 border-red-500 text-red-800 dark:text-red-200 shadow-sm";
			case "medium":
				return "bg-gradient-to-r from-amber-50 to-orange-100 dark:from-amber-900/30 dark:to-orange-800/20 border-l-4 border-amber-500 text-amber-800 dark:text-amber-200 shadow-sm";
			case "low":
				return "bg-gradient-to-r from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-800/20 border-l-4 border-green-500 text-green-800 dark:text-green-200 shadow-sm";
			default:
				return "bg-gradient-to-r from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-800/20 border-l-4 border-blue-500 text-blue-800 dark:text-blue-200 shadow-sm";
		}
	};

	// Generate time slots for the day
	const timeSlots = useMemo(() => {
		return Array.from(
			{ length: 24 },
			(_, i) => `${i.toString().padStart(2, "0")}:00`
		);
	}, []);

	// Handle drag start - Enhanced from WeekView
	const handleDragStart = (event) => {
		const { active } = event;

		// Close modal when drag starts
		if (showMultipleEvents) {
			onCloseMultipleEvents();
		}

		const type = active.data?.current?.type || "drag";
		const eventData =
			active.data?.current?.event ||
			localEvents.find((e) => e.id === active.id);

		if (!eventData) {
			console.error(
				"Could not find event data for active item:",
				active.id
			);
			return;
		}

		setActiveDragItem({
			originalEvent: eventData,
			currentEvent: eventData,
			type: type,
		});
	};

	const handleDragOver = (event) => {
		const { over } = event;
		if (!over || !activeDragItem) return;

		const { originalEvent, type } = activeDragItem;

		const matches = String(over.id).match(/hour-(\d+)-minute-(\d+)/);
		if (!matches) return;

		const [_, hourIndex, minuteIndex] = matches.map(Number);

		const targetDay = new Date(currentDate);
		targetDay.setHours(hourIndex, minuteIndex * MINUTE_INTERVAL, 0, 0);

		let newStartDate, newEndDate;

		if (type === "drag") {
			const originalStart = new Date(originalEvent.startTime);
			const originalEnd = new Date(originalEvent.endTime);
			const duration = originalEnd.getTime() - originalStart.getTime();
			newStartDate = new Date(targetDay);
			newEndDate = new Date(newStartDate.getTime() + duration);

			setActiveDragItem((prev) => ({
				...prev,
				currentEvent: {
					...originalEvent,
					startTime: newStartDate.toISOString(),
					endTime: newEndDate.toISOString(),
				},
			}));
		} else if (type === "resize-bottom") {
			newStartDate = new Date(originalEvent.startTime);
			newEndDate = new Date(targetDay);
			newEndDate.setMinutes(newEndDate.getMinutes() + MINUTE_INTERVAL);
			if (newEndDate <= newStartDate) {
				newEndDate = new Date(
					newStartDate.getTime() + MINUTE_INTERVAL * 60000
				);
			}
			setLocalEvents((currentEvents) =>
				currentEvents.map((e) =>
					e.id === originalEvent.id
						? { ...e, endTime: newEndDate.toISOString() }
						: e
				)
			);
		} else if (type === "resize-top") {
			newEndDate = new Date(originalEvent.endTime);
			newStartDate = new Date(targetDay);
			if (newStartDate >= newEndDate) {
				newStartDate = new Date(
					newEndDate.getTime() - MINUTE_INTERVAL * 60000
				);
			}
			setLocalEvents((currentEvents) =>
				currentEvents.map((e) =>
					e.id === originalEvent.id
						? { ...e, startTime: newStartDate.toISOString() }
						: e
				)
			);
		}
	};

	// Handle drag end - OPTIMIZED VERSION
	const handleDragEnd = async (event) => {
		const { over } = event;

		if (!over || !activeDragItem) {
			setActiveDragItem(null);
			return;
		}

		const { originalEvent, type } = activeDragItem;

		// Clear drag state immediately for faster UI response
		setActiveDragItem(null);

		if (type.includes("resize")) {
			const resizedEvent = localEvents.find(
				(e) => e.id === originalEvent.id
			);
			if (resizedEvent) {
				// Fire and forget - don't await to avoid blocking UI
				onEventUpdate(resizedEvent).catch((error) => {
					console.error("Error updating event:", error);
				});
			}
			return;
		}

		try {
			const matches = String(over.id).match(/hour-(\d+)-minute-(\d+)/);
			if (!matches) {
				console.error("Invalid drop target format:", over.id);
				return;
			}

			const [_, hourIndex, minuteIndex] = matches.map(Number);

			const targetDay = new Date(currentDate);
			targetDay.setHours(hourIndex, minuteIndex * MINUTE_INTERVAL, 0, 0);

			let updatedEventData = { ...originalEvent };

			if (type === "drag") {
				const originalStart = new Date(originalEvent.startTime);
				const originalEnd = new Date(originalEvent.endTime);
				const duration =
					originalEnd.getTime() - originalStart.getTime();

				const newStartDate = new Date(targetDay);
				const newEndDate = new Date(newStartDate.getTime() + duration);

				updatedEventData.startTime = newStartDate.toISOString();
				updatedEventData.endTime = newEndDate.toISOString();
				updatedEventData.date = newStartDate
					.toISOString()
					.split("T")[0];
			}

			// Fire and forget - don't await to avoid blocking UI
			onEventUpdate(updatedEventData).catch((error) => {
				console.error("Error updating event:", error);
			});
		} catch (error) {
			console.error("Error updating event:", error);
		}
	};

	// Calculate all cards for the day
	const dayCards = cardsByHour["all-day"] || [];

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
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
				{/* Day transition indicator */}
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
									{currentDate?.toLocaleDateString(
										undefined,
										{
											weekday: "long",
											month: "long",
											day: "numeric",
										}
									)}
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Header with day name and date - Enhanced styling */}
				<div className="sticky top-0 z-10 bg-white border-b dark:bg-gray-900 midnight:bg-gray-950 border-gray-200 dark:border-gray-700 midnight:border-gray-800">
					<div className="grid grid-cols-1 px-4 py-2">
						<div
							className={`text-center ${
								isToday(currentDate)
									? "text-blue-600"
									: "text-gray-500 dark:text-gray-400 midnight:text-gray-400"
							}`}
						>
							{/* Single div to hold both, will be centered by parent's text-center. Use inline-flex for items to sit side-by-side. */}
							<div className="inline-flex items-center space-x-2">
								<span className="text-base font-medium">
									{new Date(currentDate).toLocaleString(
										"default",
										{ weekday: "long" }
									)}
								</span>
								<span
									className={`text-lg font-semibold w-8 h-8 flex items-center justify-center rounded-md ${
										isToday(currentDate)
											? "bg-blue-100 text-blue-700"
											: "text-gray-700 dark:text-gray-300"
									}`}
								>
									{currentDate.getDate()}
								</span>
							</div>
						</div>
					</div>
					{/* All-day & multi-day events section - Enhanced like WeekView */}
					{(allDayEvents.length > 0 || dayCards.length > 0) && (
						<div className="border-t border-gray-200/60 dark:border-gray-700/60 midnight:border-gray-800/60 px-6 py-3 bg-gradient-to-r from-indigo-50/30 to-purple-50/30 dark:from-indigo-900/10 dark:to-purple-900/10">
							<div className="text-sm text-gray-600 dark:text-gray-400 font-semibold mb-2 flex items-center">
								<div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
								All-day Events
							</div>
							<div className="space-y-2">
								{/* Show multi-day events first */}
								{allDayEvents.slice(0, 2).map((event) => (
									<DraggableEvent
										key={event.id}
										event={event}
										onEventClick={onEventClick}
										getEventStyle={(e) =>
											e.isMultiDay
												? getMultiDayEventStyle(e)
												: getEventStyle(e)
										}
										style={{
											marginLeft:
												event.isMultiDay &&
												!event.isFirstDay
													? "-0.5rem"
													: "0",
											marginRight:
												event.isMultiDay &&
												!event.isLastDay
													? "-0.5rem"
													: "0",
										}}
										showIcons={true}
										resizable={false}
										compact={true}
										currentUserId={currentUserId}
										currentUserEmail={currentUserEmail}
										allProjects={allProjects} // Pass allProjects for permissions
									/>
								))}

								{/* Show cards if space */}
								{allDayEvents.length < 2 &&
									dayCards
										.slice(0, 2 - allDayEvents.length)
										.map((card) => (
											<div
												key={`card-${card.id}`}
												onClick={(e) => {
													e.stopPropagation();
													onCardClick(card);
												}}
												className={`${getCardPriorityStyle(
													card.priority
												)} text-sm p-3 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] border border-white/20`}
											>
												<div className="font-medium">
													{card.title}
												</div>
												{card.description && (
													<div className="text-xs opacity-75 mt-1 truncate">
														{card.description}
													</div>
												)}
											</div>
										))}

								{/* Show "more" if needed */}
								{allDayEvents.length + dayCards.length > 2 && (
									<div
										className="text-sm text-indigo-600 dark:text-indigo-400 pl-3 cursor-pointer hover:underline font-medium flex items-center transition-colors"
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

											handleShowMoreClick(
												currentDate,
												_position
											);
										}}
									>
										<Plus className="w-4 h-4 mr-1" />
										{allDayEvents.length +
											dayCards.length -
											2}{" "}
										more events
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				{/* Time slots grid - Enhanced with scrollbar hiding like WeekView */}
				<div
					ref={scrollContainerRef}
					className="flex-1 overflow-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-800/30 midnight:to-gray-900/40"
				>
					<div className="grid grid-cols-1 divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800">
						<div className="relative">
							{/* Current time indicator */}
							{isToday(currentDate) && (
								<div
									className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
									style={{
										top: `${getCurrentTimePosition()}px`,
									}}
								>
									<div className="border-t-2 border-red-500 w-full shadow-sm" />
									<div className="absolute right-1 -top-2.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium shadow-md whitespace-nowrap">
										{currentTime.toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
											hour12: false,
										})}
									</div>
								</div>
							)}

							{/* Background Grid and Time Labels */}
							<div className="grid grid-cols-1 divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800">
								{timeSlots.map((time, hourIndex) => (
									<div
										key={time}
										className="h-16 relative flex group"
									>
										<div className="w-20 flex-shrink-0 text-center p-1">
											<div className="text-xs text-gray-500">
												{time}
											</div>
										</div>
										<div className="flex-grow relative">
											<div className="absolute inset-0 grid grid-rows-4">
												{Array.from({
													length: SLOTS_PER_HOUR,
												}).map((_, minuteIdx) => {
													const slotId = `hour-${hourIndex}-minute-${minuteIdx}`;
													return (
														<DroppableTimeSlot
															key={slotId}
															id={slotId}
															className="h-full"
														/>
													);
												})}
											</div>
											<button
												onClick={() => {
													handleTimeSlotClick(
														currentDate,
														hourIndex
													);
												}}
												className="absolute inset-0 z-10 flex items-center justify-center w-full h-full transition-opacity duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
											>
												<div className="bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-800/90 rounded-full p-1.5 shadow-md">
													<Plus className="w-5 h-5 text-gray-500 dark:text-gray-400" />
												</div>
											</button>
										</div>
									</div>
								))}
							</div>

							{/* Events Container */}
							<div className="absolute top-0 left-20 right-0 bottom-0">
								<div className="relative h-full">
									{" "}
									{localEvents
										.filter(
											(event) =>
												!event.isAllDay &&
												!event.isMultiDay
										) // Exclude both all-day and multi-day events
										.filter((event) => {
											// Hide the event only if it's being dragged (moved), not resized
											return (
												!activeDragItem ||
												activeDragItem.originalEvent
													.id !== event.id ||
												activeDragItem.type !== "drag"
											);
										})
										.map((event) => {
											const layout = eventLayouts.get(
												event.id
											);
											if (!layout) return null;

											const start = new Date(
												event.startTime
											);
											const end = new Date(event.endTime);

											const top =
												((start.getHours() * 60 +
													start.getMinutes()) /
													(24 * 60)) *
												(TIME_SLOT_HEIGHT_PX * 24);
											const durationMinutes =
												(end - start) / (1000 * 60);
											const height =
												(durationMinutes / 60) *
												TIME_SLOT_HEIGHT_PX;

											const width = `${
												(100 / layout.numColumns) *
												layout.colspan
											}%`;
											const left = `${
												(100 / layout.numColumns) *
												layout.column
											}%`;

											return (
												<div
													key={event.id}
													style={{
														position: "absolute",
														top: `${top}px`,
														height: `${height}px`,
														left: `calc(${left} + 4px)`,
														width: `calc(${width} - 8px)`,
														zIndex:
															20 + layout.column,
													}}
												>
													<DraggableEvent
														event={event}
														onEventClick={
															onEventClick
														}
														getEventStyle={
															getEventStyle
														}
														style={{
															height: "100%",
															width: "100%",
														}}
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
												</div>
											);
										})}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Enhanced Drag Overlay - Optimized */}
			{createPortal(
				<DragOverlay dropAnimation={null}>
					{activeDragItem && activeDragItem.type === "drag" ? (
						<DraggableEvent
							event={activeDragItem.currentEvent}
							onEventClick={() => {}} // No-op for drag overlay
							getEventStyle={getEventStyle}
							style={{
								width: "98%", // Match the width used in the original overlay
								height: getEventDisplayHeight(
									activeDragItem.currentEvent
								),
								opacity: 0.9,
								boxShadow:
									"0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
								transform: "rotate(2deg)", // Slight rotation to indicate dragging
							}}
							showIcons={true}
							resizable={false} // Disable resize handles in drag overlay
							currentUserId={currentUserId}
							currentUserEmail={currentUserEmail}
							allProjects={allProjects} // Pass allProjects for permissions
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
					onEventUpdate={onEventUpdate}
					onCardUpdate={onCardUpdate}
				/>
			)}
		</DndContext>
	);
};

export default DayView;
