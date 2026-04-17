import express from "express";
const router = express.Router();
import { verifyUser } from "../auth.js";
import { attachCompat } from "../../db/compat.js";
import { sendRSVPNotification } from "../services/calendarEmailService.js";

// Apply verification middleware to all routes
router.use(verifyUser, attachCompat);

/**
 * Helper function to check if a user has access to a project
 * @param {string} userId - The user's ID
 * @param {string} projectId - The project's ID
 * @param {object} supabase - Supabase client
 * @returns {Promise<boolean>} - Whether the user has access to the project
 */
// Single-user mode: access granted if user owns the project
const hasProjectAccess = async (userId, projectId, supabase) => {
	try {
		const { data: project, error: projectError } = await supabase
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

// Get pending event invites for current user
router.get("/invites", async (req, res) => {
	try {
		const userId = req.user.id;

		const supabase = req.supabase;

		// Find pending invitations for the user in event_attendees table
		const { data: invitations, error: invitationsError } = await supabase
			.from("event_attendees")
			.select("event_id, status")
			.eq("user_id", userId)
			.eq("status", "pending");

		if (invitationsError) throw invitationsError;

		if (!invitations || invitations.length === 0) {
			return res.json({
				success: true,
				data: [],
			});
		}

		const eventIds = invitations.map((inv) => inv.event_id);

		// Fetch event details
		const { data: events, error: eventsError } = await supabase
			.from("Events")
			.select(
				"id, title, description, startTime, endTime, location, isAllDay, color, projectId, createdBy, createdAt"
			)
			.in("id", eventIds)
			.order("createdAt", { ascending: false });

		if (eventsError) throw eventsError;

		// Get creator information for each event
		const creatorIds = [...new Set(events.map((event) => event.createdBy))];
		const { data: creators, error: creatorsError } = await supabase
			.from("users")
			.select("id, name, email")
			.in("id", creatorIds);

		if (creatorsError) throw creatorsError;

		// Get unique project IDs from events
		const projectIds = [
			...new Set(events.map((e) => e.projectId).filter(Boolean)),
		];

		// Fetch project information for all projects
		let projectsMap = {};
		if (projectIds.length > 0) {
			const { data: projects, error: projectsError } = await supabase
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

		// Format events with creator information
		const formattedEvents = events.map((eventData) => {
			const creator = creators.find((c) => c.id === eventData.createdBy);
			const project = eventData.projectId
				? projectsMap[eventData.projectId]
				: null;

			return {
				id: eventData.id,
				title: eventData.title,
				description: eventData.description,
				startTime: eventData.startTime,
				endTime: eventData.endTime,
				location: eventData.location,
				isAllDay: eventData.isAllDay,
				color: eventData.color,
				projectId: eventData.projectId,
				projectName: project ? project.name : null,
				createdBy: eventData.createdBy,
				creator: creator || {
					id: eventData.createdBy,
					name: "Unknown User",
					email: "",
				},
				createdAt: eventData.createdAt,
			};
		});

		res.json({
			success: true,
			data: formattedEvents,
		});
	} catch (error) {
		console.error("Error fetching event invites:", error);
		res.status(500).json({
			success: false,
			error: error.message || "Failed to fetch event invites",
		});
	}
});

// Respond to event invitation (accept/decline/maybe) - UPDATED WITH EMAIL INTEGRATION
router.post("/:eventId/respond", async (req, res) => {
	try {
		const { eventId } = req.params;
		const { accept, response, message } = req.body; // Support both old 'accept' and new 'response' format + optional message
		const userId = req.user.id;

		// Determine the response status
		let status;
		if (response) {
			// New format: response can be 'accepted', 'declined', or 'maybe'
			if (!["accepted", "declined", "maybe"].includes(response)) {
				return res.status(400).json({
					success: false,
					error: "Invalid response. Must be 'accepted', 'declined', or 'maybe'",
				});
			}
			status = response;
		} else {
			// Legacy format: accept boolean
			status = accept ? "accepted" : "declined";
		}

		const supabase = req.supabase;

		// Find the event
		const { data: event, error: eventError } = await supabase
			.from("Events")
			.select("id, title, startTime, endTime, projectId, createdBy")
			.eq("id", eventId)
			.single();

		if (eventError || !event) {
			return res.status(404).json({
				success: false,
				error: "Event not found",
			});
		}

		// Check if user is invited to this event
		const { data: attendee, error: attendeeError } = await supabase
			.from("event_attendees")
			.select("*")
			.eq("event_id", eventId)
			.eq("user_id", userId)
			.single();

		if (attendeeError || !attendee) {
			return res.status(400).json({
				success: false,
				error: "You are not invited to this event",
			});
		}

		// Don't allow the event creator to change their status
		if (attendee.status === "creator") {
			return res.status(400).json({
				success: false,
				error: "Event creators cannot change their attendance status",
			});
		}

		// Update attendee status in event_attendees table
		const { data: updatedAttendee, error: updateError } = await supabase
			.from("event_attendees")
			.update({
				status: status,
				responded_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.eq("event_id", eventId)
			.eq("user_id", userId)
			.select()
			.single();

		if (updateError) {
			console.error("Error updating attendee status:", updateError);
			throw updateError;
		}

		// THE CAT'S EMAIL MAGIC: Send RSVP notification to event organizer
		try {
			const respondentInfo = {
				id: req.user.id,
				name:
					req.user.user_metadata?.full_name ||
					req.user.email.split("@")[0],
				email: req.user.email,
			};

			// Create event object with minimal attendee info for email
			const eventForEmail = {
				...event,
				attendees: [{ user_id: userId, status: status }],
			};

			// Send RSVP notification (don't await - let it run in background)
			sendRSVPNotification(
				eventForEmail,
				respondentInfo,
				status,
				supabase,
				message
			).catch((error) =>
				console.error(
					"The Cat failed to send RSVP notification:",
					error
				)
			);

			console.log(
				`The Cat is notifying the organizer about ${respondentInfo.name}'s ${status} response! 🐱`
			);
		} catch (emailError) {
			console.error(
				"The Cat encountered email issues during RSVP:",
				emailError
			);
			// Don't fail the RSVP if email fails
		}

		res.json({
			success: true,
			message: `Successfully updated response to "${status}"`,
			data: {
				eventId: eventId,
				status: status,
			},
		});
	} catch (error) {
		console.error("Error responding to event invitation:", error);
		res.status(500).json({
			success: false,
			error: error.message || "Failed to respond to event invitation",
		});
	}
});

// Get event invitation status for a specific event (for the current user)
router.get("/:eventId/status", async (req, res) => {
	try {
		const { eventId } = req.params;
		const userId = req.user.id;

		const supabase = req.supabase;

		// First, check if the event exists and if user is the creator
		const { data: event, error: eventError } = await supabase
			.from("Events")
			.select("id, createdBy")
			.eq("id", eventId)
			.single();

		if (eventError || !event) {
			return res.status(404).json({
				success: false,
				error: "Event not found",
			});
		}

		// Check if user is the creator
		if (event.createdBy === userId) {
			return res.json({
				success: true,
				data: {
					isCreator: true,
					status: "creator",
				},
			});
		}

		// Check if user is invited via event_attendees table
		const { data: attendee, error: attendeeError } = await supabase
			.from("event_attendees")
			.select("status, responded_at")
			.eq("event_id", eventId)
			.eq("user_id", userId)
			.single();

		// If not found in event_attendees, user is not invited
		if (attendeeError || !attendee) {
			return res.json({
				success: true,
				data: {
					isCreator: false,
					status: "not_invited",
				},
			});
		}

		res.json({
			success: true,
			data: {
				isCreator: false,
				status: attendee.status,
				responded_at: attendee.responded_at,
			},
		});
	} catch (error) {
		console.error("Error checking event invitation status:", error);
		res.status(500).json({
			success: false,
			error: error.message || "Failed to check invitation status",
		});
	}
});

export default router;
