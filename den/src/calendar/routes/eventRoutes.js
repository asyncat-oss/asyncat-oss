import express from "express";
import { randomUUID } from "crypto";
import { verifyUser } from "../../auth/authMiddleware.js";
import { attachDb } from "../../db/sqlite.js";

const router = express.Router();

router.use(verifyUser, attachDb);

const eventSelect =
	"id, title, startTime, endTime, color, description, location, isAllDay, createdBy";

const parseEventTimes = (body) => {
	const { startDate, endDate, startTime, endTime, date, start, end } = body;

	let startDateTime;
	let endDateTime;

	if (startTime && endTime && startTime.includes("T") && endTime.includes("T")) {
		startDateTime = new Date(startTime);
		endDateTime = new Date(endTime);
	} else if (startDate && endDate && startTime && endTime) {
		startDateTime = new Date(`${startDate}T${startTime}`);
		endDateTime = new Date(`${endDate}T${endTime}`);
	} else if (date && (start || startTime) && (end || endTime)) {
		startDateTime = new Date(`${date}T${start || startTime}`);
		endDateTime = new Date(`${date}T${end || endTime}`);
	} else {
		throw new Error("Missing required date/time information");
	}

	if (
		Number.isNaN(startDateTime?.getTime()) ||
		Number.isNaN(endDateTime?.getTime())
	) {
		throw new Error("Invalid date/time information");
	}

	if (endDateTime <= startDateTime) {
		throw new Error("End time must be after start time");
	}

	return {
		startTime: startDateTime.toISOString(),
		endTime: endDateTime.toISOString(),
	};
};

const formatEvent = (event) => ({
	id: event.id,
	title: event.title,
	startTime: event.startTime,
	endTime: event.endTime,
	color: event.color || "purple",
	description: event.description || "",
	location: event.location || "",
	isAllDay: !!event.isAllDay,
	createdBy: event.createdBy,
});

router.get("/combined-data", async (req, res) => {
	try {
		const { startDate, endDate } = req.query;
		const dateRange = startDate && endDate ? { startDate, endDate } : null;
		const userId = req.user.id;

		let eventsQ = req.db
			.from("Events")
			.select(eventSelect)
			.eq("createdBy", userId)
			.order("startTime", { ascending: true });

		if (dateRange) {
			eventsQ = eventsQ
				.lte("startTime", new Date(dateRange.endDate).toISOString())
				.gte("endTime", new Date(dateRange.startDate).toISOString());
		}

		const { data, error } = await eventsQ;
		if (error) throw error;

		const events = (data || []).map(formatEvent);

		res.json({
			success: true,
			data: { events },
			totals: { events: events.length },
		});
	} catch (error) {
		console.error("Error in combined data fetch:", error);
		res.status(500).json({
			error: "Failed to fetch combined calendar data",
			details: error.message,
		});
	}
});

router.get("/", async (req, res) => {
	try {
		const { startDate, endDate, limit = 500, offset = 0 } = req.query;
		const userId = req.user.id;

		let query = req.db
			.from("Events")
			.select(eventSelect)
			.eq("createdBy", userId)
			.order("startTime", { ascending: true })
			.range(Number(offset), Number(offset) + Number(limit) - 1);

		if (startDate && endDate) {
			query = query
				.lte("startTime", new Date(endDate).toISOString())
				.gte("endTime", new Date(startDate).toISOString());
		}

		const { data: events, error } = await query;
		if (error) throw error;

		res.json({
			userId,
			totalEvents: events?.length || 0,
			events: (events || []).map(formatEvent),
		});
	} catch (error) {
		console.error("Get user events error:", error);
		res.status(500).json({
			error: "Failed to fetch user events",
			details: error.message,
		});
	}
});

router.post("/", async (req, res) => {
	try {
		const times = parseEventTimes(req.body);
		const eventData = {
			id: randomUUID(),
			title: String(req.body.title || "").trim(),
			description: req.body.description || "",
			color: req.body.color || "purple",
			location: req.body.location || "",
			isAllDay: req.body.isAllDay || false,
			...times,
			createdBy: req.user.id,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		if (!eventData.title) {
			return res.status(400).json({ error: "Title is required" });
		}

		const { data: event, error } = await req.db
			.from("Events")
			.insert([eventData])
			.select()
			.single();

		if (error) throw error;

		res.status(201).json(formatEvent(event));
	} catch (error) {
		console.error("Error creating event:", error);
		res.status(400).json({ error: error.message });
	}
});

router.get("/:id", async (req, res) => {
	try {
		const { data: event, error } = await req.db
			.from("Events")
			.select(eventSelect)
			.eq("id", req.params.id)
			.eq("createdBy", req.user.id)
			.single();

		if (error || !event) {
			return res.status(404).json({ error: "Event not found" });
		}

		res.json(formatEvent(event));
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

router.put("/:id", async (req, res) => {
	try {
		const { data: existing, error: fetchError } = await req.db
			.from("Events")
			.select("*")
			.eq("id", req.params.id)
			.eq("createdBy", req.user.id)
			.single();

		if (fetchError || !existing) {
			return res.status(404).json({ error: "Event not found" });
		}

		const updateData = {
			title: String(req.body.title || existing.title || "").trim(),
			description: req.body.description || "",
			color: req.body.color || existing.color || "purple",
			location: req.body.location || "",
			isAllDay: req.body.isAllDay || false,
			updatedAt: new Date().toISOString(),
		};

		if (!updateData.title) {
			return res.status(400).json({ error: "Title is required" });
		}

		if (
			req.body.startDate ||
			req.body.endDate ||
			req.body.startTime ||
			req.body.endTime ||
			req.body.date ||
			req.body.start ||
			req.body.end
		) {
			Object.assign(updateData, parseEventTimes(req.body));
		}

		const { data: updated, error } = await req.db
			.from("Events")
			.update(updateData)
			.eq("id", req.params.id)
			.eq("createdBy", req.user.id)
			.select()
			.single();

		if (error) throw error;

		res.json(formatEvent(updated));
	} catch (error) {
		console.error("Update error:", error);
		res.status(400).json({ error: error.message });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		const { data: event, error: fetchError } = await req.db
			.from("Events")
			.select("id")
			.eq("id", req.params.id)
			.eq("createdBy", req.user.id)
			.single();

		if (fetchError || !event) {
			return res.status(404).json({ error: "Event not found" });
		}

		const { error } = await req.db
			.from("Events")
			.delete()
			.eq("id", req.params.id)
			.eq("createdBy", req.user.id);

		if (error) throw error;

		res.status(200).json({
			message: "Event deleted successfully",
			deletedEventId: req.params.id,
		});
	} catch (error) {
		console.error("Delete error:", error);
		res.status(500).json({ error: error.message });
	}
});

export default router;
