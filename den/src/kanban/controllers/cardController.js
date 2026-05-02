// cardController.js - Updated to use Supabase
import cardService from "../services/cardService.js";
import dependencyService from "../services/dependencyService.js";

// Get all cards in a column
const getCards = async (req, res) => {
	try {
		const { columnId } = req.params;
		const cards = await cardService.getCards(columnId, req.db);
		res.status(200).json(cards);
	} catch (error) {
		console.error("Error getting cards:", error);
		res.status(500).json({ error: error.message });
	}
};

// Get a single card by ID
const getCard = async (req, res) => {
	try {
		const { id } = req.params;
		const card = await cardService.getCardById(id, req.db);

		if (!card) {
			return res.status(404).json({ error: "Card not found" });
		}

		res.status(200).json(card);
	} catch (error) {
		console.error("Error getting card:", error);
		const statusCode = error.message === "Card not found" ? 404 : 500;
		res.status(statusCode).json({ error: error.message });
	}
};

// Create a new card
const createCard = async (req, res) => {
	try {
		let cardData;
		let files = [];

		// Check if this is a multipart form request with files
		if (req.files && req.files.length > 0) {
			// Extract cardData from the form field
			if (req.body.cardData) {
				try {
					cardData = JSON.parse(req.body.cardData);
				} catch (parseError) {
					return res
						.status(400)
						.json({ error: "Invalid cardData format" });
				}
			} else {
				return res.status(400).json({
					error: "cardData field is required when uploading files",
				});
			}

			// Prepare files in the format expected by the storage service
			files = req.files.map((file) => ({
				originalname: file.originalname,
				mimetype: file.mimetype,
				buffer: file.buffer,
				size: file.size,
			}));
		} else {
			// Regular JSON request without files
			cardData = req.body;
		}

		// Add user ID to cardData
		cardData.createdBy = req.user.id;

		// Pass files to the service
		const newCard = await cardService.createCard(
			cardData,
			req.db,
			files
		);

		// Prepare response
		const response = {
			...newCard,
			success: true,
		};

		res.status(201).json(response);
	} catch (error) {
		console.error("Error creating card:", error);
		res.status(error.statusCode || 500).json({ error: error.message });
	}
};

// Update a card
const updateCard = async (req, res) => {
	try {
		const { id } = req.params;
		const cardData = req.body;

		const updatedCard = await cardService.updateCard(
			id,
			cardData,
			req.db
		);

		res.status(200).json(updatedCard);
	} catch (error) {
		console.error("Error updating card:", error);
		const statusCode = error.message === "Card not found" ? 404 : 500;
		res.status(statusCode).json({ error: error.message });
	}
};

// Delete a card
const deleteCard = async (req, res) => {
	try {
		const { id } = req.params;

		await cardService.deleteCard(id, req.db);

		res.status(200).json({ message: "Card deleted successfully" });
	} catch (error) {
		console.error("Error deleting card:", error);
		res.status(500).json({ error: error.message });
	}
};

// Move a card
const moveCard = async (req, res) => {
	try {
		const { id } = req.params;
		const { sourceColumnId, destinationColumnId, newOrder } = req.body;

		const result = await cardService.moveCard(
			id,
			sourceColumnId,
			destinationColumnId,
			newOrder,
			req.db
		);

		res.status(200).json(result);
	} catch (error) {
		console.error("Error moving card:", error);
		res.status(500).json({ error: error.message });
	}
};

// Update checklist
const updateChecklist = async (req, res) => {
	try {
		const { id } = req.params;
		const { checklist } = req.body;

		const updatedCard = await cardService.updateChecklist(
			id,
			checklist,
			req.db
		);

		// Prepare response
		const response = {
			...updatedCard,
			success: true,
		};

		res.status(200).json(response);
	} catch (error) {
		console.error("Error updating checklist:", error);
		const statusCode = error.message === "Card not found" ? 404 : 500;
		res.status(statusCode).json({ error: error.message });
	}
};

