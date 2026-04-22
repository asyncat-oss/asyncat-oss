// context/CardProvider.jsx - Card context provider
import { useState, useCallback, useEffect } from "react";
import CardContext from "./CardContext";
import CardDetailModal from "../tasks/carddetail/CardDetailModal";
import { useColumnContext } from "./ColumnContext";

export const CardProvider = ({ children, session, selectedProject }) => {
	const [selectedCard, setSelectedCard] = useState(null);
	const [showAddCardModal, setShowAddCardModal] = useState(false);
	const [deletingCards, setDeletingCards] = useState([]);
	const [isEditingCard, setIsEditingCard] = useState(false);

	// Get column context for updates
	const { setColumns, columns } = useColumnContext();

	// Extract user ID from session
	const userId = session?.user?.id || null;
	const currentUser = session?.user || null;

	// Extract project ID from columns (more reliable than selectedProject prop)
	const projectId = selectedProject?.id || columns?.[0]?.projectId || null;

	// Handle real-time card updates - memoized to prevent infinite re-renders
	const handleRealtimeCardUpdate = useCallback(
		({ type, card, oldCard }) => {
			setColumns((prevColumns) => {
				// For updates, ensure we have a clean slate by removing duplicates first
				if (type === "update") {
					// First pass: remove the card from all columns to prevent duplicates
					const cleanedColumns = prevColumns.map((col) => ({
						...col,
						Cards: Array.isArray(col.Cards)
							? col.Cards.filter((c) => c.id !== card.id)
							: [],
					}));

					// Second pass: add the card to its correct column with enhanced metadata
					return cleanedColumns.map((column) => {
						if (column.id === card.columnId) {
							const enhancedCard = {
								...card,
								lastUpdated: Date.now(),
								forceRefresh: Date.now(),
							};
							return {
								...column,
								Cards: [...column.Cards, enhancedCard].sort(
									(a, b) => (a.order || 0) - (b.order || 0)
								),
							};
						}
						return column;
					});
				}

				return prevColumns.map((column) => {
					const columnCards = Array.isArray(column.Cards)
						? [...column.Cards]
						: [];

					switch (type) {
						case "insert": {
							// Add new card if it belongs to this column
							if (card.columnId === column.id) {
								// Check if card already exists (avoid duplicates)
								const exists = columnCards.find(
									(c) => c.id === card.id
								);
								if (!exists) {
									return {
										...column,
										Cards: [...columnCards, card].sort(
											(a, b) =>
												(a.order || 0) - (b.order || 0)
										),
									};
								}
							}
							return column;
						}

						case "update": {
							// Always remove the card from any column it might be in first
							const cardExists = columnCards.find(
								(c) => c.id === card.id
							);
							let updatedColumn = column;

							// Remove card from this column if it exists
							if (cardExists) {
								updatedColumn = {
									...updatedColumn,
									Cards: columnCards.filter(
										(c) => c.id !== card.id
									),
								};
							}

							// Add card to its new column if this is the target column
							if (column.id === card.columnId) {
								return {
									...updatedColumn,
									Cards: [...updatedColumn.Cards, card].sort(
										(a, b) =>
											(a.order || 0) - (b.order || 0)
									),
								};
							}

							return updatedColumn;
						}

						case "delete": {
							// Remove deleted card
							return {
								...column,
								Cards: columnCards.filter(
									(c) => c.id !== card.id
								),
							};
						}

						default:
							return column;
					}
				});
			});

			// Update selected card if it's being viewed
			if (
				selectedCard &&
				selectedCard.id === card.id &&
				type === "update"
			) {
				setSelectedCard((prev) => ({
					...prev,
					...card,
					// Force a re-render by updating a timestamp
					lastUpdated: Date.now(),
				}));
			}

			// Remove from deleting cards list if it was being deleted
			if (type === "delete") {
				setDeletingCards((prev) => prev.filter((id) => id !== card.id));
			}
		},
		[setColumns, selectedCard, setDeletingCards]
	); // Close the useCallback properly

	// Handle real-time column updates - memoized to prevent infinite re-renders
	const handleRealtimeColumnUpdate = useCallback(
		({ type, column, oldColumn }) => {
			setColumns((prevColumns) => {
				switch (type) {
					case "insert": {
						// Check if column already exists to prevent duplicates
						const existingColumn = prevColumns.find(
							(col) => col.id === column.id
						);
						if (existingColumn) {
							return prevColumns; // Column already exists, don't add duplicate
						}
						return [...prevColumns, { ...column, Cards: [] }];
					}

					case "update": {
						return prevColumns.map((col) =>
							col.id === column.id
								? { ...col, ...column, Cards: col.Cards } // Preserve cards
								: col
						);
					}

					case "delete":
						return prevColumns.filter(
							(col) => col.id !== column.id
						);

					default:
						return prevColumns;
				}
			});
		},
		[setColumns]
	); // Close the useCallback properly

	// Force refresh mechanism to clean up ghost cards
	const forceRefreshCards = useCallback(() => {
		setColumns((prevColumns) => {
			let hasChanges = false;

			// Create a deep copy and ensure unique card IDs in each column
			const cleanedColumns = prevColumns.map((column) => {
				const uniqueCards = [];
				const seenIds = new Set();
				const initialCount = Array.isArray(column.Cards)
					? column.Cards.length
					: 0;

				if (Array.isArray(column.Cards)) {
					column.Cards.forEach((card) => {
						if (!seenIds.has(card.id)) {
							seenIds.add(card.id);
							uniqueCards.push({
								...card,
								forceRefresh: Date.now(),
								lastUpdated: card.lastUpdated || Date.now(),
							});
						} else {
							hasChanges = true; // Found a duplicate
						}
					});
				}

				if (uniqueCards.length !== initialCount) {
					hasChanges = true;
				}

				return {
					...column,
					Cards: uniqueCards.sort(
						(a, b) => (a.order || 0) - (b.order || 0)
					),
				};
			});

			// Only update if changes were made to avoid unnecessary re-renders
			return hasChanges ? cleanedColumns : prevColumns;
		});
	}, [setColumns]);

	// Real-time card management - solo mode (no realtime)
	const isConnected = false;
	const editingSessions = new Map();
	const startEditingCard = async (cardId) => true;
	const stopEditingCard = async (cardId) => {};
	const canEditCard = (cardId) => true;
	const getEditingUser = (cardId) => null;
	const broadcastCardUpdate = async (cardId, updates) => {};

	// Periodic cleanup to prevent ghost cards (every 30 seconds)
	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			forceRefreshCards();
		}, 30000); // Run every 30 seconds (reduced frequency)

		return () => clearInterval(cleanupInterval);
	}, [forceRefreshCards]);

	// Enhanced card selection with edit locking
	const handleCardSelect = useCallback(
		async (card) => {
			if (!card) {
				setSelectedCard(null);
				return;
			}

			// Check if card can be edited
			if (!canEditCard(card.id)) {
				const editingUser = getEditingUser(card.id);
				// Still allow viewing but show read-only mode
				setSelectedCard({ ...card, readOnly: true, editingUser });
				return;
			}

			// Try to acquire edit lock
			const canEdit = await startEditingCard(card.id);
			if (canEdit) {
				setSelectedCard(card);
				setIsEditingCard(true);
			} else {
				const editingUser = getEditingUser(card.id);
				setSelectedCard({ ...card, readOnly: true, editingUser });
			}
		},
		[canEditCard, getEditingUser, startEditingCard]
	);

	// Enhanced card close with edit lock cleanup
	const handleCardClose = useCallback(async () => {
		if (selectedCard && isEditingCard) {
			await stopEditingCard(selectedCard.id);
			setIsEditingCard(false);
		}
		setSelectedCard(null);
	}, [selectedCard, isEditingCard, stopEditingCard]);

	// Handle starting the card deletion process
	const handleCardDeleteStart = useCallback((cardId) => {
		setDeletingCards((prev) => [...prev, cardId]);

		// Remove from the deletingCards array after animation completes
		setTimeout(() => {
			setDeletingCards((prev) => prev.filter((id) => id !== cardId));
		}, 500);
	}, []);

	// Optimistic card update with real-time broadcast
	const updateCardOptimistically = useCallback(
		async (cardId, updates) => {
			// Update local state immediately (removed aggressive cleanup)
			setColumns((prevColumns) => {
				return prevColumns.map((column) => ({
					...column,
					Cards: Array.isArray(column.Cards)
						? column.Cards.map((card) =>
								card.id === cardId
									? {
											...card,
											...updates,
											lastUpdated: Date.now(),
									  }
									: card
						  )
						: [],
				}));
			});

			// Update selected card if it's the one being updated
			if (selectedCard && selectedCard.id === cardId) {
				setSelectedCard((prev) => ({
					...prev,
					...updates,
					lastUpdated: Date.now(),
				}));
			}

			// Broadcast to other users
			await broadcastCardUpdate(cardId, updates);
		},
		[setColumns, selectedCard, broadcastCardUpdate]
	);

	// Check if user can edit a specific card
	const canUserEditCard = useCallback(
		(cardId) => {
			return canEditCard(cardId);
		},
		[canEditCard]
	);

	// Get editing user for a specific card
	const getCardEditingUser = useCallback(
		(cardId) => {
			return getEditingUser(cardId);
		},
		[getEditingUser]
	);

	// Enhanced value with real-time features (keeping original API)
	const value = {
		// Original context values (unchanged API)
		selectedCard,
		setSelectedCard: handleCardSelect, // Enhanced but same API
		showAddCardModal,
		setShowAddCardModal,
		deletingCards,
		setDeletingCards,
		userId,
		createdBy: userId,

		// New real-time features (additions)
		isRealtimeConnected: isConnected,
		editingSessions,
		isEditingCard,
		updateCardOptimistically,
		canUserEditCard,
		getCardEditingUser,
		forceRefreshCards, // Add force refresh function

		// Enhanced handlers
		onCardClose: handleCardClose,
		onCardDeleteStart: handleCardDeleteStart,
	};

	return (
		<CardContext.Provider value={value}>
			{children}

			{/* Enhanced CardDetailModal with edit locking */}
			{selectedCard && (
				<CardDetailModal
					key={`card-modal-${selectedCard.id}`}
					card={selectedCard}
					onClose={handleCardClose}
					onDeleteStart={handleCardDeleteStart}
					// Pass additional props for real-time features
					readOnly={selectedCard.readOnly}
					editingUser={selectedCard.editingUser}
					isRealtimeConnected={isConnected}
					onOptimisticUpdate={updateCardOptimistically}
				/>
			)}
		</CardContext.Provider>
	);
};

export default CardProvider;
