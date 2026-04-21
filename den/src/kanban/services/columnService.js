// columnService.js - Updated to use Supabase
import { randomUUID } from "crypto";

// UUID validation helper
const isValidUUID = (uuid) => {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		uuid
	);
};

// Helper function to add dependency counts to cards - simplified version
const addDependencyCountsToCards = async (cards, db) => {
	if (!cards || cards.length === 0) return;

	const cardIds = cards.map((card) => card.id);

	try {
		// Get dependency counts
		const [dependencyCounts, dependentCounts] = await Promise.all([
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

		// Add counts to cards
		for (const card of cards) {
			card.dependencyCount = dependencyCountMap.get(card.id) || 0;
			card.dependentCardsCount = dependentCountMap.get(card.id) || 0;

			// Calculate duration from checklist if present
			if (card.checklist && Array.isArray(card.checklist)) {
				const totalDuration = card.checklist.reduce((total, item) => {
					if (!item.completed) {
						const itemDuration = parseInt(item.duration) || 0;
						return total + itemDuration;
					}
					return total;
				}, 0);
				card.duration = totalDuration;
			} else {
				card.duration = 0;
			}
		}
	} catch (error) {
		console.error("Error adding dependency counts:", error);
		// Continue without dependency counts if there's an error
	}
};

const getColumns = async (projectId, db) => {
	try {
		console.log(`Getting columns with projectId: ${projectId}`);

		let query = db.schema("kanban").from("Columns").select("*");

		if (projectId && projectId !== "undefined" && projectId !== "null") {
			if (!isValidUUID(projectId)) {
				throw new Error("Invalid project ID format");
			}
			query = query.eq("projectId", projectId);
		}

		const { data: columns, error } = await query.order('"order"', {
			ascending: true,
		});

		if (error) throw error;

		console.log(
			`Found ${columns?.length || 0} columns with projectId: ${projectId}`
		);

		// Fetch cards separately for each column
		if (columns && columns.length > 0) {
			for (const column of columns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				if (cardsError) {
					console.error(
						`Error fetching cards for column ${column.id}:`,
						cardsError
					);
					column.Cards = [];
				} else {
					column.Cards = cards || [];
				}
			}

			// Add dependency counts to all cards
			await addDependencyCountsToCards(
				columns.flatMap((col) => col.Cards),
				db
			);
		}

		return columns || [];
	} catch (error) {
		console.error("Error getting columns:", error);
		throw error;
	}
};

const getAllColumnsWithCards = async (db) => {
	try {
		const { data: columns, error } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.order('"order"', { ascending: true });

		if (error) throw error;

		// Fetch cards separately for each column
		if (columns && columns.length > 0) {
			for (const column of columns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				if (cardsError) {
					console.error(
						`Error fetching cards for column ${column.id}:`,
						cardsError
					);
					column.Cards = [];
				} else {
					column.Cards = cards || [];
				}
			}

			await addDependencyCountsToCards(
				columns.flatMap((col) => col.Cards),
				db
			);
		}

		return columns || [];
	} catch (error) {
		console.error("Error getting all columns:", error);
		throw error;
	}
};

const getColumnById = async (id, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid column ID format");
		}

		const { data: column, error } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", id)
			.single();

		if (error) {
			if (error.code === "PGRST116") {
				throw new Error("Column not found");
			}
			throw error;
		}

		return column;
	} catch (error) {
		console.error("Error getting column by ID:", error);
		throw error;
	}
};