// Update card administrator
const updateCardAdministrator = async (req, res) => {
	try {
		const { id } = req.params;
		const { administratorId } = req.body;

		const updatedCard = await cardService.updateCardAdministrator(
			id,
			administratorId,
			req.db
		);

		res.status(200).json(updatedCard);
	} catch (error) {
		console.error("Error updating card administrator:", error);
		const statusCode = error.message === "Card not found" ? 404 : 500;
		res.status(statusCode).json({ error: error.message });
	}
};

// Update subtask duration
const updateSubtaskDuration = async (req, res) => {
	try {
		const { id, subtaskId } = req.params;
		const { duration, startDate, dueDate } = req.body;

		const card = await cardService.getCardById(id, req.db);
		if (!card) {
			return res.status(404).json({ error: "Card not found" });
		}

		const updatedChecklist = card.checklist.map((item) =>
			item.id === subtaskId
				? {
						...item,
						duration:
							duration && parseInt(duration) > 0
								? parseInt(duration)
								: 0,
						startDate: startDate || item.startDate,
						dueDate: dueDate || item.dueDate,
					}
				: item
		);

		const updatedCard = await cardService.updateChecklist(
			id,
			updatedChecklist,
			req.db
		);

		// Prepare response
		const response = {
			...updatedCard,
			success: true,
		};

		res.status(200).json(response);
	} catch (error) {
		console.error("Error updating subtask duration:", error);
		const statusCode = error.message === "Card not found" ? 404 : 500;
		res.status(statusCode).json({ error: error.message });
	}
};

// Get data from calendar
const getCalendarData = async (req, res) => {
	try {
		const { startDate, endDate } = req.query;
		const userId = req.user.id;

		if (!startDate || !endDate) {
			return res.status(400).json({
				error: "Start date and end date are required",
			});
		}

		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			return res.status(400).json({
				error: "Invalid date format",
			});
		}

		// FIX: Set start to beginning of day, end to end of day
		start.setHours(0, 0, 0, 0); // Start of start date
		end.setHours(23, 59, 59, 999); // End of end date

		console.log(
			`🔍 Calendar query range: ${start.toISOString()} to ${end.toISOString()}`
		);

		// Get all cards for the user (we'll process scheduling in memory)
		const { data: cards, error: cardsError } = await req.db
			.schema("kanban")
			.from("Cards")
			.select("*")
			.eq("createdBy", userId);

		if (cardsError) throw cardsError;

		// Add dependency counts and duration calculations to all cards
		await cardService.addDependencyCountsToCards(cards || [], req.db);

		// Extract scheduled subtask slots from checklist data
		const scheduledSubtasks = [];

		(cards || []).forEach((card) => {
			if (card.checklist && Array.isArray(card.checklist)) {
				card.checklist.forEach((subtask) => {
					// Look for allocatedSlots in the subtask data
					if (
						subtask.allocatedSlots &&
						Array.isArray(subtask.allocatedSlots)
					) {
						subtask.allocatedSlots.forEach((slot) => {
							const slotStart = new Date(slot.startTime);
							const slotEnd = new Date(slot.endTime);

							// Only include slots within the requested date range.
							if (
								slotStart >= start &&
								slotEnd <= end
							) {
								scheduledSubtasks.push({
									id: `subtask-${subtask.id}-${slot.startTime}`,
									title: `${slot.title || subtask.text}`,
									startTime: slot.startTime,
									endTime: slot.endTime,
									duration: slot.duration,
									type: "subtask",
									cardId: card.id,
									cardTitle: card.title,
									subtaskId: subtask.id,
								});
							}
						});
					}
				});
			}
		});

		res.status(200).json({
			success: true,
			events: [], // No events table in this simplified version
			scheduledSubtasks,
			message: `Found ${scheduledSubtasks.length} scheduled subtasks for user ${userId}`,
		});
	} catch (error) {
		console.error("Error fetching calendar data:", error);
		res.status(500).json({ error: error.message });
	}
};

// DEPENDENCY MANAGEMENT CONTROLLER METHODS

// Get all dependencies for a card
const getCardDependencies = async (req, res) => {
	try {
		const { id } = req.params;
		const dependencies = await dependencyService.getCardDependencies(
			id,
			req.db
		);
		res.status(200).json(dependencies);
	} catch (error) {
		console.error("Error getting card dependencies:", error);
		res.status(500).json({ error: error.message });
	}
};

