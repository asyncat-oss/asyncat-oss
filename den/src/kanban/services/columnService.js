import { randomUUID } from "crypto";

const isValidUUID = (uuid) =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const getColumns = async (projectId, db) => {
	try {
		let query = db.schema("kanban").from("Columns").select("*");

		if (projectId && projectId !== "undefined" && projectId !== "null") {
			if (!isValidUUID(projectId)) throw new Error("Invalid project ID format");
			query = query.eq("projectId", projectId);
		}

		const { data: columns, error } = await query.order('"order"', { ascending: true });
		if (error) throw error;

		if (columns && columns.length > 0) {
			for (const column of columns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				column.Cards = cardsError ? [] : (cards || []);
			}
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

		if (columns && columns.length > 0) {
			for (const column of columns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				column.Cards = cardsError ? [] : (cards || []);
			}
		}

		return columns || [];
	} catch (error) {
		console.error("Error getting all columns:", error);
		throw error;
	}
};

const getColumnById = async (id, db) => {
	try {
		if (!isValidUUID(id)) throw new Error("Invalid column ID format");

		const { data: column, error } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("id", id)
			.single();

		if (error) {
			if (error.code === "PGRST116") throw new Error("Column not found");
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
		const { projectId, createdBy, title } = columnData;

		if (projectId && !isValidUUID(projectId)) throw new Error("Invalid project ID format");
		if (!isValidUUID(createdBy)) throw new Error("Invalid user ID format");

		const { data: existingColumns, error: countError } = await db
			.schema("kanban")
			.from("Columns")
			.select("order")
			.eq("projectId", projectId || null);

		if (countError) throw countError;

		const maxOrder = existingColumns?.length > 0
			? Math.max(...existingColumns.map((col) => col.order || 0))
			: 0;

		const columnToCreate = {
			id: randomUUID(),
			title,
			projectId: projectId || null,
			createdBy,
			order: maxOrder + 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const { data: column, error } = await db
			.schema("kanban")
			.from("Columns")
			.insert(columnToCreate)
			.select("*")
			.single();

		if (error) throw error;

		column.Cards = [];
		return column;
	} catch (error) {
		console.error("Error in createColumn:", error);
		throw error;
	}
};

const updateColumn = async (id, projectId, columnData, db) => {
	try {
		if (!isValidUUID(id)) throw new Error("Invalid column ID format");
		if (projectId && !isValidUUID(projectId)) throw new Error("Invalid project ID format");

		let query = db.schema("kanban").from("Columns").select("*").eq("id", id);
		if (projectId) query = query.eq("projectId", projectId);

		const { data: existingColumn, error: fetchError } = await query.single();
		if (fetchError) {
			if (fetchError.code === "PGRST116") throw new Error("Column not found");
			throw fetchError;
		}

		const safeColumnData = { ...columnData };
		delete safeColumnData["isCompletionColumn"];

		const { data: updatedColumn, error } = await db
			.schema("kanban")
			.from("Columns")
			.update({ ...safeColumnData, updatedAt: new Date().toISOString() })
			.eq("id", id)
			.select()
			.single();

		if (error) throw error;
		if (!updatedColumn.Cards) updatedColumn.Cards = [];

		return updatedColumn;
	} catch (error) {
		console.error("Error updating column:", error);
		throw error;
	}
};

const deleteColumn = async (id, projectId, db) => {
	try {
		if (!isValidUUID(id)) throw new Error("Invalid column ID format");
		if (projectId && !isValidUUID(projectId)) throw new Error("Invalid project ID format");

		let query = db.schema("kanban").from("Columns").select("*").eq("id", id);
		if (projectId) query = query.eq("projectId", projectId);

		const { error: fetchError } = await query.single();
		if (fetchError) {
			if (fetchError.code === "PGRST116") throw new Error("Column not found");
			throw fetchError;
		}

		const { data: cards, error: cardsCheckError } = await db
			.schema("kanban")
			.from("Cards")
			.select("id")
			.eq("columnId", id)
			.limit(1);

		if (cardsCheckError) throw cardsCheckError;
		if (cards && cards.length > 0) {
			throw new Error("Cannot delete column with cards. Move or delete all cards first.");
		}

		const { error: deleteError } = await db
			.schema("kanban")
			.from("Columns")
			.delete()
			.eq("id", id);

		if (deleteError) throw deleteError;
		return { message: "Column deleted" };
	} catch (error) {
		console.error("Error deleting column:", error);
		throw error;
	}
};

const updateColumnOrder = async (projectId, orderData, db) => {
	try {
		if (projectId && !isValidUUID(projectId)) throw new Error("Invalid project ID format");

		let query = db.schema("kanban").from("Columns").select("id, order, title");
		if (projectId) query = query.eq("projectId", projectId);

		const { data: projectColumns, error: fetchError } = await query;
		if (fetchError) throw fetchError;
		if (!projectColumns || projectColumns.length === 0) return [];

		const columnMap = new Map(projectColumns.map((col) => [col.id, col]));
		const validOrderItems = orderData
			.filter((item) => columnMap.has(item.id))
			.sort((a, b) => a.order - b.order);

		for (const [index, item] of validOrderItems.entries()) {
			await db
				.schema("kanban")
				.from("Columns")
				.update({ order: index, updatedAt: new Date().toISOString() })
				.eq("id", item.id);
		}

		const { data: updatedColumns, error: finalFetchError } = await db
			.schema("kanban")
			.from("Columns")
			.select("*")
			.eq("projectId", projectId || null)
			.order('"order"', { ascending: true });

		if (finalFetchError) throw finalFetchError;

		if (updatedColumns && updatedColumns.length > 0) {
			for (const column of updatedColumns) {
				const { data: cards, error: cardsError } = await db
					.schema("kanban")
					.from("Cards")
					.select("*")
					.eq("columnId", column.id)
					.order('"order"', { ascending: true });

				column.Cards = cardsError ? [] : (cards || []);
			}
		}

		return updatedColumns || [];
	} catch (error) {
		console.error("Error updating column order:", error);
		throw error;
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
};
