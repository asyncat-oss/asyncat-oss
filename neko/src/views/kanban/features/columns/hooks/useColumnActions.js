import { useColumnContext } from "../../../../context/viewContexts";
import { useState } from "react";
import viewsApi from "../../../../viewsApi";

const getEffectiveProjectId = (selectedProject) =>
	selectedProject?.id ||
	sessionStorage.getItem("projectId") ||
	sessionStorage.getItem("userId");

export const useColumnActions = () => {
	const { setColumns, selectedProject } = useColumnContext();
	const [pendingOperations, setPendingOperations] = useState({
		deletingColumns: [],
	});

	const handleColumnAdd = async (columnData) => {
		try {
			const newColumn = await viewsApi.column.create({
				...columnData,
				projectId: getEffectiveProjectId(selectedProject),
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

	const handleColumnUpdate = async (columnId, updates) => {
		try {
			const updatedColumn = await viewsApi.column.update(columnId, {
				...updates,
				projectId: getEffectiveProjectId(selectedProject),
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

	const handleReorderColumns = async (newOrder) => {
		try {
			const updatedColumns = await viewsApi.column.updateOrder(
				getEffectiveProjectId(selectedProject),
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

	const handleUpdateCompletionStatus = async (
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

	const handleColumnDelete = async (columnId) => {
		try {
			setPendingOperations((prev) => ({
				...prev,
				deletingColumns: [...prev.deletingColumns, columnId],
			}));

			await viewsApi.column.delete(
				columnId,
				getEffectiveProjectId(selectedProject)
			);
			setColumns((prev) => prev.filter((col) => col.id !== columnId));

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
