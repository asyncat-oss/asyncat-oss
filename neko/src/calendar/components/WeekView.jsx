import {
	useMemo,
	useState,
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
import DraggableCard from "./DraggableCard";
import MultipleEventsModal from "./MultipleEventsModal";
import { DAYS_OF_WEEK } from "../data/CalendarConstants";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TIME_SLOT_HEIGHT_PX = 64; // Height of a 1-hour slot
const MINUTE_INTERVAL = 15;
const SLOTS_PER_HOUR = 60 / MINUTE_INTERVAL;

// New DroppableTimeSlot component to properly register drop targets
const DroppableTimeSlot = ({ id, children, className, onClick }) => {
	const { setNodeRef, isOver } = useDroppable({ id }); // Utilize isOver from useDroppable

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

// New DroppableAllDay component for all-day sections
const DroppableAllDay = ({
	id,
	children,
	className,
	onClick,
	showDropZone = false,
}) => {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div
			ref={setNodeRef}
			id={id}
			className={`${className} relative transition-colors duration-150 ${
				showDropZone && isOver
					? "bg-blue-50/30 dark:bg-blue-900/15 midnight:bg-blue-950/10"
					: ""
			}`}
			onClick={onClick}
		>
			{children}
			{showDropZone && isOver && (
				<div className="absolute inset-0 border-2 border border-blue-400/60 dark:border-blue-500/50 midnight:border-blue-400/40 rounded-sm pointer-events-none">
					<div className="absolute inset-0 bg-blue-50/20 dark:bg-blue-900/10 midnight:bg-blue-950/5 rounded-sm"></div>
				</div>
			)}
		</div>
	);
};

const WeekView = ({
	currentDate,
	events = [],
	cards = [],
	isToday,
	isSelectedDate,
	getEventStyle,
	onEventClick,
	onCardClick,
	handleTimeSlotClick,
	handleShowMoreClick,
	getCurrentTimePosition,
	onEventUpdate,
	onCardUpdate, // Add handler for card updates
	fetchEvents,
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
	const [activeCard, setActiveCard] = useState(null); // Add state for active card
	const [localEvents, setLocalEvents] = useState(events);
	const scrollContainerRef = useRef(null);

	useEffect(() => {
		setLocalEvents(events);
	}, [events]);

	// Configure sensors for drag and drop with lower activation constraint
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 4 }, // Reduced from 8 to make dragging easier
		})
	);

	// Add horizontal scroll handling for week navigation
	const containerRef = useRef(null);
	const isScrollingRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const indicatorTimeoutRef = useRef(null);

	// Scroll handling with debounce for week navigation
	const handleWheel = useCallback(
		(e) => {
			if (!onDateChange) return;

			// Only handle horizontal scrolling or horizontal-dominant scrolling
			const deltaY = e.deltaY;
			const deltaX = e.deltaX;
			const threshold = 15;

			const absY = Math.abs(deltaY);
			const absX = Math.abs(deltaX);

			// Only trigger week navigation if horizontal scroll is dominant or significant
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
					// Scroll right - next week
					newDate.setDate(newDate.getDate() + 7);
				} else {
					// Scroll left - previous week
					newDate.setDate(newDate.getDate() - 7);
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

	// Touch/swipe handling for mobile - horizontal swipes for week navigation
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

		// Only handle horizontal swipes for week navigation
		if (absX > minSwipeDistance && absX >= absY) {
			const newDate = new Date(currentDate);

			if (deltaX > 0) {
				// Swipe left - next week
				newDate.setDate(newDate.getDate() + 7);
			} else {
				// Swipe right - previous week
				newDate.setDate(newDate.getDate() - 7);
			}

			onDateChange(newDate);
		}
	}, [touchStart, touchEnd, currentDate, onDateChange]);

	// Keyboard navigation for week view
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
					newDate.setDate(newDate.getDate() - 7); // Previous week
					onDateChange(newDate);
					break;
				case "ArrowRight":
					e.preventDefault();
					newDate.setDate(newDate.getDate() + 7); // Next week
					onDateChange(newDate);
					break;
				case "PageUp":
					e.preventDefault();
					newDate.setDate(newDate.getDate() - 7); // Previous week
					onDateChange(newDate);
					break;
				case "PageDown":
					e.preventDefault();
					newDate.setDate(newDate.getDate() + 7); // Next week
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

	useEffect(() => {
		if (scrollContainerRef.current) {
			// Each time slot is TIME_SLOT_HEIGHT_PX high
			// Scroll to 8 AM (index 8) - adjust as needed
			const businessHourStart = 8;
			const scrollTop = businessHourStart * TIME_SLOT_HEIGHT_PX;
			scrollContainerRef.current.scrollTop = scrollTop;
		}
	}, [currentDate]); // Re-scroll when date changes
	// Process events to handle multi-day events spanning across the week
	const processWeekViewEvents = () => {
		const weekStart = new Date(currentDate);
		// For Monday-based week: Monday = 1, Tuesday = 2, ..., Sunday = 0
		const dayOfWeek = currentDate.getDay();
		const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0, etc.
		weekStart.setDate(currentDate.getDate() - mondayOffset);
		weekStart.setHours(0, 0, 0, 0);

		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 6);
		weekEnd.setHours(23, 59, 59, 999);

		// Store all events by day and time slot
		const eventsByDayAndTime = {};
		// Store all cards by day and time slot
		const cardsByDayAndTime = {};

		for (let i = 0; i < 7; i++) {
			const currentDay = new Date(weekStart);
			currentDay.setDate(weekStart.getDate() + i);
			eventsByDayAndTime[currentDay.toDateString()] = {};
			cardsByDayAndTime[currentDay.toDateString()] = {};
		}

		localEvents.forEach((event) => {
			// Handle different date formats with better error handling
			let startDate, endDate;

			try {
				if (event.startTime) {
					startDate = new Date(event.startTime);
				} else if (event.date && event.start) {
					startDate = new Date(`${event.date}T${event.start}`);
				} else {
					// Create a default date for the current day with 9 AM
					startDate = new Date(weekStart);
					startDate.setHours(9, 0, 0, 0);
				}

				if (event.endTime) {
					endDate = new Date(event.endTime);
				} else if (event.date && event.end) {
					endDate = new Date(`${event.date}T${event.end}`);
				} else {
					// Create a default end time 1 hour after start
					endDate = new Date(startDate);
					endDate.setHours(startDate.getHours() + 1);
				}
			} catch (e) {
				console.error(`Error parsing dates for event ${event.id}:`, e);
				// Provide fallbacks to prevent breaking the calendar
				startDate = new Date(weekStart);
				startDate.setHours(9, 0, 0, 0);
				endDate = new Date(weekStart);
				endDate.setHours(10, 0, 0, 0);
			}

			// Determine if it's a multi-day event
			const isMultiDay =
				startDate.toDateString() !== endDate.toDateString();

			// Check if any part of the event falls within the week
			if (startDate <= weekEnd && endDate >= weekStart) {
				// Iterate through each day the event spans within the week
				let currentDay = new Date(Math.max(startDate, weekStart));

				// Set hours to 0 to ensure we just look at the date part
				currentDay.setHours(0, 0, 0, 0);

				// Calculate end boundary (use earlier of weekEnd or event end date)
				const endBoundary = new Date(Math.min(endDate, weekEnd));
				endBoundary.setHours(23, 59, 59, 999);

				// Iterate through each day this event spans
				while (currentDay <= endBoundary) {
					const dayKey = currentDay.toDateString();
					const isFirstDay =
						currentDay.toDateString() === startDate.toDateString();
					const isLastDay =
						currentDay.toDateString() === endDate.toDateString();

					// For multi-day events, create special entries
					if (isMultiDay) {
						// Add to "all-day" section of this day
						if (!eventsByDayAndTime[dayKey]["all-day"]) {
							eventsByDayAndTime[dayKey]["all-day"] = [];
						}

						const dayEvent = {
							...event,
							isMultiDay: true,
							isFirstDay,
							isLastDay,
							displayDate: new Date(currentDay),
							// Special class for styling
							multiDayPosition: isFirstDay
								? "start"
								: isLastDay
								? "end"
								: "middle",
							// Ensure these properties are set for rendering
							startTime: startDate.toISOString(),
							endTime: endDate.toISOString(),
							date: startDate.toISOString().split("T")[0],
							start: startDate.toTimeString().slice(0, 5),
							end: endDate.toTimeString().slice(0, 5),
						};

						eventsByDayAndTime[dayKey]["all-day"].push(dayEvent);
					}
					// Single day events or events within their own day part
					else {
						const hourKey = startDate.getHours().toString();

						if (!eventsByDayAndTime[dayKey][hourKey]) {
							eventsByDayAndTime[dayKey][hourKey] = [];
						}

						eventsByDayAndTime[dayKey][hourKey].push({
							...event,
							isMultiDay: false,
							startTime: startDate.toISOString(),
							endTime: endDate.toISOString(),
							date: startDate.toISOString().split("T")[0],
							start: startDate.toTimeString().slice(0, 5),
							end: endDate.toTimeString().slice(0, 5),
						});
					}

					// Move to next day
					const nextDay = new Date(currentDay);
					nextDay.setDate(currentDay.getDate() + 1);
					currentDay = nextDay;
				}
			}
		});
		// Process cards for the week - only add to all-day section
		cards.forEach((card) => {
			if (!card.dueDate) return;

			const dueDate = new Date(card.dueDate);
			const dayKey = dueDate.toDateString();

			// Check if the card's due date falls within the week
			if (
				dueDate >= weekStart &&
				dueDate <= weekEnd &&
				cardsByDayAndTime[dayKey]
			) {
				// Only add to all-day section for visibility
				if (!cardsByDayAndTime[dayKey]["all-day"]) {
					cardsByDayAndTime[dayKey]["all-day"] = [];
				}

				cardsByDayAndTime[dayKey]["all-day"].push(card);
			}
		});

		return { eventsByDayAndTime, cardsByDayAndTime };
	};

	const { eventsByDayAndTime, cardsByDayAndTime } = processWeekViewEvents();
	const weekStart = new Date(currentDate);
	// For Monday-based week: Monday = 1, Tuesday = 2, ..., Sunday = 0
	const dayOfWeek = currentDate.getDay();
	const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0, etc.
	weekStart.setDate(currentDate.getDate() - mondayOffset);
	weekStart.setHours(0, 0, 0, 0); // Ensure weekStart is at the beginning of the day

	// Calculate layout for timed events for each day in the week
	const dailyEventLayouts = useMemo(() => {
		const layoutsByDay = new Map(); // Map<string (dateKey), Map<string (eventId), layout>>

		for (let i = 0; i < 7; i++) {
			const currentDayIter = new Date(weekStart);
			currentDayIter.setDate(weekStart.getDate() + i);
			// currentDayIter is already at 00:00:00.000 due to weekStart initialization and setDate

			const dayKey = currentDayIter.toDateString();

			const dayStartMs = currentDayIter.getTime();
			const dayEndMs = new Date(currentDayIter).setHours(23, 59, 59, 999);

			const eventsForThisDay = localEvents
				.filter((event) => {
					if (
						event.isAllDay ||
						event.isMultiDay ||
						!event.startTime ||
						!event.endTime
					)
						return false;
					try {
						const start = new Date(event.startTime).getTime();
						const end = new Date(event.endTime).getTime();
						return start < dayEndMs && end > dayStartMs; // Overlaps with currentDayIter
					} catch (e) {
						return false;
					}
				})
				.map((event) => {
					const originalStart = new Date(event.startTime).getTime();
					const originalEnd = new Date(event.endTime).getTime();
					return {
						...event,
						_layoutStartMs: Math.max(originalStart, dayStartMs),
						_layoutEndMs: Math.min(originalEnd, dayEndMs),
					};
				})
				.filter((event) => event._layoutStartMs < event._layoutEndMs) // Has duration on this day
				.sort((a, b) => {
					if (a._layoutStartMs !== b._layoutStartMs) {
						return a._layoutStartMs - b._layoutStartMs;
					}
					return (
						b._layoutEndMs -
						b._layoutStartMs -
						(a._layoutEndMs - a._layoutStartMs)
					);
				});

			if (eventsForThisDay.length === 0) {
				layoutsByDay.set(dayKey, new Map());
				continue;
			}

			eventsForThisDay.forEach((event) => {
				event._layout = { column: 0, numColumns: 1 };
			});

			const columnsData = [];
			for (const event of eventsForThisDay) {
				let placed = false;
				for (let j = 0; j < columnsData.length; j++) {
					if (event._layoutStartMs >= columnsData[j]) {
						columnsData[j] = event._layoutEndMs;
						event._layout.column = j;
						placed = true;
						break;
					}
				}
				if (!placed) {
					columnsData.push(event._layoutEndMs);
					event._layout.column = columnsData.length - 1;
				}
			}

			for (let j = 0; j < eventsForThisDay.length; j++) {
				const eventI = eventsForThisDay[j];
				let maxOverlappingColumnIndex = eventI._layout.column;
				for (let k = 0; k < eventsForThisDay.length; k++) {
					if (j === k) continue;
					const eventJ = eventsForThisDay[k];
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

			for (const eventI of eventsForThisDay) {
				let trueNumColumns = eventI._layout.numColumns;
				for (const eventJ of eventsForThisDay) {
					if (eventI === eventJ) continue;
					const overlap =
						eventI._layoutStartMs < eventJ._layoutEndMs &&
						eventI._layoutEndMs > eventJ._layoutStartMs;
					if (overlap) {
						trueNumColumns = Math.max(
							trueNumColumns,
							eventJ._layout.numColumns
						);
					}
				}
				eventI._layout.numColumns = trueNumColumns;
			}

			// Calculate colspan for each event to allow stretching
			for (const eventI of eventsForThisDay) {
				eventI._layout.colspan = 1; // Default span
				for (
					let k = eventI._layout.column + 1;
					k < eventI._layout.numColumns;
					k++
				) {
					let columnKIsBlocked = false;
					for (const eventJ of eventsForThisDay) {
						if (eventI === eventJ) continue;
						if (eventJ._layout.column === k) {
							const eventJOverlapsEventI =
								eventI._layoutStartMs < eventJ._layoutEndMs &&
								eventI._layoutEndMs > eventJ._layoutStartMs;
							if (eventJOverlapsEventI) {
								columnKIsBlocked = true;
								break;
							}
						}
					}
					if (columnKIsBlocked) {
						break;
					} else {
						eventI._layout.colspan++;
					}
				}
			}

			const dayLayoutMap = new Map();
			eventsForThisDay.forEach((event) => {
				dayLayoutMap.set(event.id, {
					column: event._layout.column,
					numColumns: event._layout.numColumns,
					colspan: event._layout.colspan,
				});
			});
			layoutsByDay.set(dayKey, dayLayoutMap);
		}
		return layoutsByDay;
	}, [localEvents, weekStart]);

	// Get time slots
	const timeSlots = useMemo(() => {
		return Array.from(
			{ length: 24 },
			(_, i) => `${i.toString().padStart(2, "0")}:00`
		);
	}, []);

	// Helper function to calculate display height for events in overlay
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

	// Handle drag start
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
			return;
		}

		// Handle event dragging (existing logic, but support modal-provided raw event data)
		const rawData = active.data?.current;
		const type =
			rawData?.type &&
			(rawData.type === "resize-top" || rawData.type === "resize-bottom")
				? rawData.type
				: "drag"; // Default to 'drag'

		let eventData = null;
		if (rawData && rawData.event) {
			eventData = rawData.event; // Resize handles provide { type, event }
		} else if (rawData && rawData.id) {
			eventData = rawData; // Modal DraggableEvent passes the event object directly
		} else {
			// Fallback: find by id, supporting modal id prefix
			const idStr = String(active.id);
			const plainId = idStr.startsWith("modal-event-")
				? idStr.replace("modal-event-", "")
				: idStr;
			eventData = events.find((e) => String(e.id) === plainId);
		}

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

		const matches = String(over.id).match(
			/day-(\d+)-hour-(\d+)-minute-(\d+)/
		);
		if (!matches) return;

		const [_, dayIndex, hourIndex, minuteIndex] = matches.map(Number);

		const targetDay = new Date(weekStart);
		targetDay.setDate(weekStart.getDate() + dayIndex);
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
		const { over, active } = event;

		if (!over) {
			setActiveDragItem(null);
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
				// Handle dropping on all-day section
				if (over.id.startsWith("all-day-")) {
					const dayIndex = parseInt(over.id.replace("all-day-", ""));
					const targetDate = new Date(weekStart);
					targetDate.setDate(weekStart.getDate() + dayIndex);

					// Update card due date
					const updatedCardData = {
						...draggedCard,
						dueDate: targetDate.toISOString(),
					};

					// Fire and forget - don't await to avoid blocking UI
					onCardUpdate(updatedCardData).catch((error) => {
						console.error(
							"Error updating card in WeekView.handleDragEnd:",
							error
						);
					});
				}
			} catch (error) {
				console.error(
					"Error updating card in WeekView.handleDragEnd:",
					error
				);
			}
			return;
		}

		// Handle event dragging (existing logic)
		if (!activeDragItem) {
			setActiveDragItem(null);
			return;
		}

		const { originalEvent: draggedEvent, type } = activeDragItem;

		// Clear drag state immediately for faster UI response
		setActiveDragItem(null);

		try {
			const matches = String(over.id).match(
				/day-(\d+)-hour-(\d+)-minute-(\d+)/
			);
			if (!matches) {
				console.error("Invalid drop target format:", over.id);
				return;
			}

			const [_, dayIndex, hourIndex, minuteIndex] = matches.map(Number);

			const targetDay = new Date(weekStart);
			targetDay.setDate(weekStart.getDate() + dayIndex);
			targetDay.setHours(hourIndex, minuteIndex * MINUTE_INTERVAL, 0, 0);

			let updatedEventData = { ...draggedEvent };

			if (type === "drag") {
				const originalStart = new Date(draggedEvent.startTime);
				const originalEnd = new Date(draggedEvent.endTime);
				const duration =
					originalEnd.getTime() - originalStart.getTime();

				const newStartDate = new Date(targetDay);
				const newEndDate = new Date(newStartDate.getTime() + duration);

				updatedEventData.startTime = newStartDate.toISOString();
				updatedEventData.endTime = newEndDate.toISOString();
				updatedEventData.date = newStartDate
					.toISOString()
					.split("T")[0];
			} else if (type === "resize-bottom") {
				const originalStart = new Date(draggedEvent.startTime);
				const newEndDate = new Date(targetDay);
				newEndDate.setMinutes(
					newEndDate.getMinutes() + MINUTE_INTERVAL
				);

				if (newEndDate > originalStart) {
					updatedEventData.endTime = newEndDate.toISOString();
				}
			} else if (type === "resize-top") {
				const originalEnd = new Date(draggedEvent.endTime);
				const newStartDate = new Date(targetDay);

				if (newStartDate < originalEnd) {
					updatedEventData.startTime = newStartDate.toISOString();
				}
			}

			// Fire and forget - don't await to avoid blocking UI
			onEventUpdate(updatedEventData).catch((error) => {
				console.error("Error updating event:", error);
			});
		} catch (error) {
			console.error("Error updating event:", error);
		}
	};

	// Handle multi-day event styling
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
				{/* Week transition indicator */}
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
									Week of {weekStart?.toLocaleDateString()}
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Header with Day Names and Dates */}
				<div className="sticky top-0 z-10 bg-white border-b dark:bg-gray-900 midnight:bg-gray-950 border-gray-200 dark:border-gray-700 midnight:border-gray-800">
					{/* Changed grid-cols to make first column 5rem wide */}
					<div className="grid grid-cols-[5rem_repeat(7,minmax(0,1fr))]">
						{/* Empty cell for the time labels column */}
						<div className="px-4 py-2" />

						{/* Day Headers */}
						{DAYS_OF_WEEK.map((day, index) => {
							const date = new Date(weekStart);
							date.setDate(weekStart.getDate() + index);
							const isCurrentDay = isToday(date);
							return (
								<div
									key={day}
									className={`py-1.5 text-center ${
										index === 0
											? ""
											: "border-l border-gray-200 dark:border-gray-600 midnight:border-gray-700"
									}`}
								>
									<div
										className={`text-base font-medium text-gray-500 dark:text-grey-400 midnight:text-grey-400 ${
											isCurrentDay ? "text-blue-600" : ""
										}`}
									>
										{day}
									</div>
									<div
										className={`text-lg text-gray-600 font-semibold w-8 h-8 rounded-full mx-auto flex items-center justify-center ${
											isCurrentDay ? "bg-blue-100" : ""
										}`}
									>
										{date.getDate()}
									</div>
								</div>
							);
						})}
					</div>

					{/* The empty div that was here previously has been removed. */}
					<div className="grid grid-cols-[5rem_repeat(7,minmax(0,1fr))] border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
						{/* Label for all-day events - fixed border- to border-r */}
						<div className="px-2 py-2 text-xs text-gray-500">
							All-day
						</div>

						{/* All-day event containers for each day */}
						{DAYS_OF_WEEK.map((day, index) => {
							const date = new Date(weekStart);
							date.setDate(weekStart.getDate() + index);
							const dateKey = date.toDateString();
							const allDayEvents =
								eventsByDayAndTime[dateKey]?.["all-day"] || [];
							const allDayCards =
								cardsByDayAndTime[dateKey]?.["all-day"] || [];

							// Filter out cards that are currently being dragged
							const visibleCards = allDayCards.filter(
								(card) =>
									!activeCard || activeCard.id !== card.id
							);

							// Combine them with events first, then cards
							const allItems = [...allDayEvents, ...visibleCards];

							// Only show drop zone when dragging a card (not an event)
							const showDropZone =
								!!activeCard && !activeDragItem;

							return (
								<DroppableAllDay
									key={`all-day-${day}`}
									id={`all-day-${index}`}
									className={`px-1 py-1 min-h-10 space-y-1 ${
										index === 0
											? ""
											: "border-l border-gray-200 dark:border-gray-600 midnight:border-gray-700"
									}`}
									showDropZone={showDropZone}
								>
									{/* Show events first */}
									{allDayEvents.slice(0, 1).map((event) => (
										<DraggableEvent
											key={`${
												event.id
											}-${date.toISOString()}`}
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
														? "-0.25rem"
														: "0",
												marginRight:
													event.isMultiDay &&
													!event.isLastDay
														? "-0.25rem"
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

									{/* Show cards if space - use DraggableCard, filter out dragged cards */}
									{allDayEvents.length < 1 &&
										visibleCards
											.slice(0, 1)
											.map((card) => (
												<DraggableCard
													key={`card-${
														card.id
													}-${date.toISOString()}`}
													card={card}
													onCardClick={onCardClick}
													currentUserId={
														currentUserId
													}
												/>
											))}

									{/* Show "more" if needed */}
									{allItems.length > 1 && (
										<div
											className="text-xs text-gray-500 pl-1 cursor-pointer hover:underline"
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
													date,
													position
												);
											}}
										>
											+{allItems.length - 1} more
										</div>
									)}
								</DroppableAllDay>
							);
						})}
					</div>
				</div>

				{/* Main Grid - ADDED scrollbar hiding classes */}
				<div
					ref={scrollContainerRef}
					className="flex-1 overflow-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-800/30 midnight:to-gray-900/40"
				>
					<div className="grid grid-cols-[5rem_repeat(7,minmax(0,1fr))]">
						{/* Time Labels Column - Enhanced visibility */}
						<div className="divide-y">
							{timeSlots.map((time, hourIndex) => (
								<div
									key={time}
									className={`h-16 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex items-start pl-2 pt-1 text-xs font-medium
                    ${
						hourIndex < 6
							? "bg-gray-50/50 dark:bg-gray-800/20 midnight:bg-gray-900/20"
							: ""
					}
                    ${
						hourIndex >= 6 && hourIndex < 9
							? "bg-blue-50/30 dark:bg-blue-900/10 midnight:bg-blue-900/10"
							: ""
					}
                    ${
						time === "00:00"
							? "text-red-600 dark:text-red-400 midnight:text-red-400"
							: "text-gray-500"
					}
                  `}
								>
									{time}
									{/* Add AM/PM indicator for better clarity */}
									<span className="ml-1 text-[10px] opacity-60">
										{hourIndex === 0
											? "MID"
											: hourIndex < 12
											? "AM"
											: hourIndex === 12
											? "NOON"
											: "PM"}
									</span>
								</div>
							))}
						</div>

						{/* Day Columns */}
						{DAYS_OF_WEEK.map((day, dayIndex) => {
							const date = new Date(weekStart);
							date.setDate(weekStart.getDate() + dayIndex);
							const dateKey = date.toDateString();
							const isCurrentDay = isToday(date);
							const dayLayouts =
								dailyEventLayouts.get(dateKey) || new Map();

							return (
								<div
									key={day}
									className={`relative divide-y divide-gray-200 dark:divide-gray-700 midnight:divide-gray-800 border-l border-gray-200 dark:border-gray-600 midnight:border-gray-700`}
								>
									{isCurrentDay && (
										<div
											className="absolute left-0 right-0 z-30 pointer-events-none flex items-center" // Added flex and items-center
											style={{
												top: `${getCurrentTimePosition()}px`,
											}}
										>
											<div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500 shadow" />{" "}
											{/* Adjusted position and color, added shadow */}
											<div className="border-t-2 border-red-500 w-full" />{" "}
											{/* Adjusted color */}
											<div className="absolute right-1 -top-2.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium shadow-md whitespace-nowrap">
												{" "}
												{/* Adjusted styles, added whitespace-nowrap */}
												{currentTime.toLocaleTimeString(
													[],
													{
														hour: "2-digit",
														minute: "2-digit",
														hour12: false,
													}
												)}
											</div>
										</div>
									)}{" "}
									{timeSlots.map((time, hourIndex) => {
										return (
											<div
												key={`${day}-${time}`}
												className={`relative group h-16 hover:bg-gray-50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/30 transition-colors border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 cursor-pointer
                          ${
								hourIndex < 6
									? "bg-gray-50/30 dark:bg-gray-800/10 midnight:bg-gray-900/10"
									: ""
							}
                          ${
								hourIndex >= 6 && hourIndex < 9
									? "bg-blue-50/20 dark:bg-blue-900/5 midnight:bg-blue-900/5"
									: ""
							}
                        `}
												onClick={() => {
													handleTimeSlotClick(
														date,
														hourIndex
													);
												}}
											>
												<div className="absolute inset-0 grid grid-rows-4">
													{Array.from({
														length: SLOTS_PER_HOUR,
													}).map((_, minuteIdx) => {
														const slotId = `day-${dayIndex}-hour-${hourIndex}-minute-${minuteIdx}`;
														return (
															<DroppableTimeSlot
																key={slotId}
																id={slotId}
																className="h-full"
															/>
														);
													})}
												</div>
												{/* Add hover effect with plus icon - Ensure it's on top and clickable */}
												<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-200 z-15 pointer-events-none">
													<div className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-800/90 rounded-full p-1.5 shadow-md">
														<Plus className="w-5 h-5 text-gray-500 dark:text-gray-400" />
													</div>
												</div>
											</div>
										);
									})}
									{/* Render events for the day */}
									{Object.values(
										eventsByDayAndTime[dateKey] || {}
									)
										.flat()
										.filter(
											(event) =>
												!event.isAllDay &&
												!event.isMultiDay
										)
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
											const layout = dayLayouts.get(
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
												<DraggableEvent
													key={event.id}
													event={event}
													onEventClick={onEventClick}
													getEventStyle={
														getEventStyle
													}
													style={{
														position: "absolute",
														top: `${top}px`,
														height: `${height}px`,
														left,
														width,
														zIndex: 20,
													}}
													showIcons={
														layout.numColumns === 1
													}
													currentUserId={
														currentUserId
													}
													currentUserEmail={
														currentUserEmail
													}
													allProjects={allProjects} // Pass allProjects for permissions
												/>
											);
										})}
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* Drag Overlay - Optimized */}
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

export default WeekView;
