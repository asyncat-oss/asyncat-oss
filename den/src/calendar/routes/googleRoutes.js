// src/services/googleService.js

import express from "express";
import { google } from "googleapis";
import { sequelize } from "../config/database.js";
import { DataTypes, Model } from "sequelize";
import { verifyUser } from "../auth.js";
import "dotenv/config";

// Create router
const googleRouter = express.Router();

// Define the GoogleToken model
class GoogleToken extends Model {}

// Initialize the model
GoogleToken.init(
	{
		user_id: {
			type: DataTypes.UUID,
			primaryKey: true,
			allowNull: false,
		},
		access_token: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		refresh_token: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		expiry_date: {
			type: DataTypes.BIGINT,
			allowNull: true,
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW,
		},
		updated_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW,
		},
	},
	{
		sequelize,
		modelName: "google_token",
		tableName: "google_tokens",
		timestamps: false,
	}
);

// Ensure the model is synced with the database
GoogleToken.sync();

// Apply verification middleware to all routes
googleRouter.use(verifyUser);

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_REDIRECT_URL
);

// Connect Google Calendar account
googleRouter.get("/connect", async (req, res) => {
	try {
		const authUrl = oauth2Client.generateAuthUrl({
			access_type: "offline",
			scope: [
				"https://www.googleapis.com/auth/calendar.readonly",
				"https://www.googleapis.com/auth/calendar.events",
			],
			prompt: "consent", // Force consent screen to always get refresh token
			state: req.user.id, // We'll use this to verify the user on callback
		});

		res.json({ authUrl });
	} catch (error) {
		console.error("Google connect error:", error);
		res.status(500).json({
			error: "Failed to generate Google authentication URL",
		});
	}
});

// Google OAuth callback
googleRouter.get("/callback", async (req, res) => {
	const { code, state } = req.query;

	if (!code || !state) {
		return res.status(400).json({ error: "Missing required parameters" });
	}

	try {
		// Get tokens from Google
		const { tokens } = await oauth2Client.getToken(code);

		// First, check if there's an existing record for this user
		const existingToken = await GoogleToken.findOne({
			where: { user_id: state },
		});

		let result;

		if (existingToken) {
			// Update existing record
			existingToken.access_token = tokens.access_token;
			// Only update refresh token if a new one is provided
			if (tokens.refresh_token) {
				existingToken.refresh_token = tokens.refresh_token;
			}
			existingToken.expiry_date = tokens.expiry_date;
			existingToken.updated_at = new Date();

			await existingToken.save();
			result = { success: true };
		} else {
			// Insert new record
			result = await GoogleToken.create({
				user_id: state,
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token || null,
				expiry_date: tokens.expiry_date,
				created_at: new Date(),
				updated_at: new Date(),
			});
		}

		if (!result) {
			throw new Error("Failed to store Google tokens in database");
		}

		// Redirect to frontend success page
		res.redirect(`${process.env.FRONTEND_URL}/calendar?connected=true`);
	} catch (error) {
		console.error("Google callback error:", error);
		res.redirect(
			`${process.env.FRONTEND_URL}/calendar?error=${encodeURIComponent(
				error.message
			)}`
		);
	}
});

// Helper function to get Google Calendar client for a user
async function getCalendarClient(req) {
	// Retrieve tokens from database
	const token = await GoogleToken.findOne({
		where: { user_id: req.user.id },
	});

	if (!token) {
		throw new Error("No Google Calendar connection found");
	}

	// Set credentials
	oauth2Client.setCredentials({
		access_token: token.access_token,
		refresh_token: token.refresh_token,
		expiry_date: token.expiry_date,
	});

	// Check if token needs refreshing
	if (token.expiry_date && token.expiry_date <= Date.now()) {
		try {
			const { credentials } = await oauth2Client.refreshAccessToken();

			// Update tokens in database
			token.access_token = credentials.access_token;
			token.expiry_date = credentials.expiry_date;
			token.updated_at = new Date();
			await token.save();

			oauth2Client.setCredentials(credentials);
		} catch (refreshError) {
			console.error("Error refreshing token:", refreshError);
			throw new Error("Failed to refresh Google token");
		}
	}

	// Return calendar client
	return google.calendar({ version: "v3", auth: oauth2Client });
}

// Check connection status
googleRouter.get("/status", async (req, res) => {
	try {
		const token = await GoogleToken.findOne({
			where: { user_id: req.user.id },
			attributes: ["created_at", "updated_at"],
		});

		if (!token) {
			return res.json({
				connected: false,
				message: "No Google Calendar connection found",
			});
		}

		res.json({
			connected: true,
			connectedSince: token.created_at,
			lastUpdated: token.updated_at,
		});
	} catch (error) {
		console.error("Error checking connection status:", error);
		res.status(500).json({
			error: "Failed to check Google Calendar connection status",
		});
	}
});

