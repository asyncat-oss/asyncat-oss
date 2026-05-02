// cardService.js - Updated to use Supabase
import { randomUUID } from "crypto";
import axios from "axios";
import storageService from "./storageService.js";

// UUID validation helper
const isValidUUID = (uuid) => {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		uuid
	);
};

const normalizeChecklistItem = (item) => {
	const normalized = { ...item };
	delete normalized.assignees;
	delete normalized.assigneeDetails;

	return {
		...normalized,
		duration:
			item.duration && parseInt(item.duration) > 0
				? parseInt(item.duration)
				: null,
	};
};

const normalizeChecklist = (checklist = []) => {
	if (!Array.isArray(checklist)) return [];
	return checklist.map(normalizeChecklistItem);
};

const getCards = async (columnId, db) => {
	try {
		if (!isValidUUID(columnId)) {
			throw new Error("Invalid column ID format");
		}

		const { data: cards, error } = await db
			.schema("kanban")
			.from("Cards")
			.select("*")
			.eq("columnId", columnId)
			.order('"order"', { ascending: true });

		if (error) throw error;

		// Add dependency counts efficiently
		await addDependencyCountsToCards(cards || [], db);

		return cards || [];
	} catch (error) {
		console.error("Error getting cards:", error);
		throw error;
	}
};

const getCardById = async (id, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid card ID format");
		}

		console.log("🔍 Fetching card by ID:", id);

		const { data: card, error } = await db
			.schema("kanban")
			.from("Cards")
			.select("*")
			.eq("id", id)
			.single();

		if (error) {
			if (error.code === "PGRST116") {
				throw new Error("Card not found");
			}
			throw error;
		}

		if (card) {
			console.log("📋 Card found with checklist:", card.checklist);
			// Add dependency counts efficiently for single card
			await addDependencyCountsToCards([card], db);
			console.log(
				"📋 Card after adding dependency counts:",
				card.checklist
			);
		} else {
			console.log("❌ Card not found for ID:", id);
			throw new Error("Card not found");
		}

		return card;
	} catch (error) {
		console.error("Error getting card by ID:", error);
		throw error;
	}
};

const createCard = async (cardData, db, files = []) => {
	try {
		const {
			title,
			description,
			priority = "Medium",
			columnId,
			order,
			startDate,
			dueDate,
			duration,
			checklist = [],
			createdBy,
			administrator_id,
			dependencies = [],
			attachments = [],
		} = cardData;

		if (!isValidUUID(columnId)) {
			throw new Error("Invalid column ID format");
		}

		if (!isValidUUID(createdBy)) {
			throw new Error("Invalid user ID format");
		}

		const processedChecklist = normalizeChecklist(checklist);

		// Calculate progress
		const completedTasks = processedChecklist.filter(
			(task) => task.completed
		).length;
		const progress =
			processedChecklist.length > 0
				? Math.round((completedTasks / processedChecklist.length) * 100)
				: 0;

		// Generate a temporary card ID for file uploads (will be replaced with actual ID)
		const tempCardId = `temp-${Date.now()}`;

		// Handle file uploads if files are provided
		let uploadedAttachments = [];
		if (files && files.length > 0) {
			console.log(`Uploading ${files.length} files for card...`);

			try {
				// Upload all files to storage
				const uploadPromises = files.map((file) =>
					storageService.uploadFile(file, tempCardId)
				);
				uploadedAttachments = await Promise.all(uploadPromises);
				console.log(
					`Successfully uploaded ${uploadedAttachments.length} files`
				);
			} catch (uploadError) {
				console.error("Error uploading files:", uploadError);
				throw new Error(`File upload failed: ${uploadError.message}`);
			}
		}

		// Merge uploaded attachments with any existing attachments
		const allAttachments = [
			...(Array.isArray(attachments) ? attachments : []),
			...uploadedAttachments,
		];

		const cardToCreate = {
			id: randomUUID(),
			title,
			description,
			priority,
			columnId,
			order: order || 0,
			startDate,
			dueDate,
			checklist: processedChecklist,
			createdBy,
			administrator_id:
				typeof administrator_id === "object" &&
				administrator_id !== null
					? administrator_id.id
					: administrator_id,
			dependencies: Array.isArray(dependencies) ? dependencies : [],
			attachments: allAttachments,
			progress,
			tasks: {
				completed: completedTasks,
				total: processedChecklist.length,
			},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const { data: card, error } = await db
			.schema("kanban")
			.from("Cards")
			.insert([cardToCreate])
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the newly created card
		await addDependencyCountsToCards([card], db);

		return card;
	} catch (error) {
		console.error("Error creating card:", error);
		throw error;
	}
};

const updateCard = async (id, cardData, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid card ID format");
		}

		// First get the existing card
		const existingCard = await getCardById(id, db);

		// Keep old collaboration payloads from leaking into local-first card data.
		const updateData = { ...cardData };
		delete updateData.assignees;

		// Process administrator_id if present (single administrator)
		if (updateData.administrator_id !== undefined) {
			updateData.administrator_id =
				typeof updateData.administrator_id === "object" &&
				updateData.administrator_id !== null
					? updateData.administrator_id.id
					: updateData.administrator_id;
		}

		// Process checklist if present for the local-first subtask shape.
		if (updateData.checklist) {
			updateData.checklist = normalizeChecklist(updateData.checklist);

			// Calculate progress if checklist was updated
			const completedTasks = updateData.checklist.filter(
				(task) => task.completed
			).length;
			const progress =
				updateData.checklist.length > 0
					? Math.round(
							(completedTasks / updateData.checklist.length) * 100
						)
					: 0;

			updateData.progress = progress;
			updateData.tasks = {
				completed: completedTasks,
				total: updateData.checklist.length,
			};
		}

		updateData.updatedAt = new Date().toISOString();

		console.log("💾 About to save card with updateData:", updateData);

		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update(updateData)
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the returned card
		await addDependencyCountsToCards([updatedCard], db);

		console.log(
			"✅ Card updated successfully, returning card with checklist:",
			updatedCard.checklist
		);
		return updatedCard;
	} catch (error) {
		console.error("Error updating card:", error);
		throw error;
	}
};

