import { useColumnContext } from "../../../../context/ColumnContext";
import { useState } from "react";
import viewsApi from "../../../../viewsApi";

export const useColumnActions = () => {
	const { setColumns } = useColumnContext();
	const [pendingOperations, setPendingOperations] = useState({
		deletingColumns: [],
	});

	const addColumn = async (columnData) => {
		const projectId = sessionStorage.getItem("projectId");
		const userId = sessionStorage.getItem("userId");

		const effectiveProjectId = projectId || userId;

		try {
			const newColumn = await viewsApi.column.create({
				...columnData,
				projectId: effectiveProjectId,
				Cards: [],
			});

			setColumns((prev) => {
				const existingColumn = prev.find(
					(col) => col.id === newColumn.id
				);
				if (existingColumn) {
					return prev;
				}
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
				projectId: effectiveProjectId,
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
				projectId || null,
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

	const updateColumnCompletionStatus = async (
		columnId,
		isCompletionColumn
	) => {
		try {
			const updatedColumn = await viewsApi.column.updateCompletionStatus(
				columnId,
				isCompletionColumn
			);

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
			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: [...prev.deletingColumns, columnId],
			}));

			await deleteColumn(columnId);

			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: prev.deletingColumns.filter(
					(id) => id !== columnId
				),
			}));
		} catch (error) {
			console.error("Error deleting column:", error);

			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: prev.deletingColumns.filter(
					(id) => id !== columnId
				),
			}));

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