// Disconnect Google Calendar
googleRouter.delete("/disconnect", async (req, res) => {
	try {
		const deleted = await GoogleToken.destroy({
			where: { user_id: req.user.id },
		});

		if (!deleted) {
			return res.status(404).json({
				success: false,
				message: "No Google Calendar connection found to disconnect",
			});
		}

		res.json({
			success: true,
			message: "Google Calendar disconnected successfully",
		});
	} catch (error) {
		console.error("Error disconnecting Google Calendar:", error);
		res.status(500).json({ error: "Failed to disconnect Google Calendar" });
	}
});

// Fetch Google Calendar events (within a time range)
googleRouter.get("/events", async (req, res) => {
	try {
		const { timeMin, timeMax, maxResults = 50 } = req.query;

		// Validate timeMin/timeMax parameters
		if (!timeMin || !timeMax) {
			return res.status(400).json({
				error: "Both timeMin and timeMax parameters are required",
			});
		}

		// Create ISO strings if they're not already
		const timeMinIso = new Date(timeMin).toISOString();
		const timeMaxIso = new Date(timeMax).toISOString();

		// Get calendar client
		const calendar = await getCalendarClient(req);

		// Fetch events from Google Calendar
		const response = await calendar.events.list({
			calendarId: "primary",
			timeMin: timeMinIso,
			timeMax: timeMaxIso,
			maxResults: parseInt(maxResults, 10),
			singleEvents: true,
			orderBy: "startTime",
		});

		// Transform Google events to match your application's format
		const events = response.data.items.map((event) => {
			// Handle different date/time formats from Google
			const startObj = event.start.dateTime
				? {
						dateTime: event.start.dateTime,
						timeZone: event.start.timeZone || "UTC",
				  }
				: {
						date: event.start.date,
						isAllDay: true,
				  };

			const endObj = event.end.dateTime
				? {
						dateTime: event.end.dateTime,
						timeZone: event.end.timeZone || "UTC",
				  }
				: {
						date: event.end.date,
						isAllDay: true,
				  };

			return {
				id: event.id,
				title: event.summary || "(No title)",
				description: event.description || "",
				location: event.location || "",
				start: startObj,
				end: endObj,
				isAllDay: !event.start.dateTime,
				htmlLink: event.htmlLink,
				status: event.status,
				creator: event.creator,
				organizer: event.organizer,
				attendees: event.attendees || [],
				sourceType: "google",
			};
		});

		// Return formatted events
		res.json({
			events,
			nextPageToken: response.data.nextPageToken,
		});
	} catch (error) {
		console.error("Error fetching Google Calendar events:", error);

		if (error.message === "No Google Calendar connection found") {
			return res
				.status(404)
				.json({ error: "Google Calendar not connected" });
		}

		res.status(500).json({
			error: "Failed to fetch Google Calendar events",
		});
	}
});

// Create an event in Google Calendar
googleRouter.post("/events", async (req, res) => {
	try {
		const {
			title,
			description,
			location,
			start,
			end,
			attendees,
			recurrence,
		} = req.body;

		// Validate required fields
		if (!title || !start || !end) {
			return res.status(400).json({
				error: "Missing required event fields (title, start, end)",
			});
		}

		// Get calendar client
		const calendar = await getCalendarClient(req);

		// Prepare event data for Google Calendar
		const event = {
			summary: title,
			location: location || "",
			description: description || "",
			start: {},
			end: {},
			attendees: attendees ? attendees.map((email) => ({ email })) : [],
			reminders: {
				useDefault: true,
			},
		};

		// Handle different date formats
		if (start.date) {
			// All-day event
			event.start.date = start.date;
			event.end.date = end.date;
		} else {
			// Timed event
			event.start.dateTime =
				start.dateTime || new Date(start).toISOString();
			event.start.timeZone = start.timeZone || "UTC";
			event.end.dateTime = end.dateTime || new Date(end).toISOString();
			event.end.timeZone = end.timeZone || "UTC";
		}

		// Add recurrence if specified
		if (recurrence && recurrence.length > 0) {
			event.recurrence = recurrence;
		}

		// Create event in Google Calendar
		const response = await calendar.events.insert({
			calendarId: "primary",
			resource: event,
			sendUpdates: attendees && attendees.length > 0 ? "all" : "none",
		});

		// Return created event data
		res.status(201).json({
			id: response.data.id,
			googleEventId: response.data.id,
			title: response.data.summary,
			description: response.data.description,
			location: response.data.location,
			startTime: response.data.start.dateTime || response.data.start.date,
			endTime: response.data.end.dateTime || response.data.end.date,
			isAllDay: !!response.data.start.date,
			htmlLink: response.data.htmlLink,
			status: response.data.status,
			sourceType: "google",
		});
	} catch (error) {
		console.error("Error creating Google Calendar event:", error);

		if (error.message === "No Google Calendar connection found") {
			return res
				.status(404)
				.json({ error: "Google Calendar not connected" });
		}

		res.status(500).json({
			error: "Failed to create Google Calendar event",
		});
	}
});