const deleteCard = async (id, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid card ID format");
		}

		// First, get the card to retrieve its attachments
		const card = await getCardById(id, db);

		// Delete all attachments from Azure Storage if they exist
		if (
			card.attachments &&
			Array.isArray(card.attachments) &&
			card.attachments.length > 0
		) {
			console.log(
				`Deleting ${card.attachments.length} attachments for card ${id}...`
			);

			const deletePromises = card.attachments.map((attachment) => {
				if (attachment.blobName) {
					return storageService
						.deleteFile(attachment.blobName)
						.catch((err) => {
							// Log error but don't fail the card deletion
							console.error(
								`Failed to delete attachment ${attachment.blobName}:`,
								err
							);
						});
				}
				return Promise.resolve();
			});

			await Promise.all(deletePromises);
			console.log(`Successfully deleted attachments for card ${id}`);
		}

		// Now delete the card from the database
		const { error } = await db
			.schema("kanban")
			.from("Cards")
			.delete()
			.eq("id", id);

		if (error) throw error;

		return { message: "Card deleted successfully" };
	} catch (error) {
		console.error("Error deleting card:", error);
		throw error;
	}
};

const moveCard = async (
	cardId,
	sourceColumnId,
	destinationColumnId,
	newOrder,
	db
) => {
	try {
		if (
			!isValidUUID(cardId) ||
			!isValidUUID(sourceColumnId) ||
			!isValidUUID(destinationColumnId)
		) {
			throw new Error("Invalid ID format");
		}

		// Get card and columns
		const card = await getCardById(cardId, db);

		const { data: sourceColumn, error: sourceError } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", sourceColumnId)
			.single();

		if (sourceError) throw sourceError;

		const { data: destColumn, error: destError } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", destinationColumnId)
			.single();

		if (destError) throw destError;

		if (!sourceColumn || !destColumn) {
			throw new Error("Source or destination column not found");
		}

		// Prepare card updates
		const cardUpdates = {
			columnId: destinationColumnId,
			order: newOrder,
			updatedAt: new Date().toISOString(),
		};

		// Check if moving to a completion column
		const isCompleting = destColumn.isCompletionColumn;
		const isStarting = !sourceColumn.isCompletionColumn && !isCompleting;

		// Add timestamps based on column type
		if (isStarting && !card.startedAt) {
			cardUpdates.startedAt = new Date().toISOString();
		}
		if (isCompleting) {
			cardUpdates.completedAt = new Date().toISOString();
		}

		// Validate completion requirements
		if (isCompleting) {
			// Check if all subtasks are completed
			if (card.checklist && card.checklist.length > 0) {
				const allSubtasksCompleted = card.checklist.every(
					(item) => item.completed
				);
				if (!allSubtasksCompleted) {
					throw new Error(
						"All subtasks must be completed before moving to a completion column"
					);
				}
			}

			// Check dependencies using the TaskDependencies table
			const { data: dependencies, error: depsError } = await db
				.schema("kanban")
				.from("TaskDependencies")
				.select("*")
				.eq("sourceCardId", cardId);

			if (depsError) throw depsError;

			if (dependencies && dependencies.length > 0) {
				// Get target cards and their columns separately
				const targetCardIds = dependencies.map(
					(dep) => dep.targetCardId
				);

				const { data: targetCards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.in("id", targetCardIds);

				if (cardsError) throw cardsError;

				// Get columns for target cards
				const columnIds = [
					...new Set(targetCards.map((card) => card.columnId)),
				];
				const { data: columns, error: columnsError } = await db
					.schema("kanban")
					.from("Columns")
					.select("*")
					.in("id", columnIds);

				if (columnsError) throw columnsError;

				// Create column lookup map
				const columnMap = new Map(columns.map((col) => [col.id, col]));

				for (const dependency of dependencies) {
					const depCard = targetCards.find(
						(card) => card.id === dependency.targetCardId
					);
					const depColumn = depCard
						? columnMap.get(depCard.columnId)
						: null;

					if (!depCard || !depColumn) {
						console.warn(
							`Dependency card ${dependency.targetCardId} or its column not found`
						);
						continue;
					}

					const depType = dependency.type;

					// Check if dependency is met based on its type
					let isDepMet = false;
					let errorMessage = "";

					switch (depType) {
						case "FS": // Finish-to-Start
							isDepMet = depColumn.isCompletionColumn;
							errorMessage = `Cannot complete this card until "${depCard.title}" is finished`;
							break;

						case "SS": // Start-to-Start
							isDepMet =
								depCard.startedAt !== null ||
								depColumn.isCompletionColumn;
							errorMessage = `Cannot complete this card until "${depCard.title}" is started`;
							break;

						case "FF": // Finish-to-Finish
							isDepMet = depColumn.isCompletionColumn;
							errorMessage = `Cannot complete this card until "${depCard.title}" is finished`;
							break;

						case "SF": // Start-to-Finish
							isDepMet =
								depCard.startedAt !== null ||
								depColumn.isCompletionColumn;
							errorMessage = `Cannot complete this card until "${depCard.title}" is started`;
							break;

						default:
							isDepMet = false;
							errorMessage = `Unknown dependency type for "${depCard.title}"`;
					}

					if (!isDepMet) {
						// Check lag time if applicable
						if (dependency.lag > 0) {
							let referenceDate;

							if (depType === "FS" || depType === "FF") {
								referenceDate = depCard.completedAt;
							} else {
								referenceDate = depCard.startedAt;
							}

							if (referenceDate) {
								const now = new Date();
								const lagMs = dependency.lag * 60 * 60 * 1000; // Convert hours to milliseconds
								const requiredDate = new Date(
									new Date(referenceDate).getTime() + lagMs
								);
								const lagMet = now >= requiredDate;

								if (!lagMet) {
									const remainingHours = Math.ceil(
										(requiredDate - now) / (60 * 60 * 1000)
									);
									errorMessage += ` (${remainingHours}h lag remaining)`;
								}
							}
						}

						throw new Error(errorMessage);
					}

					// Check if dependency has incomplete subtasks
					if (depCard.checklist && depCard.checklist.length > 0) {
						const hasIncompleteSubtasks = depCard.checklist.some(
							(item) => !item.completed
						);
						if (hasIncompleteSubtasks) {
							throw new Error(
								`Cannot complete this card until all subtasks in "${depCard.title}" are completed`
							);
						}
					}
				}
			}
		}

		// Update card order in columns
		const oldOrder = card.order;

		try {
			// Moving within the same column
			if (sourceColumnId === destinationColumnId) {
				if (newOrder < oldOrder) {
					// Get cards that need their order incremented
					const { data: cardsToUpdate, error: fetchError } =
						await db
							.schema("kanban")
							.from("Cards")
							.select("id, order")
							.eq("columnId", sourceColumnId)
							.gte("order", newOrder)
							.lt("order", oldOrder);

					if (fetchError) throw fetchError;

					// Update each card individually
					for (const cardToUpdate of cardsToUpdate || []) {
						const { error: updateError } = await db
							.schema("kanban")
							.from("Cards")
							.update({
								order: cardToUpdate.order + 1,
								updatedAt: new Date().toISOString(),
							})
							.eq("id", cardToUpdate.id);

						if (updateError) throw updateError;
					}
				} else if (newOrder > oldOrder) {
					// Get cards that need their order decremented
					const { data: cardsToUpdate, error: fetchError } =
						await db
							.schema("kanban")
							.from("Cards")
							.select("id, order")
							.eq("columnId", sourceColumnId)
							.gt("order", oldOrder)
							.lte("order", newOrder);

					if (fetchError) throw fetchError;

					// Update each card individually
					for (const cardToUpdate of cardsToUpdate || []) {
						const { error: updateError } = await db
							.schema("kanban")
							.from("Cards")
							.update({
								order: cardToUpdate.order - 1,
								updatedAt: new Date().toISOString(),
							})
							.eq("id", cardToUpdate.id);

						if (updateError) throw updateError;
					}
				}
			} else {
				// Moving to a different column

				// First, update cards in source column (decrement orders above moved card)
				const { data: sourceCardsToUpdate, error: sourceFetchError } =
					await db
						.schema("kanban")
						.from("Cards")
						.select("id, order")
						.eq("columnId", sourceColumnId)
						.gt("order", oldOrder);

				if (sourceFetchError) throw sourceFetchError;

				for (const cardToUpdate of sourceCardsToUpdate || []) {
					const { error: updateError } = await db
						.schema("kanban")
						.from("Cards")
						.update({
							order: cardToUpdate.order - 1,
							updatedAt: new Date().toISOString(),
						})
						.eq("id", cardToUpdate.id);

					if (updateError) throw updateError;
				}

				// Then, update cards in destination column (increment orders at/above new position)
				const { data: destCardsToUpdate, error: destFetchError } =
					await db
						.schema("kanban")
						.from("Cards")
						.select("id, order")
						.eq("columnId", destinationColumnId)
						.gte("order", newOrder);

				if (destFetchError) throw destFetchError;

				for (const cardToUpdate of destCardsToUpdate || []) {
					const { error: updateError } = await db
						.schema("kanban")
						.from("Cards")
						.update({
							order: cardToUpdate.order + 1,
							updatedAt: new Date().toISOString(),
						})
						.eq("id", cardToUpdate.id);

					if (updateError) throw updateError;
				}
			}
		} catch (orderError) {
			console.error("Error updating card orders:", orderError);
			throw orderError;
		}

		// Update the card
		const { data: updatedCard, error: updateError } = await db
			.schema("kanban")
			.from("Cards")
			.update(cardUpdates)
			.eq("id", cardId)
			.select()
			.single();

		if (updateError) throw updateError;

		// Get updated columns with cards
		const { data: updatedSourceColumn, error: sourceColError } =
			await db
				.schema("kanban")
				.from("Columns")
				.select("*")
				.eq("id", sourceColumnId)
				.single();

		if (sourceColError) throw sourceColError;

		// Fetch cards for source column
		const { data: sourceCards, error: sourceCardsError } = await db
			.schema("kanban")
			.from("Cards")
			.select("*")
			.eq("columnId", sourceColumnId)
			.order('"order"', { ascending: true });

		if (sourceCardsError) throw sourceCardsError;

		updatedSourceColumn.Cards = sourceCards || [];

		let updatedDestinationColumn = updatedSourceColumn;
		if (sourceColumnId !== destinationColumnId) {
			const { data: destCol, error: destColError } = await db
				.schema("kanban")
				.from("Columns")
				.select("*")
				.eq("id", destinationColumnId)
				.single();

			if (destColError) throw destColError;

			// Fetch cards for destination column
			const { data: destCards, error: destCardsError } = await db
				.schema("kanban")
				.from("Cards")
				.select("*")
				.eq("columnId", destinationColumnId)
				.order('"order"', { ascending: true });

			if (destCardsError) throw destCardsError;

			destCol.Cards = destCards || [];
			updatedDestinationColumn = destCol;
		}

		// Get unlocked cards if completing
		let unlockedCards = [];
		if (isCompleting) {
			// This would need to be implemented based on dependency logic
			// For now, return empty array
			unlockedCards = [];
		}

		// Add dependency counts to the updated card
		await addDependencyCountsToCards([updatedCard], db);

		return {
			sourceColumn: updatedSourceColumn,
			destinationColumn: updatedDestinationColumn,
			card: updatedCard,
			unlockedCards: unlockedCards.length > 0 ? unlockedCards : undefined,
		};
	} catch (error) {
		console.error("Error moving card:", error);
		throw error;
	}
};

const updateChecklist = async (id, checklist, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid card ID format");
		}

		const processedChecklist = normalizeChecklist(checklist);

		// Calculate progress
		const completedTasks = processedChecklist.filter(
			(task) => task.completed
		).length;
		const progress =
			processedChecklist.length > 0
				? Math.round((completedTasks / processedChecklist.length) * 100)
				: 0;

		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update({
				checklist: processedChecklist,
				progress,
				tasks: {
					completed: completedTasks,
					total: processedChecklist.length,
				},
				updatedAt: new Date().toISOString(),
			})
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the returned card
		await addDependencyCountsToCards([updatedCard], db);

		// Calculate and add the duration field from incomplete items only
		if (updatedCard.checklist && Array.isArray(updatedCard.checklist)) {
			const computedDuration = updatedCard.checklist.reduce(
				(total, item) => {
					// Only include duration if the item is not completed
					if (!item.completed) {
						const itemDuration = parseInt(item.duration) || 0;
						return total + itemDuration;
					}
					return total;
				},
				0
			);
			updatedCard.duration = computedDuration;
		} else {
			updatedCard.duration = 0;
		}

		return updatedCard;
	} catch (error) {
		console.error("Error updating checklist:", error);
		throw error;
	}
};

