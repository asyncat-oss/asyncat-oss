import { useCardContext } from "../context/viewContexts";
import { useColumnContext } from "../context/viewContexts";
import viewsApi from "../viewsApi";

export const useCardActions = () => {
	const { setSelectedCard } = useCardContext();
	const { columns, setColumns } = useColumnContext();

	const normalizeChecklist = (checklist = []) =>
		checklist.map((item) => {
			const normalized = { ...item };
			delete normalized.assignees;
			delete normalized.assigneeDetails;
			delete normalized.assignee_id;
			return normalized;
		});

	// Add function to communicate with The Cat (using MAIN_API_URL)
	const sendCatMessage = async (message) => {
		try {
			const clientDateTime = {
				timestamp: new Date().toISOString(),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			};

			const data = await viewsApi.ai.sendCatMessage(
				message,
				clientDateTime
			);

			if (!data.success) {
				throw new Error(data.message || "Failed to process request");
			}

			// Parse returned card data and prepare it for the UI
			return {
				message: data.message,
				title: data.card.title,
				description: data.card.description,
				priority: data.card.priority,
				startDate: data.card.startDate,
				dueDate: data.card.dueDate,
				duration: data.card.duration,
				checklist: data.card.checklist || [],
			};
		} catch (error) {
			console.error("Error communicating with The Cat:", error);
			throw error;
		}
	};

	const addCard = async (columnId, cardData) => {
		try {
			// Process administrator if present - ensure we store just ID (single administrator)
			const processedCardData = { ...cardData };
			if (processedCardData.administrator_id) {
				processedCardData.administrator_id =
					typeof processedCardData.administrator_id === "object" &&
					processedCardData.administrator_id !== null
						? processedCardData.administrator_id.id
						: processedCardData.administrator_id;
			}

			// Legacy support: if assignees is provided, convert to administrator_id
			if (
				processedCardData.assignees &&
				!processedCardData.administrator_id
			) {
				const firstAssignee = processedCardData.assignees[0];
				if (firstAssignee) {
					processedCardData.administrator_id =
						typeof firstAssignee === "object" &&
						firstAssignee !== null
							? firstAssignee.id
							: firstAssignee;
				}
				delete processedCardData.assignees;
			}

			if (processedCardData.checklist) {
				processedCardData.checklist = normalizeChecklist(
					processedCardData.checklist
				);
			}

			// Check if files need to be uploaded
			if (processedCardData.files && processedCardData.files.length > 0) {
				// Use multipart/form-data for files
				const formData = new FormData();

				// Add card data as JSON
				const cardDataForAPI = {
					...processedCardData,
					columnId,
					tasks: {
						completed:
							processedCardData.checklist?.filter(
								(task) => task.completed
							).length || 0,
						total: processedCardData.checklist?.length || 0,
					},
					// Add default styles if not provided
					styles: processedCardData.styles || {
						fontFamily: "sans-serif",
						fontSize: "14px",
						fontWeight: "normal",
						fontStyle: "normal",
						textDecoration: "none",
						color: "#000000",
					},
				};

				delete cardDataForAPI.files; // Remove files from JSON data
				formData.append("cardData", JSON.stringify(cardDataForAPI));

				// Add files
				processedCardData.files.forEach((file) => {
					formData.append("file", file);
				});

				const newCard = await viewsApi.card.createWithFiles(formData);

				// Only add to state if real-time doesn't handle it
				// Check if card already exists (real-time might have added it)
				setColumns((prevColumns) => {
					const newColumns = prevColumns.map((column) => {
						if (column.id === columnId) {
							const existingCard = Array.isArray(column.Cards)
								? column.Cards.find(
										(card) => card.id === newCard.id
								  )
								: false;

							if (existingCard) {
								// Card already exists (probably from real-time), don't add duplicate
								return column;
							}

							return {
								...column,
								Cards: Array.isArray(column.Cards)
									? [...column.Cards, newCard]
									: [newCard],
							};
						}
						return column;
					});
					return newColumns;
				});

				return newCard;
			} else {
				// Original JSON implementation for cards without files
				const newCard = await viewsApi.card.create({
					...processedCardData,
					columnId,
					tasks: {
						completed:
							processedCardData.checklist?.filter(
								(task) => task.completed
							).length || 0,
						total: processedCardData.checklist?.length || 0,
					},
					// Add default styles if not provided
					styles: processedCardData.styles || {
						fontFamily: "sans-serif",
						fontSize: "14px",
						fontWeight: "normal",
						fontStyle: "normal",
						textDecoration: "none",
						color: "#000000",
					},
				});

				// Only add to state if real-time doesn't handle it
				// Check if card already exists (real-time might have added it)
				setColumns((prevColumns) => {
					const newColumns = prevColumns.map((column) => {
						if (column.id === columnId) {
							const existingCard = Array.isArray(column.Cards)
								? column.Cards.find(
										(card) => card.id === newCard.id
								  )
								: false;

							if (existingCard) {
								// Card already exists (probably from real-time), don't add duplicate
								return column;
							}

							return {
								...column,
								Cards: Array.isArray(column.Cards)
									? [...column.Cards, newCard]
									: [newCard],
							};
						}
						return column;
					});
					return newColumns;
				});

				return newCard;
			}
		} catch (error) {
			console.error("Error adding card:", error);
			throw error;
		}
	};

	const handleCardUpdate = async (columnId, cardId, updates) => {
		try {
			// Find the current card to preserve its data and detect status changes
			const currentColumn = columns.find((col) => col.id === columnId);
			const currentCard = currentColumn?.Cards?.find(
				(card) => card.id === cardId
			);

			// Detect if this is a status-affecting change
			let oldTasksCompleted = 0;
			let newTasksCompleted = 0;

			if (currentCard && updates.checklist) {
				// Detect if task completion status has changed
				oldTasksCompleted =
					currentCard.checklist?.filter((task) => task.completed)
						.length || 0;
				newTasksCompleted =
					updates.checklist.filter((task) => task.completed).length ||
					0;

				if (oldTasksCompleted !== newTasksCompleted) {
					console.log(
						`🔄 Task completion change detected for card ${cardId}:`,
						{
							oldCompleted: oldTasksCompleted,
							newCompleted: newTasksCompleted,
							totalTasks: updates.checklist.length,
						}
					);
				}
			}

			// Also check if tasks object has changed (alternative progress tracking)
			if (currentCard && updates.tasks) {
				const oldCompleted = currentCard.tasks?.completed || 0;
				const newCompleted = updates.tasks.completed || 0;
				if (oldCompleted !== newCompleted) {
					console.log(
						`🔄 Tasks progress change detected for card ${cardId}:`,
						{
							oldCompleted,
							newCompleted: newCompleted,
						}
					);
				}
			}

			// Create a copy to avoid modifying the original
			const updatedData = { ...updates };

			// Process administrator_id if present - ensure we store just ID (single administrator)
			if (updatedData.administrator_id !== undefined) {
				updatedData.administrator_id =
					typeof updatedData.administrator_id === "object" &&
					updatedData.administrator_id !== null
						? updatedData.administrator_id.id
						: updatedData.administrator_id;
			}

			// Legacy support: if assignees is provided, convert to administrator_id
			if (updatedData.assignees && !updatedData.administrator_id) {
				const firstAssignee = updatedData.assignees[0];
				if (firstAssignee) {
					updatedData.administrator_id =
						typeof firstAssignee === "object" &&
						firstAssignee !== null
							? firstAssignee.id
							: firstAssignee;
				}
				delete updatedData.assignees;
			}

			if (updatedData.checklist) {
				updatedData.checklist = normalizeChecklist(
					updatedData.checklist
				);
			}

			// Validate dates if both are being updated or if one is being updated relative to existing
			if (
				updatedData.startDate !== undefined ||
				updatedData.dueDate !== undefined
			) {
				const startDate =
					updatedData.startDate !== undefined
						? updatedData.startDate
						: currentCard?.startDate;
				const dueDate =
					updatedData.dueDate !== undefined
						? updatedData.dueDate
						: currentCard?.dueDate;

				if (startDate && dueDate) {
					const start = new Date(startDate);
					const due = new Date(dueDate);

					if (start > due) {
						throw new Error("Start date cannot be after due date");
					}
				}
			}

			// Validate duration if provided
			if (
				updatedData.duration !== undefined &&
				updatedData.duration !== null
			) {
				const duration = parseInt(updatedData.duration);
				if (isNaN(duration) || duration < 0) {
					throw new Error(
						"Duration must be a positive number in minutes"
					);
				}
				updatedData.duration = duration;
			}

			// Make the API call - route to creation or update based on cardId
			let updatedCard;
			if (cardId === "new-card") {
				// For new cards, use creation API and include columnId in the data
				console.log("🆕 Creating new card");
				updatedCard = await viewsApi.card.create({
					...updatedData,
					columnId,
				});
				console.log("✅ New card created with ID:", updatedCard.id);
			} else {
				// For existing cards, use update API
				updatedCard = await viewsApi.card.update(cardId, {
					...updatedData,
					columnId,
				});
			}

			// Update the columns state with the new card data
			setColumns((prev) =>
				prev.map((col) => {
					if (col.id === columnId) {
						if (cardId === "new-card") {
							// For new cards, add to the column
							return {
								...col,
								Cards: col.Cards
									? [...col.Cards, updatedCard]
									: [updatedCard],
							};
						} else {
							// For existing cards, update in place
							return {
								...col,
								Cards: col.Cards.map((card) =>
									card.id === cardId
										? {
												...card,
												...updatedCard,
												// Preserve preloaded data if it exists
												administratorDetails:
													card.administratorDetails ||
													updatedCard.administratorDetails,
												checklist: updatedCard.checklist
													? normalizeChecklist(
															updatedCard.checklist
													  )
													: card.checklist,
										  }
										: card
								),
							};
						}
					}
					return col;
				})
			);

			return updatedCard;
		} catch (error) {
			console.error("Error updating card:", error);
			throw error;
		}
	};

	const handleCardDelete = async (columnId, cardId) => {
		try {
			await viewsApi.card.delete(cardId);

			setColumns((prev) =>
				prev.map((col) => {
					if (col.id === columnId) {
						return {
							...col,
							Cards: col.Cards.filter(
								(card) => card.id !== cardId
							),
						};
					}
					return col;
				})
			);

			return true;
		} catch (error) {
			console.error("Error deleting card:", error);
			throw error;
		}
	};

	// Internal move card function
	const moveCardInternal = async (
		cardId,
		sourceColumnId,
		destinationColumnId,
		newOrder = 0
	) => {
		try {
			const result = await viewsApi.card.move(
				cardId,
				sourceColumnId,
				destinationColumnId,
				newOrder
			);

			// Update columns state with the moved card
			if (result.sourceColumn && result.destinationColumn) {
				setColumns((prev) => {
					return prev.map((column) => {
						if (column.id === result.sourceColumn.id) {
							return result.sourceColumn;
						}
						if (column.id === result.destinationColumn.id) {
							return result.destinationColumn;
						}
						return column;
					});
				});
			} else {
				// Fallback: simple state update
				const cardToMove = columns
					.find((col) => col.id === sourceColumnId)
					?.Cards?.find((card) => card.id === cardId);

				if (cardToMove) {
					const updatedCardToMove = {
						...cardToMove,
						columnId: destinationColumnId,
					};

					setColumns((prev) => {
						return prev.map((column) => {
							if (column.id === sourceColumnId) {
								return {
									...column,
									Cards: Array.isArray(column.Cards)
										? column.Cards.filter(
												(card) => card.id !== cardId
										  )
										: [],
								};
							}
							if (column.id === destinationColumnId) {
								return {
									...column,
									Cards: Array.isArray(column.Cards)
										? [...column.Cards, updatedCardToMove]
										: [updatedCardToMove],
								};
							}
							return column;
						});
					});
				}
			}

			return result;
		} catch (error) {
			// Check if this is a business logic validation rather than a technical error
			if (
				error.message &&
				error.message.includes("subtasks must be completed")
			) {
				console.warn(
					"Card move blocked by business rule:",
					error.message
				);
			} else {
				console.error("Error moving card:", error);
			}
			throw error;
		}
	};

	// Public move card function
	const moveCard = async (
		cardId,
		sourceColumnId,
		destinationColumnId,
		newOrder = 0
	) => {
		try {
			// Proceed with normal move using the internal function
			const result = await moveCardInternal(
				cardId,
				sourceColumnId,
				destinationColumnId,
				newOrder
			);

			// Update timestamps based on column type
			const targetColumn = columns.find(
				(col) => col.id === destinationColumnId
			);

			const updateData = {};

			if (targetColumn?.isCompletionColumn) {
				updateData.completedAt = new Date().toISOString();
			} else if (!result.startedAt) {
				updateData.startedAt = new Date().toISOString();
			}

			if (Object.keys(updateData).length > 0) {
				await handleCardUpdate(destinationColumnId, cardId, updateData);
			}

			return { success: true, result };
		} catch (error) {
			// Check if this is a business logic validation rather than a technical error
			if (
				error.message &&
				error.message.includes("subtasks must be completed")
			) {
				console.warn(
					"Card move blocked by business rule:",
					error.message
				);
			} else {
				console.error("Error moving card:", error);
			}
			throw error;
		}
	};

	const updateCardChecklist = async (columnId, cardId, newChecklist) => {
		const processedChecklist = normalizeChecklist(newChecklist);

		const completedTasks = processedChecklist.filter(
			(task) => task.completed
		).length;
		const progress =
			Math.round((completedTasks / processedChecklist.length) * 100) || 0;

		const updates = {
			checklist: processedChecklist,
			progress,
			tasks: {
				completed: completedTasks,
				total: processedChecklist.length,
			},
		};

		await handleCardUpdate(columnId, cardId, updates);
	};

	// Add attachment to a card
	const addAttachment = async (cardId, files) => {
		try {
			const updatedCard = await viewsApi.card.addAttachment(
				cardId,
				files
			);

			// Update the columns state with the new card data
			setColumns((prevColumns) =>
				prevColumns.map((column) => ({
					...column,
					Cards:
						column.Cards?.map((card) =>
							card.id === cardId ? updatedCard : card
						) || [],
				}))
			);

			return updatedCard;
		} catch (error) {
			console.error("Error adding attachment:", error);
			throw error;
		}
	};

	// Remove attachment from a card - FIXED VERSION
	const removeAttachment = async (cardId, attachmentId) => {
		try {
			const updatedCard = await viewsApi.card.removeAttachment(
				cardId,
				attachmentId
			);

			// Update the columns state with the new card data
			setColumns((prevColumns) =>
				prevColumns.map((column) => ({
					...column,
					Cards:
						column.Cards?.map((card) =>
							card.id === cardId ? updatedCard : card
						) || [],
				}))
			);

			return updatedCard;
		} catch (error) {
			console.error("Error removing attachment:", error);
			throw error;
		}
	};

	const getCardById = (cardId) => {
		for (const column of columns) {
			const card = column.Cards?.find((c) => c.id === cardId);
			if (card) {
				return { ...card, columnId: column.id };
			}
		}
		return null;
	};

	// Fetch fresh card data from the API
	const fetchFreshCardData = async (cardId) => {
		try {
			return await viewsApi.card.getById(cardId);
		} catch (error) {
			console.error("Error fetching fresh card data:", error);
			throw error;
		}
	};

	const refreshCard = (columnId, cardId) => {
		const card = columns
			.find((col) => col.id === columnId)
			?.Cards?.find((c) => c.id === cardId);

		if (card) {
			setSelectedCard(card);
			return card;
		}
		return null;
	};

	// Dependency management functions
	const addDependency = async (
		sourceCardId,
		targetCardId,
		type = "FS",
		lag = 0
	) => {
		try {
			const result = await viewsApi.dependency.addDependency(
				sourceCardId,
				targetCardId,
				type,
				lag
			);
			return result;
		} catch (error) {
			console.error("Error adding dependency:", error);
			throw error;
		}
	};

	const removeDependency = async (sourceCardId, targetCardId) => {
		try {
			const result = await viewsApi.dependency.removeDependency(
				sourceCardId,
				targetCardId
			);
			return result;
		} catch (error) {
			console.error("Error removing dependency:", error);
			throw error;
		}
	};

	return {
		addCard,
		handleCardUpdate,
		handleCardDelete,
		moveCard,
		updateCardChecklist,
		getCardById,
		fetchFreshCardData,
		refreshCard,
		addAttachment,
		removeAttachment,
		sendCatMessage,
		// Dependency management
		addDependency,
		removeDependency,
	};
};

export default useCardActions;
