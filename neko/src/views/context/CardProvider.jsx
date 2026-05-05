import { useState, useCallback, useEffect } from "react";
import CardDetailModal from "../tasks/carddetail/CardDetailModal";
import { CardContext, useColumnContext } from "./viewContexts";

export const CardProvider = ({ children, session }) => {
	const [selectedCard, setSelectedCard] = useState(null);
	const [showAddCardModal, setShowAddCardModal] = useState(false);
	const [deletingCards, setDeletingCards] = useState([]);

	const { setColumns } = useColumnContext();

	const userId = session?.user?.id || null;

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

	// Periodic cleanup to prevent ghost cards (every 30 seconds)
	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			forceRefreshCards();
		}, 30000); // Run every 30 seconds (reduced frequency)

		return () => clearInterval(cleanupInterval);
	}, [forceRefreshCards]);

	// Simple card selection
	const handleCardSelect = useCallback(
		async (card) => {
			if (!card) {
				setSelectedCard(null);
				return;
			}
			setSelectedCard(card);
		},
		[]
	);

	// Simple card close
	const handleCardClose = useCallback(async () => {
		setSelectedCard(null);
	}, []);

	// Handle starting the card deletion process
	const handleCardDeleteStart = useCallback((cardId) => {
		setDeletingCards((prev) => [...prev, cardId]);

		// Remove from the deletingCards array after animation completes
		setTimeout(() => {
			setDeletingCards((prev) => prev.filter((id) => id !== cardId));
		}, 500);
	}, []);

	// Optimistic card update
	const updateCardOptimistically = useCallback(
		async (cardId, updates) => {
			// Update local state immediately
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
		},
		[setColumns, selectedCard]
	);

	// Context value
	const value = {
		selectedCard,
		setSelectedCard: handleCardSelect,
		showAddCardModal,
		setShowAddCardModal,
		deletingCards,
		setDeletingCards,
		userId,
		createdBy: userId,
		updateCardOptimistically,
		forceRefreshCards,
		onCardClose: handleCardClose,
		onCardDeleteStart: handleCardDeleteStart,
	};

	return (
		<CardContext.Provider value={value}>
			{children}

			{selectedCard && (
				<CardDetailModal
					key={`card-modal-${selectedCard.id}`}
					card={selectedCard}
					onClose={handleCardClose}
					onDeleteStart={handleCardDeleteStart}
					onOptimisticUpdate={updateCardOptimistically}
				/>
			)}
		</CardContext.Provider>
	);
};

export default CardProvider;
