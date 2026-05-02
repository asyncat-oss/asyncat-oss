// columnController.js - Updated to use Supabase
import columnService from "../services/columnService.js";

// Error handler wrapper
const asyncHandler = (fn) => async (req, res, next) => {
	try {
		await fn(req, res, next);
	} catch (error) {
		console.error(`Error: ${error.message}`);
		const statusCode =
			error.message === "Column not found"
				? 404
				: error.message.includes("permission") ||
					  error.message.includes("authorized")
					? 403
					: error.message.includes("Cannot delete column with cards")
						? 400
						: 500;
		res.status(statusCode).json({ error: error.message });
	}
};

const getColumns = asyncHandler(async (req, res) => {
	const { projectId } = req.query;
	const columns = await columnService.getColumns(projectId, req.db);
	res.json(columns);
});

const createColumn = asyncHandler(async (req, res) => {
	// Add user ID from authentication as createdBy
	const columnData = {
		...req.body,
		createdBy: req.user.id,
	};

	console.log("🔨 Creating column with data:", {
		title: columnData.title,
		projectId: columnData.projectId,
		createdBy: columnData.createdBy,
	});

	try {
		const column = await columnService.createColumn(
			columnData,
			req.db
		);
		console.log("✅ Column created successfully:", column.id);
		res.status(201).json(column);
	} catch (error) {
		console.error("❌ Column creation failed:", error);
		throw error; // Let asyncHandler catch it
	}
});

const updateColumn = asyncHandler(async (req, res) => {
	const { id } = req.params;
	// Fix: Correctly extract projectId from body or query params
	const projectId = req.body.projectId || req.query.projectId;

	console.log("Updating column with:", { id, projectId, body: req.body });

	const existingColumn = await columnService.getColumnById(id, req.db);
	if (!existingColumn) {
		return res.status(404).json({ error: "Column not found" });
	}

	// Check if user is the column creator
	const isColumnCreator = existingColumn.createdBy === req.user.id;

	// Single-user mode: check project ownership via owner_id
	let isProjectOwner = false;
	if (existingColumn.projectId) {
		const { data: proj } = await req.db
			.from("projects")
			.select("owner_id")
			.eq("id", existingColumn.projectId)
			.single();
		isProjectOwner = proj?.owner_id === req.user.id;
	}

	if (!isColumnCreator && !isProjectOwner) {
		return res.status(403).json({
			error: "Not authorized to update this column.",
		});
	}

	const column = await columnService.updateColumn(
		id,
		projectId,
		req.body,
		req.db
	);

	res.json(column);
});

const deleteColumn = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const existingColumn = await columnService.getColumnById(id, req.db);

	if (!existingColumn) {
		return res.status(404).json({ error: "Column not found" });
	}

	// Check if user is the column creator
	const isColumnCreator = existingColumn.createdBy === req.user.id;

	// Single-user mode: check project ownership via owner_id
	let isProjectOwner = false;
	if (existingColumn.projectId) {
		const { data: proj } = await req.db
			.from("projects")
			.select("owner_id")
			.eq("id", existingColumn.projectId)
			.single();
		isProjectOwner = proj?.owner_id === req.user.id;
	}

	if (!isColumnCreator && !isProjectOwner) {
		return res.status(403).json({
			error: "Not authorized to delete this column.",
		});
	}

	// Pass both id AND projectId to the service
	await columnService.deleteColumn(
		id,
		existingColumn.projectId,
		req.db
	);

	res.json({ message: "Column deleted successfully" });
});

const updateColumnOrder = asyncHandler(async (req, res) => {
	try {
		// Extract the correct properties from request body
		const { projectId, order } = req.body;

		// Validate that order is an array
		if (!Array.isArray(order)) {
			return res.status(400).json({ error: "Order must be an array" });
		}

		// Call the service with the correct parameters (projectId, orderData)
		const result = await columnService.updateColumnOrder(
			projectId,
			order,
			req.db
		);

		res.json(result);
	} catch (error) {
		console.error("Error in updateColumnOrder:", error);
		res.status(500).json({ error: error.message });
	}
});

// New controller method to update column completion status
const updateColumnCompletionStatus = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const { isCompletionColumn } = req.body;

	if (typeof isCompletionColumn !== "boolean") {
		return res
			.status(400)
			.json({ error: "isCompletionColumn must be a boolean value" });
	}

	const existingColumn = await columnService.getColumnById(id, req.db);
	if (!existingColumn) {
		return res.status(404).json({ error: "Column not found" });
	}

	// Check if user is the column creator
	const isColumnCreator = existingColumn.createdBy === req.user.id;

	// Single-user mode: check project ownership via owner_id
	let isProjectOwner = false;
	if (existingColumn.projectId) {
		const { data: proj } = await req.db
			.from("projects")
			.select("owner_id")
			.eq("id", existingColumn.projectId)
			.single();
		isProjectOwner = proj?.owner_id === req.user.id;
	}

	if (!isColumnCreator && !isProjectOwner) {
		return res.status(403).json({
			error: "Not authorized to update this column.",
		});
	}

	const column = await columnService.updateColumn(
		id,
		existingColumn.projectId,
		{ isCompletionColumn },
		req.db
	);

	res.json(column);
});
export default {
	getColumns,
	createColumn,
	updateColumn,
	deleteColumn,
	updateColumnOrder,
	updateColumnCompletionStatus,
};
