/**
 * Centralized API Service
 *
 * This file consolidates all API calls used throughout the views directory.
 * It provides a single point of configuration and maintenance for all
 * external API communications.
 */

import authService from "../services/authService.js";

// API Base URLs from environment variables
const KANBAN_API_URL = import.meta.env.VITE_KANBAN_URL + "/api";
const MAIN_API_URL = import.meta.env.VITE_USER_URL + "/api";

// API call debouncing to prevent 429 errors
const apiCallTracker = new Map();
const DEBOUNCE_DELAY = 100; // 100ms between identical requests

const debounceApiCall = (url, requestFn) => {
	const now = Date.now();
	const lastCall = apiCallTracker.get(url);

	if (lastCall && now - lastCall < DEBOUNCE_DELAY) {
		return new Promise((resolve, reject) => {
			setTimeout(async () => {
				try {
					apiCallTracker.set(url, Date.now());
					const result = await requestFn();
					resolve(result);
				} catch (error) {
					reject(error);
				}
			}, DEBOUNCE_DELAY - (now - lastCall));
		});
	}

	apiCallTracker.set(url, now);
	return requestFn();
};

/**
 * Generic fetch wrapper with error handling and authentication
 */
const apiRequest = async (url, options = {}) => {
	// Use debouncing for GET requests to prevent excessive API calls
	const shouldDebounce = !options.method || options.method === "GET";

	const makeRequest = async () => {
		const response = await authService.authenticatedFetch(url, options);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				errorData.error || `HTTP error! status: ${response.status}`
			);
		}

		return await response.json();
	};

	if (shouldDebounce) {
		return debounceApiCall(url, makeRequest);
	}

	return makeRequest();
};

/**
 * Generic fetch for non-JSON responses
 */
const apiRequestRaw = async (url, options = {}) => {
	// Use debouncing for GET requests to prevent excessive API calls
	const shouldDebounce = !options.method || options.method === "GET";

	const makeRequest = async () => {
		const response = await authService.authenticatedFetch(url, {
			...options,
			headers: {
				...options.headers,
			},
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				errorData.error || `HTTP error! status: ${response.status}`
			);
		}

		return response;
	};

	if (shouldDebounce) {
		return debounceApiCall(url, makeRequest);
	}

	return makeRequest();
};

// =============================================================================
// COLUMN API METHODS
// =============================================================================

export const columnAPI = {
	/**
	 * Create a new column
	 */
	create: async (columnData) => {
		return apiRequest(`${KANBAN_API_URL}/columns`, {
			method: "POST",
			body: JSON.stringify(columnData),
		});
	},

	/**
	 * Update an existing column
	 */
	update: async (columnId, updates) => {
		return apiRequest(`${KANBAN_API_URL}/columns/${columnId}`, {
			method: "PUT",
			body: JSON.stringify(updates),
		});
	},

	/**
	 * Delete a column
	 */
	delete: async (columnId, projectId) => {
		return apiRequestRaw(
			`${KANBAN_API_URL}/columns/${columnId}?projectId=${projectId}`,
			{
				method: "DELETE",
			}
		);
	},

	/**
	 * Update column order
	 */
	updateOrder: async (projectId, order) => {
		return apiRequest(`${KANBAN_API_URL}/columns/order`, {
			method: "PUT",
			body: JSON.stringify({ projectId, order }),
		});
	},

	/**
	 * Update column completion status
	 */
	updateCompletionStatus: async (columnId, isCompletionColumn) => {
		return apiRequest(
			`${KANBAN_API_URL}/columns/${columnId}/completion-status`,
			{
				method: "PUT",
				body: JSON.stringify({ isCompletionColumn }),
			}
		);
	},

	/**
	 * Load columns for a project
	 */
	loadColumns: async (projectId, userId) => {
		const effectiveProjectId = projectId || userId;
		return apiRequest(
			`${KANBAN_API_URL}/columns?projectId=${effectiveProjectId}`
		);
	},
};

// =============================================================================
// CARD API METHODS
// =============================================================================

export const cardAPI = {
	/**
	 * Create a new card
	 */
	create: async (cardData) => {
		return apiRequest(`${KANBAN_API_URL}/cards`, {
			method: "POST",
			body: JSON.stringify(cardData),
		});
	},

	/**
	 * Create a card with file attachments
	 */
	createWithFiles: async (formData) => {
		return apiRequestRaw(`${KANBAN_API_URL}/cards`, {
			method: "POST",
			headers: {}, // Let browser set multipart boundary
			body: formData,
		}).then((response) => response.json());
	},

	/**
	 * Update an existing card
	 */
	update: async (cardId, updates) => {
		return apiRequest(`${KANBAN_API_URL}/cards/${cardId}`, {
			method: "PUT",
			body: JSON.stringify(updates),
		});
	},

	/**
	 * Delete a card
	 */
	delete: async (cardId) => {
		return apiRequestRaw(`${KANBAN_API_URL}/cards/${cardId}`, {
			method: "DELETE",
		});
	},

	/**
	 * Get card by ID
	 */
	getById: async (cardId) => {
		return apiRequest(`${KANBAN_API_URL}/cards/${cardId}`);
	},

	/**
	 * Move a card to a different column
	 */
	move: async (cardId, sourceColumnId, destinationColumnId, newOrder = 0) => {
		return apiRequest(`${KANBAN_API_URL}/cards/${cardId}/move`, {
			method: "POST",
			body: JSON.stringify({
				sourceColumnId,
				destinationColumnId,
				newOrder,
			}),
		});
	},

	/**
	 * Add attachment to card
	 */
	addAttachment: async (cardId, files) => {
		const formData = new FormData();
		for (const file of files) {
			formData.append("file", file);
		}

		const endpoint =
			files.length > 1
				? `${KANBAN_API_URL}/cards/${cardId}/attachments/multiple`
				: `${KANBAN_API_URL}/cards/${cardId}/attachments`;

		return apiRequestRaw(endpoint, {
			method: "POST",
			headers: {}, // Let browser set multipart boundary
			body: formData,
		}).then((response) => response.json());
	},

	/**
	 * Remove attachment from card
	 */
	removeAttachment: async (cardId, attachmentId) => {
		const encodedAttachmentId = encodeURIComponent(attachmentId);
		return apiRequest(
			`${KANBAN_API_URL}/cards/${cardId}/attachments/${encodedAttachmentId}`,
			{
				method: "DELETE",
			}
		);
	},

};