// Helper function to get list of tables
async function getTableList() {
	const tables = await sequelize.query(
		`SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public'
     ORDER BY table_name`,
		{ type: sequelize.QueryTypes.SELECT }
	);
	return tables.map((t) => t.table_name);
}

// Update an event in Google Calendar
googleRouter.put("/events/:eventId", async (req, res) => {
	try {
		const { eventId } = req.params;
		const {
			title,
			description,
			location,
			start,
			end,
			attendees,
			recurrence,
		} = req.body;

		// Validate required fields
		if (!title || !start || !end) {
			return res.status(400).json({
				error: "Missing required event fields (title, start, end)",
			});
		}

		// Get calendar client
		const calendar = await getCalendarClient(req);

		// Prepare event data for Google Calendar
		const event = {
			summary: title,
			location: location || "",
			description: description || "",
			start: {},
			end: {},
			attendees: attendees ? attendees.map((email) => ({ email })) : [],
			reminders: {
				useDefault: true,
			},
		};

		// Handle different date formats
		if (start.date) {
			// All-day event
			event.start.date = start.date;
			event.end.date = end.date;
		} else {
			// Timed event
			event.start.dateTime =
				start.dateTime || new Date(start).toISOString();
			event.start.timeZone = start.timeZone || "UTC";
			event.end.dateTime = end.dateTime || new Date(end).toISOString();
			event.end.timeZone = end.timeZone || "UTC";
		}

		// Add recurrence if specified
		if (recurrence && recurrence.length > 0) {
			event.recurrence = recurrence;
		}

		// Update event in Google Calendar
		const response = await calendar.events.update({
			calendarId: "primary",
			eventId: eventId,
			resource: event,
			sendUpdates: attendees && attendees.length > 0 ? "all" : "none",
		});

		// Return updated event data
		res.json({
			id: response.data.id,
			googleEventId: response.data.id,
			title: response.data.summary,
			description: response.data.description,
			location: response.data.location,
			startTime: response.data.start.dateTime || response.data.start.date,
			endTime: response.data.end.dateTime || response.data.end.date,
			isAllDay: !!response.data.start.date,
			htmlLink: response.data.htmlLink,
			status: response.data.status,
			sourceType: "google",
		});
	} catch (error) {
		console.error("Error updating Google Calendar event:", error);

		if (error.message === "No Google Calendar connection found") {
			return res
				.status(404)
				.json({ error: "Google Calendar not connected" });
		}

		res.status(500).json({
			error: "Failed to update Google Calendar event",
		});
	}
});

// Delete an event from Google Calendar
googleRouter.delete("/events/:eventId", async (req, res) => {
	try {
		const { eventId } = req.params;

		// Get calendar client
		const calendar = await getCalendarClient(req);

		// Delete event from Google Calendar
		await calendar.events.delete({
			calendarId: "primary",
			eventId: eventId,
		});

		// Return success message
		res.json({
			success: true,
			message: "Google Calendar event deleted successfully",
			deletedEventId: eventId,
		});
	} catch (error) {
		console.error("Error deleting Google Calendar event:", error);

		if (error.message === "No Google Calendar connection found") {
			return res
				.status(404)
				.json({ error: "Google Calendar not connected" });
		}

		if (error.code === 404) {
			return res
				.status(404)
				.json({ error: "Event not found in Google Calendar" });
		}

		res.status(500).json({
			error: "Failed to delete Google Calendar event",
		});
	}
});

// Get Google Calendar list
googleRouter.get("/calendar-list", async (req, res) => {
	try {
		// Get calendar client
		const calendar = await getCalendarClient(req);

		// Get list of calendars
		const response = await calendar.calendarList.list();

		// Format and return calendar list
		const calendars = response.data.items.map((cal) => ({
			id: cal.id,
			summary: cal.summary,
			description: cal.description,
			timeZone: cal.timeZone,
			backgroundColor: cal.backgroundColor,
			primary: cal.primary || false,
			accessRole: cal.accessRole,
		}));

		res.json(calendars);
	} catch (error) {
		console.error("Error fetching Google Calendar list:", error);

		if (error.message === "No Google Calendar connection found") {
			return res
				.status(404)
				.json({ error: "Google Calendar not connected" });
		}

		res.status(500).json({ error: "Failed to fetch Google Calendar list" });
	}
});

export default googleRouter;