const createColumn = async (columnData, db) => {
	try {
		const {
			projectId,
			createdBy,
			title,
			isCompletionColumn = false,
		} = columnData;

		console.log("🔨 columnService.createColumn called with:", {
			title,
			projectId,
			createdBy,
			isCompletionColumn,
		});

		if (projectId && !isValidUUID(projectId)) {
			throw new Error("Invalid project ID format");
		}

		if (!isValidUUID(createdBy)) {
			throw new Error("Invalid user ID format");
		}

		// Simple order calculation - get all columns for project and add 1
		console.log("📊 Calculating column order...");
		const { data: existingColumns, error: countError } = await db
			.schema("kanban")
			.from("Columns")
			.select('order')
			.eq("projectId", projectId || null);

		if (countError) {
			console.error("❌ Error fetching existing columns:", countError);
			throw countError;
		}

		let maxOrder = 0;
		if (existingColumns && existingColumns.length > 0) {
			maxOrder = Math.max(
				...existingColumns.map((col) => col.order || 0)
			);
		}

		const columnToCreate = {
			id: randomUUID(),
			title,
			projectId: projectId || null,
			createdBy,
			order: maxOrder + 1,
			isCompletionColumn,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		console.log("💾 Inserting column:", columnToCreate);

		const { data: column, error } = await db
			.schema("kanban")
			.from("Columns")
			.insert(columnToCreate)
			.select("*")
			.single();

		if (error) {
			console.error("❌ Column insertion error:", error);
			throw error;
		}

		console.log("✅ Column created:", column.id);

		// Add empty Cards array to match expected format
		column.Cards = [];

		return column;
	} catch (error) {
		console.error("❌ Error in createColumn:", error);
		throw error;
	}
};

const updateColumn = async (id, projectId, columnData, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid column ID format");
		}

		if (projectId && !isValidUUID(projectId)) {
			throw new Error("Invalid project ID format");
		}

		// First check if column exists
		let query = db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", id);

		if (projectId) {
			query = query.eq("projectId", projectId);
		}

		const { data: existingColumn, error: fetchError } =
			await query.single();

		if (fetchError) {
			if (fetchError.code === "PGRST116") {
				throw new Error("Column not found");
			}
			throw fetchError;
		}

		const updateData = {
			...columnData,
			updatedAt: new Date().toISOString(),
		};

		const { data: updatedColumn, error } = await db
			.schema("kanban")
			.from("Columns")
			.update(updateData)
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;

		// Add empty Cards array if not present
		if (!updatedColumn.Cards) {
			updatedColumn.Cards = [];
		}

		return updatedColumn;
	} catch (error) {
		console.error("Error updating column:", error);
		throw error;
	}
};

const deleteColumn = async (id, projectId, db) => {
	try {
		if (!isValidUUID(id)) {
			throw new Error("Invalid column ID format");
		}

		if (projectId && !isValidUUID(projectId)) {
			throw new Error("Invalid project ID format");
		}

		let query = db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", id);

		if (projectId) {
			query = query.eq("projectId", projectId);
		}

		const { data: existingColumn, error: fetchError } =
			await query.single();

		if (fetchError) {
			if (fetchError.code === "PGRST116") {
				throw new Error("Column not found");
			}
			throw fetchError;
		}

		// Check if column has any cards
		const { data: cards, error: cardsCheckError } = await db
			.schema("kanban")
			.from("Cards")
			.select("id")
			.eq("columnId", id)
			.limit(1);

		if (cardsCheckError) throw cardsCheckError;

		// Prevent deletion if column has cards
		if (cards && cards.length > 0) {
			throw new Error(
				"Cannot delete column with cards. Please move or delete all cards first."
			);
		}

		// Delete the column (only if it has no cards)
		const { error: columnDeleteError } = await db
			.schema("kanban")
			.from("Columns")
			.delete()
			.eq("id", id);

		if (columnDeleteError) throw columnDeleteError;

		return { message: "Column deleted" };
	} catch (error) {
		console.error("Error deleting column:", error);
		throw error;
	}
};