// =============================================================================
// DEPENDENCY API METHODS
// =============================================================================

export const dependencyAPI = {
	/**
	 * Get dependencies for a card
	 */
	getCardDependencies: async (cardId) => {
		return apiRequest(`${KANBAN_API_URL}/cards/${cardId}/dependencies`);
	},

	/**
	 * Get dependencies of a card (cards this card depends on)
	 */
	getDependencies: async (cardId) => {
		return apiRequest(`${KANBAN_API_URL}/dependencies/card/${cardId}/dependencies`);
	},

	/**
	 * Get cards that depend on this card (dependent cards)
	 */
	getDependentCards: async (cardId) => {
		return apiRequest(`${KANBAN_API_URL}/dependencies/card/${cardId}/dependents`);
	},

	/**
	 * Add a dependency to a card
	 */
	addDependency: async (cardId, targetCardId, type = "FS", lag = 0) => {
		return apiRequest(`${KANBAN_API_URL}/dependencies/card/${cardId}/dependencies`, {
			method: "POST",
			body: JSON.stringify({ targetCardId, type, lag }),
		});
	},

	/**
	 * Remove a dependency from a card
	 */
	removeDependency: async (cardId, targetCardId) => {
		return apiRequestRaw(
			`${KANBAN_API_URL}/dependencies/card/${cardId}/dependencies/${targetCardId}`,
			{
				method: "DELETE",
			}
		);
	},

	/**
	 * Check dependencies status for a card
	 */
	checkDependenciesStatus: async (cardId) => {
		return apiRequest(
			`${KANBAN_API_URL}/dependencies/card/${cardId}/dependencies/status`
		);
	},

	/**
	 * Get unlocked cards that can be started
	 */
	getUnlockedCards: async (cardId) => {
		return apiRequest(
			`${KANBAN_API_URL}/cards/${cardId}/dependencies/unlocked`
		);
	},
};

// =============================================================================
// USER API METHODS
// =============================================================================

export const userAPI = {
	/**
	 * Get user by ID
	 */
	getById: async (userId) => {
		return apiRequest(`${MAIN_API_URL}/users/${userId}`);
	},

	/**
	 * Get current user
	 */
	getCurrentUser: async () => {
		return apiRequest(`${MAIN_API_URL}/users/me`);
	},

	/**
	 * Get project members
	 */
	getProjectMembers: async (projectId) => {
		return apiRequest(`${MAIN_API_URL}/projects/${projectId}/members`);
	},
};

// =============================================================================
// AI API METHODS
// =============================================================================

export const aiAPI = {
	/**
	 * Send message to Cat AI for card creation
	 */
	sendCatMessage: async (message, clientDateTime) => {
		return apiRequest(`${MAIN_API_URL}/ai/cat-card-create`, {
			method: "POST",
			body: JSON.stringify({
				message,
				clientDateTime,
			}),
		});
	},

	/**
	 * Modify card using AI
	 */
	modifyCard: async (cardData, instructions) => {
		return apiRequest(`${MAIN_API_URL}/ai/modify-card`, {
			method: "POST",
			body: JSON.stringify({
				cardData,
				instructions,
			}),
		});
	},
};

// =============================================================================
// BATCH API METHODS
// =============================================================================

export const batchAPI = {
	/**
	 * Fetch multiple users by IDs using batch endpoint
	 */
	fetchUsersByIds: async (userIds) => {
		if (!userIds || userIds.length === 0) {
			return {};
		}

		try {
			// Use the bulk endpoint for better performance
			const response = await apiRequest(`${MAIN_API_URL}/users/by-ids`, {
				method: "POST",
				body: JSON.stringify({ ids: userIds }),
			});

			const users = response.data || response;
			const userMap = {};

			if (Array.isArray(users)) {
				users.forEach((user) => {
					if (user && user.id) {
						userMap[user.id] = user;
					}
				});
			}

			return userMap;
		} catch (error) {
			console.error("Error fetching users in batch:", error);

			// Fallback to individual requests if batch fails
			const promises = userIds.map((id) =>
				userAPI.getById(id).catch((err) => {
					console.error(`Failed to fetch user ${id}:`, err);
					return { id };
				})
			);

			const results = await Promise.all(promises);
			const userMap = {};

			results.filter(Boolean).forEach((user) => {
				if (user && user.id) {
					userMap[user.id] = user;
				}
			});

			return userMap;
		}
	},

};

// =============================================================================
// EXPORT DEFAULT OBJECT WITH ALL APIS
// =============================================================================

const viewsApi = {
	column: columnAPI,
	card: cardAPI,
	dependency: dependencyAPI,
	user: userAPI,
	ai: aiAPI,
	batch: batchAPI,

	// Direct access to URLs for edge cases
	KANBAN_API_URL,
	MAIN_API_URL,
};

export default viewsApi;