const updateCardAdministrator = async (id, administratorId, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid card ID format");
		}

		const processedAdministratorId =
			typeof administratorId === "object"
				? administratorId.id
				: administratorId;

		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update({
				administrator_id: processedAdministratorId,
				updatedAt: new Date().toISOString(),
			})
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the returned card
		await addDependencyCountsToCards([updatedCard], db);

		return updatedCard;
	} catch (error) {
		console.error("Error updating card administrator:", error);
		throw error;
	}
};

// Helper function to fetch user details from the users service
const fetchUserDetails = async (userIds, sessionToken = null) => {
	if (!userIds || userIds.length === 0) return new Map();

	const userDetailsMap = new Map();
	const USER_URL = process.env.USER_URL || "http://localhost:6003";

	try {
		// Fetch user details for each unique user ID
		const userPromises = Array.from(userIds).map(async (userId) => {
			try {
				const headers = {
					"Content-Type": "application/json",
				};

				// Add authentication if session token is provided
				if (sessionToken) {
					headers["Cookie"] = `session_token=${sessionToken}`;
				}

				const response = await axios.get(
					`${USER_URL}/api/users/${userId}`,
					{
						headers,
					}
				);

				if (response.status === 200 && response.data) {
					return { userId, userData: response.data.data };
				} else {
					console.warn(
						`Failed to fetch user ${userId}: ${response.status}`
					);
					return { userId, userData: null };
				}
			} catch (error) {
				console.warn(`Error fetching user ${userId}:`, error.message);
				return { userId, userData: null };
			}
		});

		const userResults = await Promise.all(userPromises);
		userResults.forEach(({ userId, userData }) => {
			if (userData) {
				userDetailsMap.set(userId, userData);
			}
		});

		console.log(
			`Fetched details for ${userDetailsMap.size}/${userIds.size} users`
		);
	} catch (error) {
		console.error("Error fetching user details:", error);
	}

	return userDetailsMap;
};

