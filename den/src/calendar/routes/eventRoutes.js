import express from "express";
import { randomUUID } from "crypto";
const router = express.Router();
import { verifyUser } from "../../auth/authMiddleware.js";
import { attachDb } from "../../db/sqlite.js";

// Apply verification middleware to all routes
router.use(verifyUser, attachDb);

/**
 * Helper function to check if a user has access to a project
 */
// Single-user mode: access granted if user owns the project
const hasProjectAccess = async (userId, projectId, db) => {
	try {
		const { data: project, error: projectError } = await db
			.from("projects")
			.select("created_by, owner_id")
			.eq("id", projectId)
			.single();

		if (projectError) return false;
		return project.created_by === userId || project.owner_id === userId;
	} catch (error) {
		console.error("Error checking project access:", error);
		return false;
	}
};

/**
 * Helper function to fetch attendees for events from event_attendees table
 */
const fetchEventAttendees = async (eventIds, db) => {
	if (!eventIds || eventIds.length === 0) return {};

	try {
		const { data: attendees, error } = await db
			.from("event_attendees")
			.select("event_id, user_id, status, responded_at")
			.in("event_id", eventIds);

		if (error) throw error;

		// Group attendees by event_id
		const attendeesByEvent = {};
		(attendees || []).forEach((attendee) => {
			if (!attendeesByEvent[attendee.event_id]) {
				attendeesByEvent[attendee.event_id] = [];
			}
			attendeesByEvent[attendee.event_id].push(attendee);
		});

		return attendeesByEvent;
	} catch (error) {
		console.error("Error fetching event attendees:", error);
		return {};
	}
};

/**
 * Check for scheduling conflicts when creating/updating events
 */
const checkForConflicts = async (
	userId,
	userEmail,
	startTime,
	endTime,
	excludeEventId,
	db
) => {
	try {
		// Fetch all events that overlap with the given time range
		let query = db
			.from("Events")
			.select("id, title, startTime, endTime, createdBy")
			.lt("startTime", endTime)
			.gt("endTime", startTime);

		if (excludeEventId) {
			query = query.neq("id", excludeEventId);
		}

		const { data: events, error } = await query;

		if (error) throw error;

		// Fetch attendees for all events
		const eventIds = (events || []).map((e) => e.id);
		const attendeesByEvent = await fetchEventAttendees(eventIds, db);

		// Filter events where user is involved (creator or attendee with accepted/maybe/creator status)
		const conflicts = (events || []).filter((event) => {
			// User created the event
			if (event.createdBy === userId) return true;

			// Check if user is in attendees with accepted, maybe, or creator status
			const eventAttendees = attendeesByEvent[event.id] || [];
			return eventAttendees.some((attendee) => {
				const statusMatches = ["accepted", "maybe", "creator"].includes(
					attendee.status
				);
				const userMatches = attendee.user_id === userId;
				return statusMatches && userMatches;
			});
		});

		return conflicts;
	} catch (error) {
		console.error("Error checking for conflicts:", error);
		return [];
	}
};

//  Check if user is assigned to any subtask in a card's checklist
const isAssignedToSubtask = (checklist, userId) => {
	if (!checklist || !Array.isArray(checklist)) return false;

	return checklist.some(
		(item) =>
			item.assignees &&
			Array.isArray(item.assignees) &&
			item.assignees.includes(userId)
	);
};

