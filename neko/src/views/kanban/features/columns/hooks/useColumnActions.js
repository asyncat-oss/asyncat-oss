/* eslint-disable no-unused-vars */
import { useColumnContext } from "../../../../context/ColumnContext";
import { useState } from "react";
import viewsApi from "../../../../viewsApi";

export const useColumnActions = () => {
	const { columns, setColumns, loadColumns } = useColumnContext();
	const [pendingOperations, setPendingOperations] = useState({
		deletingColumns: [],
	});

	// Move the API methods from ColumnProvider here
	const addColumn = async (columnData) => {
		const projectId = sessionStorage.getItem("projectId");
		const userId = sessionStorage.getItem("userId");

		// For personal boards, use the user's ID as the project
		const effectiveProjectId = projectId || userId;

		try {
			const newColumn = await viewsApi.column.create({
				...columnData,
				projectId: effectiveProjectId,
				Cards: [],
			});

			// Only add to state if real-time doesn't handle it
			// Check if column already exists (real-time might have added it)
			setColumns((prev) => {
				const existingColumn = prev.find(
					(col) => col.id === newColumn.id
				);
				if (existingColumn) {
					// Column already exists (probably from real-time), don't add duplicate
					return prev;
				}
				// Column doesn't exist, add it
				return [...prev, { ...newColumn, Cards: [] }];
			});

			return newColumn;
		} catch (err) {
			console.error("Error adding column:", err);
			throw err;
		}
	};

	const updateColumn = async (columnId, updates) => {
		const projectId = sessionStorage.getItem("projectId");
		const userId = sessionStorage.getItem("userId");
		const effectiveProjectId = projectId || userId;

		try {
			const updatedColumn = await viewsApi.column.update(columnId, {
				...updates,
				projectId: effectiveProjectId, // Make sure projectId is included
			});

			setColumns((prev) =>
				prev.map((col) => {
					if (col.id === columnId) {
						return {
							...col,
							...updatedColumn,
							Cards: Array.isArray(col.Cards) ? col.Cards : [],
						};
					}
					return col;
				})
			);

			return updatedColumn;
		} catch (err) {
			console.error("Error updating column:", err);
			throw err;
		}
	};

	const deleteColumn = async (columnId) => {
		const projectId = sessionStorage.getItem("projectId");
		const userId = sessionStorage.getItem("userId");
		const effectiveProjectId = projectId || userId;

		try {
			await viewsApi.column.delete(columnId, effectiveProjectId);

			// Only update the state after the API call succeeds
			setColumns((prev) => prev.filter((col) => col.id !== columnId));
		} catch (err) {
			console.error("Error deleting column:", err);
			throw err;
		}
	};

	const updateColumnOrder = async (newOrder) => {
		const projectId = sessionStorage.getItem("projectId");

		try {
			const updatedColumns = await viewsApi.column.updateOrder(
				projectId || null, // Send null explicitly for personal boards
				newOrder
			);

			setColumns(
				updatedColumns.map((column) => ({
					...column,
					Cards: Array.isArray(column.Cards) ? column.Cards : [],
				}))
			);
		} catch (err) {
			console.error("Error updating column order:", err);
			throw err;
		}
	};

	// New function to update column completion status
	const updateColumnCompletionStatus = async (
		columnId,
		isCompletionColumn
	) => {
		try {
			const updatedColumn = await viewsApi.column.updateCompletionStatus(
				columnId,
				isCompletionColumn
			);

			// Update the columns in the UI
			setColumns((prev) =>
				prev.map((col) => {
					if (col.id === columnId) {
						return {
							...col,
							isCompletionColumn:
								updatedColumn.isCompletionColumn,
						};
					}
					return col;
				})
			);

			return updatedColumn;
		} catch (err) {
			console.error("Error updating column completion status:", err);
			throw err;
		}
	};

	// Keep the existing wrapper methods, but have them call the local methods
	const handleColumnAdd = async (columnData) => {
		try {
			return await addColumn(columnData);
		} catch (error) {
			console.error("Error adding column:", error);
			throw error;
		}
	};

	const handleColumnUpdate = async (columnId, updates) => {
		try {
			return await updateColumn(columnId, updates);
		} catch (error) {
			console.error("Error updating column:", error);
			throw error;
		}
	};

	const handleColumnDelete = async (columnId) => {
		try {
			// Set column as deleting
			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: [...prev.deletingColumns, columnId],
			}));

			// Wait for the actual deletion
			await deleteColumn(columnId);

			// Remove from tracking state after deletion
			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: prev.deletingColumns.filter(
					(id) => id !== columnId
				),
			}));
		} catch (error) {
			console.error("Error deleting column:", error);

			// Clean up the pending state if there's an error
			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: prev.deletingColumns.filter(
					(id) => id !== columnId
				),
			}));

			// Re-throw with a clear message
			if (
				error.message &&
				error.message.includes("Cannot delete column with cards")
			) {
				throw new Error(
					"Cannot delete column with cards. Please move or delete all cards first."
				);
			}
			throw error;
		}
	};

	const handleColumnStyle = (columnId, styles) => {
		return handleColumnUpdate(columnId, { styles });
	};

	const handleReorderColumns = async (newOrder) => {
		try {
			return await updateColumnOrder(newOrder);
		} catch (error) {
			console.error("Error reordering columns:", error);
			throw error;
		}
	};

	const handleUpdateCompletionStatus = async (
		columnId,
		isCompletionColumn
	) => {
		try {
			return await updateColumnCompletionStatus(
				columnId,
				isCompletionColumn
			);
		} catch (error) {
			console.error("Error updating column completion status:", error);
			throw error;
		}
	};

	return {
		handleColumnAdd,
		handleColumnUpdate,
		handleColumnDelete,
		handleColumnStyle,
		handleReorderColumns,
		handleUpdateCompletionStatus,
		pendingOperations,
	};
};

export default useColumnActions;