// Helper function to efficiently add dependency counts and relationships to cards
const addDependencyCountsToCards = async (cards, db) => {
	if (!cards || cards.length === 0) return;

	const cardIds = cards.map((card) => card.id);
	const allUserIds = new Set();

	// Collect user IDs from cards
	cards.forEach((card) => {
		// Collect administrator ID
		if (card.administrator_id) {
			allUserIds.add(card.administrator_id);
		}

	});

	try {
		// Get dependency counts and user details with parallel queries
		const [dependencyCounts, dependentCounts, userDetailsMap] =
			await Promise.all([
				// Count dependencies (cards these cards depend on)
				db
					.schema("kanban")
					.from("TaskDependencies")
					.select("sourceCardId")
					.in("sourceCardId", cardIds),

				// Count dependent cards (cards that depend on these cards)
				db
					.schema("kanban")
					.from("TaskDependencies")
					.select("targetCardId")
					.in("targetCardId", cardIds),

				// Fetch user details for administrators
				fetchUserDetails(allUserIds),
			]);

		// Create lookup maps for counts
		const dependencyCountMap = new Map();
		const dependentCountMap = new Map();

		if (dependencyCounts.data) {
			dependencyCounts.data.forEach((row) => {
				const count = dependencyCountMap.get(row.sourceCardId) || 0;
				dependencyCountMap.set(row.sourceCardId, count + 1);
			});
		}

		if (dependentCounts.data) {
			dependentCounts.data.forEach((row) => {
				const count = dependentCountMap.get(row.targetCardId) || 0;
				dependentCountMap.set(row.targetCardId, count + 1);
			});
		}

		// Add counts and user details to cards
		for (const card of cards) {
			card.dependencyCount = dependencyCountMap.get(card.id) || 0;
			card.dependentCardsCount = dependentCountMap.get(card.id) || 0;

			// Add preloaded administrator details
			if (
				card.administrator_id &&
				userDetailsMap.has(card.administrator_id)
			) {
				card.administratorDetails = userDetailsMap.get(
					card.administrator_id
				);
			}

			if (card.checklist && Array.isArray(card.checklist)) {
				card.checklist = normalizeChecklist(card.checklist);

				// Calculate total estimated duration from incomplete checklist items only
				const totalDuration = card.checklist.reduce((total, item) => {
					// Only include duration if the item is not completed
					if (!item.completed) {
						const itemDuration = parseInt(item.duration) || 0;
						return total + itemDuration;
					}
					return total;
				}, 0);

				// Add computed duration to card data
				card.duration = totalDuration;
			} else {
				// If no checklist, duration is 0
				card.duration = 0;
			}
		}
	} catch (error) {
		console.error("Error adding dependency counts:", error);
		// Continue without dependency counts if there's an error
	}
};