const updateColumnOrder = async (projectId, orderData, db) => {
	try {
		console.log("Update column order called with:", {
			projectId,
			orderDataLength: orderData.length,
			orderData: orderData.map((item) => ({
				id: item.id,
				order: item.order,
			})),
		});

		if (projectId && !isValidUUID(projectId)) {
			throw new Error("Invalid project ID format");
		}

		// Important: First fetch ALL columns that exist for this project
		let query = db
			.schema("kanban")
			.from("Columns")
			.select("id, order, title");

		if (projectId) {
			query = query.eq("projectId", projectId);
		}

		const { data: projectColumns, error: fetchError } = await query;

		if (fetchError) throw fetchError;

		console.log(
			`Found ${projectColumns?.length || 0} columns for project ${projectId || "unknown"}`
		);

		if (!projectColumns || projectColumns.length === 0) {
			return [];
		}

		// Create a map for fast lookups
		const columnMap = new Map();
		projectColumns.forEach((col) => {
			columnMap.set(col.id, col);
		});

		// Validate orderData: only include columns that exist in the database
		const validOrderItems = orderData.filter((item) =>
			columnMap.has(item.id)
		);

		if (validOrderItems.length !== orderData.length) {
			console.warn(
				`Some columns in order data don't exist. Received: ${orderData.length}, valid: ${validOrderItems.length}`
			);
		}

		if (validOrderItems.length === 0) {
			console.warn("No valid columns to reorder");
			return projectColumns;
		}

		// CRITICAL: Sort the valid orderData items by their order value
		validOrderItems.sort((a, b) => a.order - b.order);

		// Now update each column with its new order - use batch update
		const updates = validOrderItems.map((item, index) => ({
			id: item.id,
			order: index,
			updatedAt: new Date().toISOString(),
		}));

		// Update all columns in batch
		for (const update of updates) {
			const { error: updateError } = await db
				.schema("kanban")
				.from("Columns")
				.update({ order: update.order, updatedAt: update.updatedAt })
				.eq("id", update.id);

			if (updateError) {
				console.warn(`Column ${update.id} not updated:`, updateError);
			} else {
				console.log(
					`Updated column ${update.id} to order ${update.order}`
				);
			}
		}

		console.log("Column order updates completed successfully");

		// Return the updated columns in the correct order
		const { data: updatedColumns, error: finalFetchError } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("projectId", projectId || null)
			.order('"order"', { ascending: true });

		if (finalFetchError) throw finalFetchError;

		// Fetch cards for each column separately
		if (updatedColumns && updatedColumns.length > 0) {
			for (const column of updatedColumns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				if (cardsError) {
					console.error(
						`Error fetching cards for column ${column.id}:`,
						cardsError
					);
					column.Cards = [];
				} else {
					column.Cards = cards || [];
				}
			}
		}

		console.log(
			`Returning ${updatedColumns?.length || 0} columns in updated order`
		);
		return updatedColumns || [];
	} catch (error) {
		console.error("Error updating column order:", error);
		throw error;
	}
};

const getUserColumns = async (userId, db) => {
	try {
		if (!isValidUUID(userId)) {
			throw new Error("Invalid user ID format");
		}

		const { data: columns, error } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("createdBy", userId)
			.order('"order"', { ascending: true });

		if (error) throw error;

		// Fetch cards for each column separately, filtering by user
		if (columns && columns.length > 0) {
			for (const column of columns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.eq("createdBy", userId)
					.order('"order"', { ascending: true });

				if (cardsError) {
					console.error(
						`Error fetching cards for column ${column.id}:`,
						cardsError
					);
					column.Cards = [];
				} else {
					column.Cards = cards || [];
				}
			}
		}

		return columns || [];
	} catch (error) {
		console.error("Error getting user columns:", error);
		throw error;
	}
};

const diagnosticColumnCheck = async (db) => {
	try {
		// Attempt to find columns with different projectId possibilities
		const { data: allColumns, error } = await db
			.schema("kanban")
			.from("Columns")
			.select("id, title, projectId, order, createdBy");

		if (error) throw error;

		console.log("DIAGNOSTIC: All columns in database:", allColumns);

		const nullColumns =
			allColumns?.filter((col) => col.projectId === null) || [];
		console.log("DIAGNOSTIC: Columns with NULL projectId:", nullColumns);

		const emptyStringColumns =
			allColumns?.filter((col) => col.projectId === "") || [];
		console.log(
			"DIAGNOSTIC: Columns with empty string projectId:",
			emptyStringColumns
		);

		return allColumns || [];
	} catch (error) {
		console.error("DIAGNOSTIC ERROR:", error);
		return [];
	}
};

export default {
	getColumns,
	getAllColumnsWithCards,
	getColumnById,
	createColumn,
	updateColumn,
	deleteColumn,
	updateColumnOrder,
	getUserColumns,
	diagnosticColumnCheck,
};