// Get all cards that depend on this card
const getDependentCards = async (req, res) => {
	try {
		const { id } = req.params;
		const dependentCards = await dependencyService.getDependentCards(
			id,
			req.db
		);
		res.status(200).json(dependentCards);
	} catch (error) {
		console.error("Error getting dependent cards:", error);
		res.status(500).json({ error: error.message });
	}
};

// Add a dependency to a card
const addDependency = async (req, res) => {
	try {
		const { id } = req.params;
		const { targetCardId, type = "FS", lag = 0 } = req.body;

		if (!targetCardId) {
			return res
				.status(400)
				.json({ error: "Target card ID is required" });
		}

		const dependency = await dependencyService.createDependency(
			id,
			targetCardId,
			type,
			lag,
			req.db
		);

		res.status(200).json(dependency);
	} catch (error) {
		console.error("Error adding dependency:", error);
		res.status(500).json({ error: error.message });
	}
};

// Remove a dependency from a card
const removeDependency = async (req, res) => {
	try {
		const { id, dependencyId } = req.params;

		await dependencyService.deleteDependency(
			id,
			dependencyId,
			req.db
		);

		// Return updated dependencies
		const updatedDependencies = await dependencyService.getCardDependencies(
			id,
			req.db
		);
		res.status(200).json(updatedDependencies);
	} catch (error) {
		console.error("Error removing dependency:", error);
		res.status(500).json({ error: error.message });
	}
};

// Check if all dependencies are met for a card
const checkDependenciesStatus = async (req, res) => {
	try {
		const { id } = req.params;
		const areMet = await dependencyService.areDependenciesMet(
			id,
			req.db
		);

		res.status(200).json({
			areDependenciesMet: areMet,
			cardId: id,
		});
	} catch (error) {
		console.error("Error checking dependencies status:", error);
		res.status(500).json({ error: error.message });
	}
};

// Get cards that would be unblocked if this card is completed
const getUnlockedCards = async (req, res) => {
	try {
		const { id } = req.params;
		const unlockedCards =
			await dependencyService.getUnlockedCardsByDependency(
				id,
				req.db
			);

		res.status(200).json(unlockedCards);
	} catch (error) {
		console.error("Error getting unlocked cards:", error);
		res.status(500).json({ error: error.message });
	}
};

// ATTACHMENT MANAGEMENT CONTROLLER METHODS

// Add attachment(s) to a card
const addAttachment = async (req, res) => {
	try {
		const { id } = req.params;

		if (!req.files || req.files.length === 0) {
			return res.status(400).json({ error: "No files provided" });
		}

		// Prepare files in the format expected by the storage service
		const files = req.files.map((file) => ({
			originalname: file.originalname,
			mimetype: file.mimetype,
			buffer: file.buffer,
			size: file.size,
		}));

		const updatedCard = await cardService.addAttachments(
			id,
			files,
			req.db
		);

		res.status(200).json(updatedCard);
	} catch (error) {
		console.error("Error adding attachment:", error);
		res.status(500).json({ error: error.message });
	}
};

// Add multiple attachments to a card (same as addAttachment, kept for API compatibility)
const addMultipleAttachments = async (req, res) => {
	return addAttachment(req, res);
};

// Remove an attachment from a card
const removeAttachment = async (req, res) => {
	try {
		const { id, attachmentId } = req.params;

		const updatedCard = await cardService.removeAttachment(
			id,
			decodeURIComponent(attachmentId),
			req.db
		);

		res.status(200).json(updatedCard);
	} catch (error) {
		console.error("Error removing attachment:", error);
		res.status(500).json({ error: error.message });
	}
};

export default {
	getCards,
	getCard,
	createCard,
	updateCard,
	deleteCard,
	moveCard,
	updateChecklist,
	updateCardAdministrator,
	updateSubtaskDuration,
	getCalendarData,
	// Dependency management
	getCardDependencies,
	getDependentCards,
	addDependency,
	removeDependency,
	checkDependenciesStatus,
	getUnlockedCards,
	// Attachment management
	addAttachment,
	addMultipleAttachments,
	removeAttachment,
};