//  Check if user is assigned to any subtask in a card's checklist
const getCardsWithDueDates = async (
	req,
	db,
	projectId = null,
	dateRange = null
) => {
	try {
		const userId = req.user.id;

		// If projectId is provided, check if user has access
		if (projectId) {
			const hasAccess = await hasProjectAccess(
				userId,
				projectId,
				db
			);
			if (!hasAccess) {
				throw new Error("Unauthorized access to project");
			}
		}

		// Start building the query with proper inner join

		if (!projectId) {
			// Get all cards with due dates — fetch columns separately for join
			let cardsQ = db
				.from("Cards")
				.select("id, title, description, priority, dueDate, columnId, tasks, progress, tags, createdBy, administrator_id, checklist")
				.not("dueDate", "is", null);

			if (dateRange && dateRange.startDate && dateRange.endDate) {
				cardsQ = cardsQ.gte("dueDate", dateRange.startDate).lte("dueDate", dateRange.endDate);
			}

			const { data: allCards, error } = await cardsQ;
			if (error) throw error;

			// Fetch columns for all cards
			const colIds = [...new Set((allCards || []).map(c => c.columnId))];
			let colMap = {};
			if (colIds.length > 0) {
				const { data: cols } = await db.from("Columns").select("id, title, projectId, isCompletionColumn").in("id", colIds);
				(cols || []).forEach(c => { colMap[c.id] = c; });
			}

			const accessibleCards = (allCards || [])
				.map(card => ({ ...card, Columns: colMap[card.columnId] || null }))
				.filter((card) => {
					if (card.createdBy === userId) return true;
					if (card.administrator_id === userId) return true;
					if (isAssignedToSubtask(card.checklist, userId)) return true;
					return false;
				});

			return accessibleCards;
		} else {
			// For a specific project — get columns first, then cards
			const { data: projCols } = await db.from("Columns").select("id, title, projectId, isCompletionColumn").eq("projectId", projectId);
			const projColIds = (projCols || []).map(c => c.id);
			const colMap = (projCols || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

			if (projColIds.length === 0) return [];

			let cardsQ = db
				.from("Cards")
				.select("id, title, description, priority, dueDate, columnId, tasks, progress, tags, createdBy, administrator_id, checklist")
				.not("dueDate", "is", null)
				.in("columnId", projColIds);

			if (dateRange && dateRange.startDate && dateRange.endDate) {
				cardsQ = cardsQ.gte("dueDate", dateRange.startDate).lte("dueDate", dateRange.endDate);
			}

			const { data: allCards, error } = await cardsQ;
			if (error) {
				console.error("Error fetching cards for project:", error);
				throw error;
			}

			const accessibleCards = (allCards || [])
				.map(card => ({ ...card, Columns: colMap[card.columnId] || null }))
				.filter((card) => {
					if (card.createdBy === userId) return true;
					if (card.administrator_id === userId) return true;
					if (isAssignedToSubtask(card.checklist, userId)) return true;
					return false;
				});

			return accessibleCards;
		}
	} catch (error) {
		console.error("Error fetching cards with due dates:", error);
		throw error;
	}
};

/**
 * Helper function to get cards with due dates, filtered by workspace
 */
const getCardsWithDueDatesByWorkspace = async (
	req,
	db,
	workspaceId,
	dateRange = null
) => {
	try {
		const userId = req.user.id;

		// First, get all projects in the workspace that the user has access to
		const { data: workspaceProjects, error: projectsError } = await db
			.from("projects")
			.select("id")
			.eq("team_id", workspaceId);

		if (projectsError) throw projectsError;

		if (!workspaceProjects || workspaceProjects.length === 0) {
			return [];
		}

		const projectIds = workspaceProjects.map((p) => p.id);

		// Single-user mode: all workspace projects are accessible (owned by user)
		const accessibleProjectIds = projectIds;

		// Get columns for accessible projects first, then query cards
		const { data: wsCols } = await db
			.from("Columns")
			.select("id, title, projectId, isCompletionColumn")
			.in("projectId", accessibleProjectIds);

		const wsColIds = (wsCols || []).map(c => c.id);
		const wsColMap = (wsCols || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

		if (wsColIds.length === 0) return [];

		let cardsQ = db
			.from("Cards")
			.select("id, title, description, priority, dueDate, columnId, tasks, progress, tags, createdBy, administrator_id, checklist")
			.not("dueDate", "is", null)
			.in("columnId", wsColIds);

		if (dateRange && dateRange.startDate && dateRange.endDate) {
			cardsQ = cardsQ
				.gte("dueDate", dateRange.startDate)
				.lte("dueDate", dateRange.endDate);
		}

		const { data: allCards, error } = await cardsQ;
		if (error) {
			console.error("Error fetching cards for workspace:", error);
			throw error;
		}

		// Attach column data and filter cards based on access rules
		const accessibleCards = (allCards || [])
			.map(card => ({ ...card, Columns: wsColMap[card.columnId] || null }))
			.filter((card) => {
				if (card.createdBy === userId) return true;
				if (card.administrator_id === userId) return true;
				if (isAssignedToSubtask(card.checklist, userId)) return true;
				return false;
			});

		return accessibleCards;
	} catch (error) {
		console.error(
			"Error fetching cards with due dates by workspace:",
			error
		);
		throw error;
	}
};

// Add a new endpoint to get cards for calendar view
router.get("/calendar-cards", verifyUser, async (req, res) => {
	try {
		const { projectId, workspaceId, startDate, endDate } = req.query;
		const userId = req.user.id;

		const db = req.db;

		// If projectId is provided, verify access
		if (projectId) {
			const hasAccess = await hasProjectAccess(
				userId,
				projectId,
				db
			);
			if (!hasAccess) {
				return res.status(403).json({
					error: "You do not have access to this project",
				});
			}
		}

		const dateRange = startDate && endDate ? { startDate, endDate } : null;

		let cards;

		// Handle workspace filtering
		if (workspaceId) {
			cards = await getCardsWithDueDatesByWorkspace(
				req,
				db,
				workspaceId,
				dateRange
			);
		} else {
			cards = await getCardsWithDueDates(
				req,
				db,
				projectId,
				dateRange
			);
		}

		// Format cards for calendar display - only send fields used by frontend
		const formattedCards = cards.map((card) => {
			const isCompleted =
				card.completedAt || card.Columns?.isCompletionColumn || false;

			// Extract assignees from checklist/subtasks for display purposes
			const assignees = [];
			if (card.checklist && Array.isArray(card.checklist)) {
				card.checklist.forEach((item) => {
					if (item.assignees && Array.isArray(item.assignees)) {
						item.assignees.forEach((assigneeId) => {
							if (!assignees.includes(assigneeId)) {
								assignees.push(assigneeId);
							}
						});
					}
				});
			}

			return {
				id: card.id,
				title: card.title,
				description: card.description,
				dueDate: card.dueDate,
				priority: card.priority || "Medium",
				progress: card.progress || 0,
				tags: card.tags || [],
				createdBy: card.createdBy,
				administrator_id: card.administrator_id,
				assignees: assignees,
				checklist: card.checklist || [],
				tasks: card.tasks
					? {
							total: card.tasks.total || 0,
							completed: card.tasks.completed || 0,
					  }
					: { total: 0, completed: 0 },
				column: {
					id: card.Columns?.id,
					title: card.Columns?.title,
					isCompletionColumn: card.Columns?.isCompletionColumn,
					projectId: card.Columns?.projectId,
				},
				projectId: card.Columns?.projectId,
				isCompleted,
				type: "card",
			};
		});

		res.json({
			success: true,
			cards: formattedCards,
			total: formattedCards.length,
		});
	} catch (error) {
		console.error("Error fetching calendar cards:", error);
		res.status(error.message.includes("Unauthorized") ? 403 : 500).json({
			error: "Failed to fetch cards for calendar",
			details: error.message,
		});
	}
});

// Add endpoint for updating card due date via calendar drag-and-drop
router.put("/cards/:id/due-date", verifyUser, async (req, res) => {
	try {
		const { id } = req.params;
		const { dueDate } = req.body;
		const userId = req.user.id;

		if (!dueDate) {
			return res.status(400).json({ error: "Due date is required" });
		}

		const db = req.db;
		// Check if the user has permission to update this card
		const { data: card, error: cardError } = await db
			.from("Cards")
			.select("createdBy, administrator_id, checklist, columnId")
			.eq("id", id)
			.single();

		if (cardError) {
			return res.status(404).json({ error: "Card not found" });
		}

		// Get column info separately
		const { data: cardColumn } = await db
			.from("Columns")
			.select("projectId")
			.eq("id", card.columnId)
			.single();

		// Check if user is creator, administrator, or assigned to subtasks
		const isCreator = card.createdBy === userId;
		const isAdministrator = card.administrator_id === userId;
		const isAssignedToSubtask =
			card.checklist &&
			Array.isArray(card.checklist) &&
			card.checklist.some(
				(item) =>
					item.assignees &&
					Array.isArray(item.assignees) &&
					item.assignees.includes(userId)
			);

		if (!isCreator && !isAdministrator && !isAssignedToSubtask) {
			// Check if user has access to the project
			const hasAccess = await hasProjectAccess(
				userId,
				cardColumn?.projectId,
				db
			);
			if (!hasAccess) {
				return res.status(403).json({
					error: "You do not have permission to update this card",
				});
			}
		}

		// Update the card due date
		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update({ dueDate: new Date(dueDate).toISOString() })
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		res.json({
			success: true,
			card: updatedCard,
		});
	} catch (error) {
		console.error("Error updating card due date:", error);
		res.status(500).json({
			error: "Failed to update card due date",
			details: error.message,
		});
	}
});

// Create a new event - UPDATED WITH EMAIL INTEGRATION
router.post("/", async (req, res) => {
	try {
		const userId = req.user.id;

		// Extract multi-day event data
		const {
			startDate,
			endDate,
			startTime,
			endTime,
			date,
			start,
			end, // Support for legacy format
			projectId,
			isPersonalEvent, // NEW: Add support for personal event flag
			id, // Exclude id - let database generate it
			displayDate, // Frontend-only field
			isFirstDay, // Frontend-only field
			isLastDay, // Frontend-only field
			isMultiDay, // Frontend-only field
			projectName, // Frontend-only field
			...restData
		} = req.body;

		// FIXED: If it's marked as a personal event, ensure projectId is null
		let finalProjectId = projectId;
		if (isPersonalEvent === true) {
			finalProjectId = null;
		}

		const db = req.db;

		// If projectId is provided and it's not a personal event, check user access
		if (finalProjectId && !isPersonalEvent) {
			const hasAccess = await hasProjectAccess(
				userId,
				finalProjectId,
				db
			);
			if (!hasAccess) {
				return res
					.status(403)
					.json({ error: "You do not have access to this project" });
			}
		}

		let startDateTime, endDateTime;

		// CASE 1: If startTime/endTime are already ISO strings
		if (
			startTime &&
			typeof startTime === "string" &&
			startTime.includes("T")
		) {
			startDateTime = new Date(startTime);
			endDateTime = new Date(endTime);

			// Validate the created dates
			if (
				isNaN(startDateTime.getTime()) ||
				isNaN(endDateTime.getTime())
			) {
				return res
					.status(400)
					.json({ error: "Invalid ISO date/time strings" });
			}
		}
		// CASE 2: Process for multi-day events with separate components
		else if (startDate && endDate && startTime && endTime) {
			try {
				// Parse date components
				const [startYear, startMonth, startDay] = startDate
					.split("-")
					.map(Number);
				const [startHours, startMinutes] = startTime
					.split(":")
					.map(Number);

				const [endYear, endMonth, endDay] = endDate
					.split("-")
					.map(Number);
				const [endHours, endMinutes] = endTime.split(":").map(Number);

				// Validate parsed values
				if (
					isNaN(startYear) ||
					isNaN(startMonth) ||
					isNaN(startDay) ||
					isNaN(startHours) ||
					isNaN(startMinutes) ||
					isNaN(endYear) ||
					isNaN(endMonth) ||
					isNaN(endDay) ||
					isNaN(endHours) ||
					isNaN(endMinutes)
				) {
					return res.status(400).json({
						error: "Invalid date/time components",
						details: { startDate, startTime, endDate, endTime },
					});
				}

				// Use UTC to ensure consistent date handling
				startDateTime = new Date(
					Date.UTC(
						startYear,
						startMonth - 1,
						startDay,
						startHours,
						startMinutes,
						0,
						0
					)
				);
				endDateTime = new Date(
					Date.UTC(
						endYear,
						endMonth - 1,
						endDay,
						endHours,
						endMinutes,
						0,
						0
					)
				);
			} catch (error) {
				console.error("Error parsing date/time components:", error);
				return res.status(400).json({
					error: "Failed to parse date/time components",
					details: error.message,
				});
			}
		}
		// CASE 3: Legacy single-day format
		else if (date && (start || startTime) && (end || endTime)) {
			try {
				const [year, month, day] = date.split("-").map(Number);
				const timeStart = start || startTime;
				const timeEnd = end || endTime;
				const [startHours, startMinutes] = timeStart
					.split(":")
					.map(Number);
				const [endHours, endMinutes] = timeEnd.split(":").map(Number);

				// Validate parsed values
				if (
					isNaN(year) ||
					isNaN(month) ||
					isNaN(day) ||
					isNaN(startHours) ||
					isNaN(startMinutes) ||
					isNaN(endHours) ||
					isNaN(endMinutes)
				) {
					return res.status(400).json({
						error: "Invalid date/time components",
						details: { date, timeStart, timeEnd },
					});
				}

				// Use UTC to ensure consistent date handling
				startDateTime = new Date(
					Date.UTC(
						year,
						month - 1,
						day,
						startHours,
						startMinutes,
						0,
						0
					)
				);
				endDateTime = new Date(
					Date.UTC(year, month - 1, day, endHours, endMinutes, 0, 0)
				);
			} catch (error) {
				console.error("Error parsing date/time components:", error);
				return res.status(400).json({
					error: "Failed to parse single-day date/time",
					details: error.message,
				});
			}
		}
		// CASE 4: Already has ISO strings in the data object
		else if (restData.startTime && restData.endTime) {
			try {
				startDateTime = new Date(restData.startTime);
				endDateTime = new Date(restData.endTime);

				if (
					isNaN(startDateTime.getTime()) ||
					isNaN(endDateTime.getTime())
				) {
					return res.status(400).json({
						error: "Invalid timestamp strings in data object",
					});
				}
			} catch (error) {
				console.error("Error parsing timestamps from restData:", error);
				return res
					.status(400)
					.json({ error: "Failed to parse timestamps" });
			}
		}
		// No valid date/time data
		else {
			return res.status(400).json({
				error: "Missing required date/time information",
				receivedData: req.body,
			});
		}

		// Final validation: Verify dates are valid
		if (
			!startDateTime ||
			!endDateTime ||
			isNaN(startDateTime.getTime()) ||
			isNaN(endDateTime.getTime())
		) {
			return res.status(400).json({
				error: "Invalid date objects created",
				start: startDateTime,
				end: endDateTime,
			});
		}

		// Verify end time is after start time
		if (endDateTime <= startDateTime) {
			return res
				.status(400)
				.json({ error: "End time must be after start time" });
		}

		// THE CAT'S ADDITION: Check for conflicts for the creator
		const conflicts = await checkForConflicts(
			userId,
			req.user.email,
			startDateTime.toISOString(),
			endDateTime.toISOString(),
			null,
			db
		);

		// Extract attendees from request body before creating event
		const attendeesData = restData.attendees || [];
		delete restData.attendees; // Remove from event data

		// Create event data with properly formatted dates
		const eventData = {
			id: randomUUID(), // Generate UUID for new event
			...restData,
			startTime: startDateTime.toISOString(),
			endTime: endDateTime.toISOString(),
			createdBy: req.user.id,
			isAllDay: restData.isAllDay || false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			...(finalProjectId && { projectId: finalProjectId }),
		};

		// Insert event into Supabase
		const { data: event, error: insertError } = await db
			.from("Events")
			.insert([eventData])
			.select()
			.single();

		if (insertError) {
			console.error("Error creating event:", insertError);
			throw insertError;
		}

		// Insert attendees into event_attendees table
		const attendees = [];
		if (attendeesData && Array.isArray(attendeesData)) {
			const attendeeRecords = attendeesData
				.filter((attendee) => attendee.user_id) // Only include attendees with user_id
				.map((attendee) => ({
					event_id: event.id,
					user_id: attendee.user_id,
					status:
						attendee.user_id === req.user.id
							? "creator"
							: "pending",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}));

			if (attendeeRecords.length > 0) {
				const { data: insertedAttendees, error: attendeeError } =
					await db
						.from("event_attendees")
						.insert(attendeeRecords)
						.select();

				if (attendeeError) {
					console.error("Error inserting attendees:", attendeeError);
					// Don't fail the event creation, but log the error
				} else {
					attendees.push(...(insertedAttendees || []));
				}
			}
		}

		

		// Return only necessary fields for frontend
		const responseEvent = {
			id: event.id,
			title: event.title,
			startTime: event.startTime,
			endTime: event.endTime,
			color: event.color,
			description: event.description,
			isAllDay: event.isAllDay,
			createdBy: event.createdBy,
			projectId: event.projectId,
			attendees: attendees.map((a) => ({
				user_id: a.user_id,
				status: a.status,
				responded_at: a.responded_at,
			})),
		};

		res.status(201).json(responseEvent);
	} catch (error) {
		console.error("Error creating event:", error);
		res.status(400).json({ error: error.message });
	}
});

// Get events by project
router.get("/", async (req, res) => {
	try {
		const { projectId } = req.query;
		const userId = req.user.id;

		if (!projectId) {
			return res.status(400).json({ error: "Project ID is required" });
		}

		// Check if user has access to this project
		const db = req.db;

		const hasAccess = await hasProjectAccess(userId, projectId, db);
		if (!hasAccess) {
			return res
				.status(403)
				.json({ error: "You do not have access to this project" });
		}

		// Get all events for the project
		const { data: events, error: eventsError } = await db
			.from("Events")
			.select(
				`
				id,
				title,
				startTime,
				endTime,
				color,
				description,
				isAllDay,
				createdBy,
				projectId
			`
			)
			.eq("projectId", projectId)
			.order("startTime", { ascending: true });

		if (eventsError) throw eventsError;

		// Fetch attendees for all events
		const eventIds = (events || []).map((e) => e.id);
		const attendeesByEvent = await fetchEventAttendees(eventIds, db);

		// Filter events where user is creator or attendee
		const userEvents = (events || []).filter((event) => {
			if (event.createdBy === userId) return true;

			const attendees = attendeesByEvent[event.id] || [];
			return attendees.some(
				(attendee) =>
					attendee.user_id === userId &&
					["accepted", "maybe", "creator", "declined"].includes(
						attendee.status
					)
			);
		});

		// Get project information
		const { data: project, error: projectError } = await db
			.from("projects")
			.select("id, name")
			.eq("id", projectId)
			.single();

		if (projectError && projectError.code !== "PGRST116") {
			console.error("Error fetching project:", projectError);
		}

		// Transform the events to include projectName and attendees
		const formattedEvents = userEvents.map((eventData) => {
			const eventAttendees = attendeesByEvent[eventData.id] || [];
			return {
				id: eventData.id,
				title: eventData.title,
				startTime: eventData.startTime,
				endTime: eventData.endTime,
				color: eventData.color,
				description: eventData.description,
				isAllDay: eventData.isAllDay,
				createdBy: eventData.createdBy,
				projectId: eventData.projectId,
				projectName: project ? project.name : null,
				attendees: eventAttendees.map((attendee) => ({
					user_id: attendee.user_id,
					status: attendee.status,
					responded_at: attendee.responded_at,
				})),
			};
		});

		res.json(formattedEvents);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// UPDATED: Get all events for the current user with personal filter support and workspace filtering
router.get("/my/events", async (req, res) => {
	try {
		const {
			startDate,
			endDate,
			limit = 100,
			offset = 0,
			personal,
			workspaceId,
		} = req.query;
		const userId = req.user.id;

		const db = req.db;

		// Build the base query
		let query = db
			.from("Events")
			.select(
				"id, title, startTime, endTime, color, description, isAllDay, createdBy, projectId",
				{ count: "exact" }
			)
			.order("startTime", { ascending: true })
			.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

		// ADDED: Support for personal filter
		if (personal === "true") {
			// Only show personal events (events with no projectId)
			query = query.is("projectId", null);
		}

		// ADDED: Support for workspace filtering
		if (workspaceId) {
			// Get all projects in the workspace
			const { data: workspaceProjects, error: projectsError } =
				await db
					.from("projects")
					.select("id")
					.eq("team_id", workspaceId);

			if (projectsError) throw projectsError;

			if (workspaceProjects && workspaceProjects.length > 0) {
				const projectIds = workspaceProjects.map((p) => p.id);
				query = query.in("projectId", projectIds);
			} else {
				// No projects in workspace, return empty result
				return res.json({
					userId,
					totalEvents: 0,
					events: [],
					pagination: {
						limit: parseInt(limit),
						offset: parseInt(offset),
						total: 0,
					},
				});
			}
		}

		// Add date range filter if provided
		if (startDate && endDate) {
			query = query
				.gte("startTime", new Date(startDate).toISOString())
				.lte("startTime", new Date(endDate).toISOString());
		}

		const { data: allEvents, error: eventsError, count } = await query;

		if (eventsError) throw eventsError;

		// Fetch attendees for all events
		const eventIds = (allEvents || []).map((e) => e.id);
		const attendeesByEvent = await fetchEventAttendees(eventIds, db);

		// Filter events where user is creator or attendee
		const events = (allEvents || []).filter((event) => {
			if (event.createdBy === userId) return true;

			const attendees = attendeesByEvent[event.id] || [];
			return attendees.some(
				(attendee) =>
					attendee.user_id === userId &&
					["accepted", "maybe", "creator", "declined"].includes(
						attendee.status
					)
			);
		});

		// Get unique project IDs from events
		const projectIds = [
			...new Set(events.map((e) => e.projectId).filter(Boolean)),
		];

		// Fetch project information for all projects
		let projectsMap = {};
		if (projectIds.length > 0) {
			const { data: projects, error: projectsError } = await db
				.from("projects")
				.select("id, name")
				.in("id", projectIds);

			if (!projectsError && projects) {
				projectsMap = projects.reduce((acc, proj) => {
					acc[proj.id] = proj;
					return acc;
				}, {});
			}
		}

		// Create a response that includes events with their project names and attendees
		const formattedEvents = events.map((eventData) => {
			const project = eventData.projectId
				? projectsMap[eventData.projectId]
				: null;
			const eventAttendees = attendeesByEvent[eventData.id] || [];
			return {
				id: eventData.id,
				title: eventData.title,
				startTime: eventData.startTime,
				endTime: eventData.endTime,
				color: eventData.color,
				description: eventData.description,
				isAllDay: eventData.isAllDay,
				createdBy: eventData.createdBy,
				projectId: eventData.projectId,
				projectName: project ? project.name : null,
				attendees: eventAttendees.map((attendee) => ({
					user_id: attendee.user_id,
					status: attendee.status,
					responded_at: attendee.responded_at,
				})),
			};
		});

		res.json({
			userId,
			totalEvents: formattedEvents.length,
			events: formattedEvents,
			pagination: {
				limit: parseInt(limit),
				offset: parseInt(offset),
				total: count || formattedEvents.length,
			},
		});
	} catch (error) {
		console.error("Get user events error:", error);
		res.status(500).json({
			error: "Failed to fetch user events",
			details: error.message,
		});
	}
});

// OPTIMIZED: Combined endpoint to fetch both events and cards in a single request
router.get("/combined-data", verifyUser, async (req, res) => {
	try {
		const { projectId, workspaceId, startDate, endDate, personal } =
			req.query;
		const userId = req.user.id;

		const db = req.db;

		// Prepare date range filter
		const dateRange = startDate && endDate ? { startDate, endDate } : null;

		// Parallel fetch of events and cards
		const [eventsResult, cardsResult] = await Promise.all([
			// Fetch events
			(async () => {
				try {
					// Build Supabase query
					let query = db
						.from("Events")
						.select(
							"id, title, startTime, endTime, color, description, isAllDay, createdBy, projectId"
						)
						.order("startTime", { ascending: true });

					// Apply filters
					if (personal === "true") {
						query = query.is("projectId", null);
					} else if (workspaceId) {
						const { data: workspaceProjects } = await db
							.from("projects")
							.select("id")
							.eq("team_id", workspaceId);

						if (workspaceProjects && workspaceProjects.length > 0) {
							const projectIds = workspaceProjects.map(
								(p) => p.id
							);
							query = query.in("projectId", projectIds);
						} else {
							return [];
						}
					} else if (projectId) {
						query = query.eq("projectId", projectId);
					}

					if (dateRange) {
						// For day view, we need to be more inclusive to catch multi-day events
						// Use overlap logic: event overlaps if startTime <= rangeEnd AND endTime >= rangeStart
						query = query
							.lte(
								"startTime",
								new Date(dateRange.endDate).toISOString()
							)
							.gte(
								"endTime",
								new Date(dateRange.startDate).toISOString()
							);
					}

					const { data: allEvents, error: eventsError } = await query;

					if (eventsError) throw eventsError;

					// Fetch attendees for all events
					const eventIds = (allEvents || []).map((e) => e.id);
					const attendeesByEvent = await fetchEventAttendees(
						eventIds,
						db
					);

					// Filter events where user is creator or attendee
					const events = (allEvents || []).filter((event) => {
						if (event.createdBy === userId) return true;

						const attendees = attendeesByEvent[event.id] || [];
						return attendees.some(
							(attendee) =>
								attendee.user_id === userId &&
								[
									"accepted",
									"maybe",
									"creator",
									"declined",
								].includes(attendee.status)
						);
					});

					// Get unique project IDs from events
					const projectIds = [
						...new Set(
							events.map((e) => e.projectId).filter(Boolean)
						),
					];

					// Fetch project information for all projects
					let projectsMap = {};
					if (projectIds.length > 0) {
						const { data: projects, error: projectsError } =
							await db
								.from("projects")
								.select("id, name")
								.in("id", projectIds);

						if (!projectsError && projects) {
							projectsMap = projects.reduce((acc, proj) => {
								acc[proj.id] = proj;
								return acc;
							}, {});
						}
					}

					return events.map((eventData) => {
						const project = eventData.projectId
							? projectsMap[eventData.projectId]
							: null;
						const eventAttendees =
							attendeesByEvent[eventData.id] || [];
						return {
							id: eventData.id,
							title: eventData.title,
							startTime: eventData.startTime,
							endTime: eventData.endTime,
							color: eventData.color,
							description: eventData.description,
							isAllDay: eventData.isAllDay,
							attendees: eventAttendees.map((attendee) => ({
								user_id: attendee.user_id,
								status: attendee.status,
								responded_at: attendee.responded_at,
							})),
							createdBy: eventData.createdBy,
							projectId: eventData.projectId,
							projectName: project ? project.name : null,
						};
					});
				} catch (error) {
					console.error(
						"Error fetching events in combined request:",
						error
					);
					return [];
				}
			})(),

			// Fetch cards
			(async () => {
				try {
					if (personal === "true") {
						return []; // Personal events don't have cards
					}

					let cards;
					if (workspaceId) {
						cards = await getCardsWithDueDatesByWorkspace(
							req,
							db,
							workspaceId,
							dateRange
						);
					} else {
						cards = await getCardsWithDueDates(
							req,
							db,
							projectId,
							dateRange
						);
					}

					// Return optimized card data
					return cards.map((card) => {
						const isCompleted =
							card.completedAt ||
							card.Columns?.isCompletionColumn ||
							false;

						const assignees = [];
						if (card.checklist && Array.isArray(card.checklist)) {
							card.checklist.forEach((item) => {
								if (
									item.assignees &&
									Array.isArray(item.assignees)
								) {
									item.assignees.forEach((assigneeId) => {
										if (!assignees.includes(assigneeId)) {
											assignees.push(assigneeId);
										}
									});
								}
							});
						}

						return {
							id: card.id,
							title: card.title,
							description: card.description,
							dueDate: card.dueDate,
							priority: card.priority || "Medium",
							progress: card.progress || 0,
							tags: card.tags || [],
							createdBy: card.createdBy,
							administrator_id: card.administrator_id,
							assignees: assignees,
							checklist: card.checklist || [],
							tasks: card.tasks
								? {
										total: card.tasks.total || 0,
										completed: card.tasks.completed || 0,
								  }
								: { total: 0, completed: 0 },
							column: {
								id: card.Columns?.id,
								title: card.Columns?.title,
								isCompletionColumn:
									card.Columns?.isCompletionColumn,
								projectId: card.Columns?.projectId,
							},
							projectId: card.Columns?.projectId,
							isCompleted,
							type: "card",
						};
					});
				} catch (error) {
					console.error(
						"Error fetching cards in combined request:",
						error
					);
					return [];
				}
			})(),
		]);

		res.json({
			success: true,
			data: {
				events: eventsResult,
				cards: cardsResult,
			},
			totals: {
				events: eventsResult.length,
				cards: cardsResult.length,
			},
		});
	} catch (error) {
		console.error("Error in combined data fetch:", error);
		res.status(500).json({
			error: "Failed to fetch combined calendar data",
			details: error.message,
		});
	}
});

// Get single event
router.get("/:id", async (req, res) => {
	try {
		const eventId = req.params.id;
		const userId = req.user.id;

		const db = req.db;

		// Get the event
		const { data: event, error: eventError } = await db
			.from("Events")
			.select(
				`
				id,
				title,
				startTime,
				endTime,
				color,
				description,
				isAllDay,
				createdBy,
				projectId
			`
			)
			.eq("id", eventId)
			.single();

		if (eventError || !event) {
			return res.status(404).json({ error: "Event not found" });
		}

		// Fetch attendees for this event
		const attendeesByEvent = await fetchEventAttendees(
			[event.id],
			db
		);
		const eventAttendees = attendeesByEvent[event.id] || [];

		// Check if user has access to this event
		const isCreator = event.createdBy === userId;
		const isAttendee = eventAttendees.some(
			(attendee) => attendee.user_id === userId
		);

		if (!isCreator && !isAttendee) {
			// Check project access if event has a projectId
			if (event.projectId) {
				const hasAccess = await hasProjectAccess(
					userId,
					event.projectId,
					db
				);
				if (!hasAccess) {
					return res.status(403).json({
						error: "You do not have access to this event",
					});
				}
			} else {
				return res
					.status(403)
					.json({ error: "You do not have access to this event" });
			}
		}

		// Get project information if event has a projectId
		let projectName = null;
		if (event.projectId) {
			const { data: project, error: projectError } = await db
				.from("projects")
				.select("id, name")
				.eq("id", event.projectId)
				.single();

			if (!projectError && project) {
				projectName = project.name;
			}
		}

		// Format response - only send fields used by frontend
		const formattedEvent = {
			id: event.id,
			title: event.title,
			startTime: event.startTime,
			endTime: event.endTime,
			color: event.color,
			description: event.description,
			isAllDay: event.isAllDay,
			createdBy: event.createdBy,
			projectId: event.projectId,
			projectName: projectName,
			// Include attendees with status information
			attendees: eventAttendees.map((attendee) => ({
				user_id: attendee.user_id,
				status: attendee.status || "pending",
				responded_at: attendee.responded_at,
			})),
		};

		res.json(formattedEvent);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get dashboard events for a user
router.get("/dashboard", async (req, res) => {
	try {
		const { userId } = req.query;
		const currentUserId = req.user.id;

		// Check if userId is provided
		if (!userId) {
			return res.status(400).json({ error: "User ID is required" });
		}

		// Only allow users to access their own dashboard events
		if (userId !== currentUserId) {
			// Check if user has admin access (this would need to be implemented)
			const isAdmin = false; // Replace with actual admin check

			if (!isAdmin) {
				return res.status(403).json({
					error: "You do not have permission to view this user's events",
				});
			}
		}

		const db = req.db;

		// Fetch only the necessary fields for dashboard display
		const { data: allEvents, error: eventsError } = await db
			.from("Events")
			.select(
				"id, title, startTime, endTime, color, createdBy, attendees"
			)
			.order("startTime", { ascending: true });

		if (eventsError) throw eventsError;

		// Filter events where user is creator or attendee
		const dashboardEvents = (allEvents || []).filter((event) => {
			if (event.createdBy === userId) return true;

			const attendees = event.attendees || [];
			return attendees.some(
				(attendee) =>
					(attendee.user_id === userId ||
						attendee.email === req.user.email) &&
					["accepted", "maybe", "creator", "declined"].includes(
						attendee.status
					)
			);
		});

		if (!dashboardEvents.length) {
			return res.json({
				message: "No events found for this user",
				userId,
				events: [],
			});
		}

		// Format the data for dashboard display
		const formattedEvents = dashboardEvents.map((event) => ({
			id: event.id,
			title: event.title,
			startTime: event.startTime,
			endTime: event.endTime,
			color: event.color,
		}));

		// Group events by date for easier frontend handling
		const groupedEvents = formattedEvents.reduce((acc, event) => {
			const date = new Date(event.startTime).toISOString().split("T")[0];
			if (!acc[date]) {
				acc[date] = [];
			}
			acc[date].push(event);
			return acc;
		}, {});

		res.json({
			userId,
			totalEvents: formattedEvents.length,
			eventsByDate: groupedEvents,
			events: formattedEvents,
		});
	} catch (error) {
		console.error("Dashboard fetch error:", error);
		res.status(500).json({
			error: "Failed to fetch dashboard events",
			details: error.message,
		});
	}
});

// Update event - UPDATED WITH EMAIL INTEGRATION
router.put("/:id", async (req, res) => {
	try {
		const eventId = req.params.id;
		const userId = req.user.id;

		const db = req.db;

		// Fetch the existing event
		const { data: event, error: eventError } = await db
			.from("Events")
			.select("*")
			.eq("id", eventId)
			.single();

		if (eventError || !event) {
			return res.status(404).json({ error: "Event not found" });
		}

		// Fetch existing attendees from event_attendees table
		const attendeesByEvent = await fetchEventAttendees([eventId], db);
		const originalAttendees = attendeesByEvent[eventId] || [];

		// Store original event data for comparison
		const originalEvent = { ...event, attendees: originalAttendees };

		// Check if user has permission to update this event
		// Only event creators and project admins can edit events (NOT attendees)
		const isCreator = event.createdBy === userId;
		let hasPermission = isCreator;

		// If not the event creator, check if user is project admin
		if (!isCreator && event.projectId) {
			const { data: project } = await db
				.from("projects")
				.select("created_by")
				.eq("id", event.projectId)
				.single();

			// User is project admin if they created the project
			if (project && project.created_by === userId) {
				hasPermission = true;
			}
		}

		// If user has no permission, deny access
		if (!hasPermission) {
			return res.status(403).json({
				error: "You do not have permission to update this event. Only the event creator or project admin can edit events.",
			});
		}

		// Extract multi-day event data and attendees
		const {
			startDate,
			endDate,
			startTime,
			endTime,
			date,
			start,
			end, // Support for legacy format
			displayDate, // Frontend-only field, not in DB
			isFirstDay, // Frontend-only field, not in DB
			isLastDay, // Frontend-only field, not in DB
			isMultiDay, // Frontend-only field, not in DB
			projectName, // Frontend-only field, not in DB (from project join)
			attendees, // Extract attendees to handle separately
			...otherData
		} = req.body;

		let updateData = {
			...otherData,
		};

		// CASE 1: If startTime/endTime are already ISO strings from drag and drop
		if (
			startTime &&
			typeof startTime === "string" &&
			startTime.includes("T") &&
			endTime &&
			typeof endTime === "string" &&
			endTime.includes("T")
		) {
			try {
				const startDateTime = new Date(startTime);
				const endDateTime = new Date(endTime);

				if (
					isNaN(startDateTime.getTime()) ||
					isNaN(endDateTime.getTime())
				) {
					return res
						.status(400)
						.json({ error: "Invalid ISO date/time strings" });
				}

				// Only update times if they actually changed to prevent false notifications
				const currentStartTime = new Date(originalEvent.startTime);
				const currentEndTime = new Date(originalEvent.endTime);

				if (
					Math.abs(
						startDateTime.getTime() - currentStartTime.getTime()
					) > 1000
				) {
					updateData.startTime = startDateTime;
				}
				if (
					Math.abs(endDateTime.getTime() - currentEndTime.getTime()) >
					1000
				) {
					updateData.endTime = endDateTime;
				}
			} catch (error) {
				console.error("Error parsing ISO timestamps:", error);
				return res
					.status(400)
					.json({ error: "Failed to parse timestamps" });
			}
		}
		// CASE 2: Multi-day event with separate date/time components
		else if (startDate && endDate && startTime && endTime) {
			try {
				// If startTime/endTime are separate string components (not ISO)
				if (!startTime.includes("T")) {
					// Parse date components
					const [startYear, startMonth, startDay] = startDate
						.split("-")
						.map(Number);
					const [startHours, startMinutes] = startTime
						.split(":")
						.map(Number);

					const [endYear, endMonth, endDay] = endDate
						.split("-")
						.map(Number);
					const [endHours, endMinutes] = endTime
						.split(":")
						.map(Number);

					// Validate parsed values
					if (
						isNaN(startYear) ||
						isNaN(startMonth) ||
						isNaN(startDay) ||
						isNaN(startHours) ||
						isNaN(startMinutes) ||
						isNaN(endYear) ||
						isNaN(endMonth) ||
						isNaN(endDay) ||
						isNaN(endHours) ||
						isNaN(endMinutes)
					) {
						return res.status(400).json({
							error: "Invalid date/time components",
							details: { startDate, startTime, endDate, endTime },
						});
					}

					// Use UTC to ensure consistent date handling
					const newStartTime = new Date(
						Date.UTC(
							startYear,
							startMonth - 1,
							startDay,
							startHours,
							startMinutes,
							0,
							0
						)
					);
					const newEndTime = new Date(
						Date.UTC(
							endYear,
							endMonth - 1,
							endDay,
							endHours,
							endMinutes,
							0,
							0
						)
					);

					// Only update times if they actually changed to prevent false notifications
					const currentStartTime = new Date(originalEvent.startTime);
					const currentEndTime = new Date(originalEvent.endTime);

					if (
						Math.abs(
							newStartTime.getTime() - currentStartTime.getTime()
						) > 1000
					) {
						updateData.startTime = newStartTime;
					}
					if (
						Math.abs(
							newEndTime.getTime() - currentEndTime.getTime()
						) > 1000
					) {
						updateData.endTime = newEndTime;
					}
				} else {
					// Already ISO strings
					const newStartTime = new Date(startTime);
					const newEndTime = new Date(endTime);

					// Only update times if they actually changed to prevent false notifications
					const currentStartTime = new Date(originalEvent.startTime);
					const currentEndTime = new Date(originalEvent.endTime);

					if (
						Math.abs(
							newStartTime.getTime() - currentStartTime.getTime()
						) > 1000
					) {
						updateData.startTime = newStartTime;
					}
					if (
						Math.abs(
							newEndTime.getTime() - currentEndTime.getTime()
						) > 1000
					) {
						updateData.endTime = newEndTime;
					}
				}
			} catch (error) {
				console.error("Error processing multi-day event:", error);
				return res.status(400).json({
					error: "Failed to parse multi-day event data",
					details: error.message,
				});
			}
		}
		// CASE 3: Single-day format (legacy)
		else if (date && (start || startTime) && (end || endTime)) {
			try {
				const [year, month, day] = date.split("-").map(Number);
				const timeStart = start || startTime;
				const timeEnd = end || endTime;

				// Check if times are already ISO strings
				if (timeStart.includes("T")) {
					const newStartTime = new Date(timeStart);
					const newEndTime = new Date(timeEnd);

					// Only update times if they actually changed to prevent false notifications
					const currentStartTime = new Date(originalEvent.startTime);
					const currentEndTime = new Date(originalEvent.endTime);

					if (
						Math.abs(
							newStartTime.getTime() - currentStartTime.getTime()
						) > 1000
					) {
						updateData.startTime = newStartTime;
					}
					if (
						Math.abs(
							newEndTime.getTime() - currentEndTime.getTime()
						) > 1000
					) {
						updateData.endTime = newEndTime;
					}
				} else {
					const [startHours, startMinutes] = timeStart
						.split(":")
						.map(Number);
					const [endHours, endMinutes] = timeEnd
						.split(":")
						.map(Number);

					// Validate parsed values
					if (
						isNaN(year) ||
						isNaN(month) ||
						isNaN(day) ||
						isNaN(startHours) ||
						isNaN(startMinutes) ||
						isNaN(endHours) ||
						isNaN(endMinutes)
					) {
						return res.status(400).json({
							error: "Invalid date/time components",
							details: { date, timeStart, timeEnd },
						});
					}

					const newStartTime = new Date(
						Date.UTC(
							year,
							month - 1,
							day,
							startHours,
							startMinutes,
							0,
							0
						)
					);
					const newEndTime = new Date(
						Date.UTC(
							year,
							month - 1,
							day,
							endHours,
							endMinutes,
							0,
							0
						)
					);

					// Only update times if they actually changed to prevent false notifications
					const currentStartTime = new Date(originalEvent.startTime);
					const currentEndTime = new Date(originalEvent.endTime);

					if (
						Math.abs(
							newStartTime.getTime() - currentStartTime.getTime()
						) > 1000
					) {
						updateData.startTime = newStartTime;
					}
					if (
						Math.abs(
							newEndTime.getTime() - currentEndTime.getTime()
						) > 1000
					) {
						updateData.endTime = newEndTime;
					}
				}
			} catch (error) {
				console.error("Error processing single-day event:", error);
				return res.status(400).json({
					error: "Failed to parse single-day date/time",
					details: error.message,
				});
			}
		}

		// Final validation of dates
		if (updateData.startTime && updateData.endTime) {
			if (
				isNaN(updateData.startTime.getTime()) ||
				isNaN(updateData.endTime.getTime())
			) {
				return res
					.status(400)
					.json({ error: "Invalid date objects created" });
			}

			// Verify end time is after start time
			if (updateData.endTime <= updateData.startTime) {
				return res
					.status(400)
					.json({ error: "End time must be after start time" });
			}
		}

		// Add updatedAt timestamp
		updateData.updatedAt = new Date().toISOString();

		// Update the event in Supabase (without attendees)
		const { data: updated, error: updateError } = await db
			.from("Events")
			.update(updateData)
			.eq("id", eventId)
			.select()
			.single();

		if (updateError) {
			console.error("Error updating event:", updateError);
			throw updateError;
		}

		// Handle attendees update in event_attendees table
		let newAttendees = [];
		let addedAttendees = [];
		let removedAttendees = [];

		if (attendees && Array.isArray(attendees)) {
			const requestedAttendeeIds = attendees
				.map((a) => a.user_id)
				.filter(Boolean);
			const originalAttendeeIds = originalAttendees.map((a) => a.user_id);

			// Find added attendees (in requested but not in original)
			addedAttendees = attendees.filter(
				(newAttendee) =>
					newAttendee.user_id &&
					!originalAttendeeIds.includes(newAttendee.user_id)
			);

			// Find removed attendees (in original but not in requested)
			removedAttendees = originalAttendees.filter(
				(originalAttendee) =>
					!requestedAttendeeIds.includes(originalAttendee.user_id)
			);

			// Insert new attendees
			if (addedAttendees.length > 0) {
				const attendeeRecords = addedAttendees.map((attendee) => ({
					event_id: eventId,
					user_id: attendee.user_id,
					status: attendee.user_id === userId ? "creator" : "pending",
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}));

				const { error: insertError } = await db
					.from("event_attendees")
					.insert(attendeeRecords);

				if (insertError) {
					console.error(
						"Error inserting new attendees:",
						insertError
					);
				}
			}

			// Remove deleted attendees
			if (removedAttendees.length > 0) {
				const removedIds = removedAttendees.map((a) => a.user_id);
				const { error: deleteError } = await db
					.from("event_attendees")
					.delete()
					.eq("event_id", eventId)
					.in("user_id", removedIds);

				if (deleteError) {
					console.error("Error removing attendees:", deleteError);
				}
			}

			// Fetch updated attendees list
			const updatedAttendeesByEvent = await fetchEventAttendees(
				[eventId],
				db
			);
			newAttendees = updatedAttendeesByEvent[eventId] || [];
		} else {
			// No attendees provided, keep existing ones
			newAttendees = originalAttendees;
		}

		// Return updated event with only necessary fields
		const responseEvent = {
			id: updated.id,
			title: updated.title,
			startTime: updated.startTime,
			endTime: updated.endTime,
			color: updated.color,
			description: updated.description,
			isAllDay: updated.isAllDay,
			createdBy: updated.createdBy,
			projectId: updated.projectId,
			attendees: newAttendees.map((a) => ({
				user_id: a.user_id,
				status: a.status,
				responded_at: a.responded_at,
			})),
		};
		res.json(responseEvent);
	} catch (error) {
		console.error("Update error:", error);
		res.status(400).json({ error: error.message });
	}
});

// Delete event - UPDATED WITH EMAIL INTEGRATION
router.delete("/:id", async (req, res) => {
	try {
		const eventId = req.params.id;
		const userId = req.user.id;

		const db = req.db;

		// Fetch the event
		const { data: event, error: eventError } = await db
			.from("Events")
			.select("*")
			.eq("id", eventId)
			.single();

		if (eventError || !event) {
			return res.status(404).json({ error: "Event not found" });
		}

		// Check if user has permission to delete this event
		const isCreator = event.createdBy === userId;

		// For deletion, only allow creator or project admin (NOT attendees)
		let hasPermission = isCreator;

		// If not the event creator, check if user is project admin
		if (!isCreator && event.projectId) {
			const { data: project } = await db
				.from("projects")
				.select("created_by")
				.eq("id", event.projectId)
				.single();

			// User is project admin if they created the project
			if (project && project.created_by === userId) {
				hasPermission = true;
			}
		}

		// If user has no permission, deny access
		if (!hasPermission) {
			return res.status(403).json({
				error: "You do not have permission to delete this event. Only the event creator or project admin can delete events.",
			});
		}

		// Delete the event from Supabase
		const { error: deleteError } = await db
			.from("Events")
			.delete()
			.eq("id", eventId);

		if (deleteError) {
			console.error("Error deleting event:", deleteError);
			throw deleteError;
		}

		res.status(200).json({
			message: "Event deleted successfully",
			deletedEventId: eventId,
		});
	} catch (error) {
		console.error("Delete error:", error);
		res.status(500).json({ error: error.message });
	}
});

// Check user availability across all workspaces
router.post("/check-availability", verifyUser, async (req, res) => {
	try {
		const { userIds, startTime, endTime, excludeEventId } = req.body;
		const userId = req.user.id;

		if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
			return res.status(400).json({
				error: "User IDs array is required",
			});
		}

		if (!startTime || !endTime) {
			return res.status(400).json({
				error: "Start time and end time are required",
			});
		}

		const startDateTime = new Date(startTime);
		const endDateTime = new Date(endTime);

		if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
			return res.status(400).json({
				error: "Invalid date/time format",
			});
		}

		if (endDateTime <= startDateTime) {
			return res.status(400).json({
				error: "End time must be after start time",
			});
		}

		const db = req.db;

		// Get all workspaces that each user is part of
		const availabilityResults = await Promise.all(
			userIds.map(async (checkUserId) => {
				try {
					// Single-user mode: get workspaces owned by this user
					const { data: workspaceOwnership, error: wsError } = await db
						.from("workspaces")
						.select("id")
						.eq("owner_id", checkUserId);

					if (wsError) throw wsError;

					const workspaceIdArray = (workspaceOwnership || []).map(w => w.id);

					// Check for conflicts in all workspaces this user is part of
					const conflicts = [];

					// Check personal events (events with no projectId)
					let personalQuery = db
						.from("Events")
						.select(
							"id, title, startTime, endTime, projectId, createdBy, attendees"
						)
						.is("projectId", null)
						.lt("startTime", endDateTime.toISOString())
						.gt("endTime", startDateTime.toISOString());

					if (excludeEventId) {
						personalQuery = personalQuery.neq("id", excludeEventId);
					}

					const { data: personalEvents, error: personalError } =
						await personalQuery;

					if (personalError) throw personalError;

					// Filter personal events where user is creator or attendee
					const userPersonalEvents = (personalEvents || []).filter(
						(event) => {
							if (event.createdBy === checkUserId) return true;

							const attendees = event.attendees || [];
							return attendees.some(
								(attendee) =>
									(attendee.user_id === checkUserId ||
										attendee.email === req.user.email) &&
									["accepted", "maybe", "creator"].includes(
										attendee.status
									)
							);
						}
					);

					conflicts.push(
						...userPersonalEvents.map((event) => ({
							eventId: event.id,
							title: event.title,
							startTime: event.startTime,
							endTime: event.endTime,
							workspaceId: null,
							workspaceName: "Personal",
						}))
					);

					// Check events in each workspace
					for (const workspaceId of workspaceIdArray) {
						// Get all projects in this workspace
						const { data: workspaceProjects } = await db
							.from("projects")
							.select("id")
							.eq("team_id", workspaceId);

						if (workspaceProjects && workspaceProjects.length > 0) {
							const projectIds = workspaceProjects.map(
								(p) => p.id
							);

							// Check for conflicting events in this workspace
							let workspaceQuery = db
								.from("Events")
								.select(
									"id, title, startTime, endTime, projectId, createdBy, attendees"
								)
								.in("projectId", projectIds)
								.lt("startTime", endDateTime.toISOString())
								.gt("endTime", startDateTime.toISOString());

							if (excludeEventId) {
								workspaceQuery = workspaceQuery.neq(
									"id",
									excludeEventId
								);
							}

							const {
								data: workspaceEvents,
								error: workspaceError,
							} = await workspaceQuery;

							if (workspaceError) throw workspaceError;

							// Filter workspace events where user is creator or attendee
							const userWorkspaceEvents = (
								workspaceEvents || []
							).filter((event) => {
								if (event.createdBy === checkUserId)
									return true;

								const attendees = event.attendees || [];
								return attendees.some(
									(attendee) =>
										(attendee.user_id === checkUserId ||
											attendee.email ===
												req.user.email) &&
										[
											"accepted",
											"maybe",
											"creator",
										].includes(attendee.status)
								);
							});

							// Get workspace name
							const { data: workspace } = await db
								.from("workspaces")
								.select("name")
								.eq("id", workspaceId)
								.single();

							conflicts.push(
								...userWorkspaceEvents.map((event) => ({
									eventId: event.id,
									title: event.title,
									startTime: event.startTime,
									endTime: event.endTime,
									workspaceId: workspaceId,
									workspaceName:
										workspace?.name || "Unknown Workspace",
								}))
							);
						}
					}

					const isAvailable = conflicts.length === 0;

					return {
						userId: checkUserId,
						available: isAvailable,
						conflicts: conflicts,
					};
				} catch (error) {
					console.error(
						`Error checking availability for user ${checkUserId}:`,
						error
					);
					return {
						userId: checkUserId,
						available: false,
						error: error.message,
					};
				}
			})
		);

		res.json({
			success: true,
			availability: availabilityResults,
		});
	} catch (error) {
		console.error("Error checking user availability:", error);
		res.status(500).json({
			error: "Failed to check user availability",
			details: error.message,
		});
	}
});

export default router;