// Add attachments to a card
const addAttachments = async (cardId, files, db) => {
	try {
		if (!isValidUUID(cardId)) {
			throw new Error("Invalid card ID format");
		}

		// Get current card
		const card = await getCardById(cardId, db);
		if (!card) {
			throw new Error("Card not found");
		}

		console.log(
			`Uploading ${files.length} attachments for card ${cardId}...`
		);

		// Upload all files to storage
		const uploadPromises = files.map((file) =>
			storageService.uploadFile(file, cardId)
		);
		const uploadedAttachments = await Promise.all(uploadPromises);

		console.log(
			`Successfully uploaded ${uploadedAttachments.length} attachments`
		);

		// Merge with existing attachments
		const allAttachments = [
			...(Array.isArray(card.attachments) ? card.attachments : []),
			...uploadedAttachments,
		];

		// Update card with new attachments
		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update({
				attachments: allAttachments,
				updatedAt: new Date().toISOString(),
			})
			.eq("id", cardId)
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the updated card
		await addDependencyCountsToCards([updatedCard], db);

		return updatedCard;
	} catch (error) {
		console.error("Error adding attachments:", error);
		throw error;
	}
};

// Remove an attachment from a card
const removeAttachment = async (cardId, blobName, db) => {
	try {
		if (!isValidUUID(cardId)) {
			throw new Error("Invalid card ID format");
		}

		// Get current card
		const card = await getCardById(cardId, db);
		if (!card) {
			throw new Error("Card not found");
		}

		console.log(`Removing attachment ${blobName} from card ${cardId}...`);

		// Find and remove the attachment from the list
		const attachmentToRemove = card.attachments?.find(
			(att) => att.blobName === blobName
		);

		if (!attachmentToRemove) {
			throw new Error("Attachment not found");
		}

		// Delete from storage
		await storageService.deleteFile(blobName);

		// Remove from attachments array
		const updatedAttachments = (card.attachments || []).filter(
			(att) => att.blobName !== blobName
		);

		// Update card
		const { data: updatedCard, error } = await db
			.schema("kanban")
			.from("Cards")
			.update({
				attachments: updatedAttachments,
				updatedAt: new Date().toISOString(),
			})
			.eq("id", cardId)
			.select()
			.single();

		if (error) throw error;

		// Add dependency counts to the updated card
		await addDependencyCountsToCards([updatedCard], db);

		console.log(`Successfully removed attachment ${blobName}`);

		return updatedCard;
	} catch (error) {
		console.error("Error removing attachment:", error);
		throw error;
	}
};

export default {
	getCards,
	getCardById,
	createCard,
	updateCard,
	deleteCard,
	moveCard,
	updateChecklist,
	updateCardAdministrator,
	// Attachment management
	addAttachments,
	removeAttachment,
	// Utility functions
	addDependencyCountsToCards,
};
