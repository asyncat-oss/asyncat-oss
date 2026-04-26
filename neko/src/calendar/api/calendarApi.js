// Environment variables for different backend services
import authService from "../../services/authService.js";

const CALENDAR_API_URL = import.meta.env.VITE_CALENDAR_URL;
const MAIN_API_URL = import.meta.env.VITE_USER_URL;

// Cache implementation for calendar data
class CalendarCache {
	constructor() {
		this.eventCache = new Map();
		this.cardCache = new Map();
		this.cacheTTL = 5 * 60 * 1000; // 5 minutes
	}

	generateCacheKey(filters) {
		return JSON.stringify({
			...filters,
			// For better cache efficiency, normalize dates to day boundaries
			startDate: filters.startDate
				? new Date(filters.startDate).toISOString().split("T")[0]
				: null,
			endDate: filters.endDate
				? new Date(filters.endDate).toISOString().split("T")[0]
				: null,
		});
	}

	get(cache, key) {
		const item = cache.get(key);
		if (item && Date.now() - item.timestamp < this.cacheTTL) {
			return item.data;
		}
		cache.delete(key);
		return null;
	}

	set(cache, key, data) {
		cache.set(key, {
			data,
			timestamp: Date.now(),
		});
	}

	getEvents(filters) {
		return this.get(this.eventCache, this.generateCacheKey(filters));
	}

	setEvents(filters, data) {
		this.set(this.eventCache, this.generateCacheKey(filters), data);
	}

	getCards(filters) {
		return this.get(this.cardCache, this.generateCacheKey(filters));
	}

	setCards(filters, data) {
		this.set(this.cardCache, this.generateCacheKey(filters), data);
	}

	clear() {
		this.eventCache.clear();
		this.cardCache.clear();
	}

	invalidateProject(projectId) {
		// Remove cached data for specific project and related workspace data
		for (const [key] of this.eventCache) {
			const filters = JSON.parse(key);

			if (
				filters.projectId === projectId ||
				(!filters.projectId &&
					!filters.workspaceId &&
					!filters.personal) ||
				filters.workspaceId // Clear workspace caches as they might include this project
			) {
				this.eventCache.delete(key);
			}
		}
		for (const [key] of this.cardCache) {
			const filters = JSON.parse(key);

			if (
				filters.projectId === projectId ||
				(!filters.projectId && !filters.workspaceId) ||
				filters.workspaceId // Clear workspace caches as they might include this project
			) {
				this.cardCache.delete(key);
			}
		}
	}

	invalidateWorkspace(workspaceId) {
		// Remove cached data for specific workspace
		for (const [key] of this.eventCache) {
			const filters = JSON.parse(key);

			if (
				filters.workspaceId === workspaceId ||
				(!filters.projectId &&
					!filters.workspaceId &&
					!filters.personal)
			) {
				this.eventCache.delete(key);
			}
		}
		for (const [key] of this.cardCache) {
			const filters = JSON.parse(key);

			if (
				filters.workspaceId === workspaceId ||
				(!filters.projectId && !filters.workspaceId)
			) {
				this.cardCache.delete(key);
			}
		}
	}

	invalidateUserEvents() {
		// Remove all cached user events (for cases where we can't determine specific project/workspace)
		for (const [key] of this.eventCache) {
			const filters = JSON.parse(key);

			// Clear broad user event caches
			if (!filters.projectId && !filters.workspaceId) {
				this.eventCache.delete(key);
			}
		}
		for (const [key] of this.cardCache) {
			const filters = JSON.parse(key);

			// Clear broad user card caches
			if (!filters.projectId && !filters.workspaceId) {
				this.cardCache.delete(key);
			}
		}
	}
}

// Global cache instance
const calendarCache = new CalendarCache();

// Common helper functions with enhanced error handling
const handleResponse = async (response) => {
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({
			message: `Server responded with status ${response.status}`,
		}));
		throw new Error(
			errorData.error ||
				errorData.message ||
				`Request failed with status ${response.status}`
		);
	}
	return await response.json().catch(() => ({}));
};

// Calendar Events API (communicates with calendar service)
export const calendarEventsApi = {
	// OPTIMIZED: New combined data fetching endpoint
	getCombinedData: async (filters = {}) => {
		try {
			const params = new URLSearchParams();

			// Add filters to params
			if (filters.startDate)
				params.append("startDate", filters.startDate);
			if (filters.endDate) params.append("endDate", filters.endDate);
			if (filters.projectId)
				params.append("projectId", filters.projectId);
			if (filters.workspaceId)
				params.append("workspaceId", filters.workspaceId);
			if (filters.personal) params.append("personal", filters.personal);

			const url = `${CALENDAR_API_URL}/api/events/combined-data?${params.toString()}`;

			const response = await authService.authenticatedFetch(url, {
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				console.error(
					"Combined data request failed:",
					response.status,
					response.statusText
				);
				throw new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			}

			const result = await handleResponse(response);

			return result;
		} catch (error) {
			console.error("Error fetching combined data:", error);
			throw error;
		}
	},

	// Get events with filtering options
	getEvents: async (filters = {}) => {
		try {
			const params = new URLSearchParams();

			// Add filters to params
			if (filters.startDate)
				params.append("startDate", filters.startDate);
			if (filters.endDate) params.append("endDate", filters.endDate);
			if (filters.projectId)
				params.append("projectId", filters.projectId);
			if (filters.workspaceId)
				params.append("workspaceId", filters.workspaceId);
			if (filters.personal) params.append("personal", filters.personal);

			// Determine the correct endpoint based on filters
			let endpoint;
			if (filters.personal === "true" || filters.workspaceId) {
				endpoint = `${CALENDAR_API_URL}/api/events/my/events`;
			} else if (filters.projectId) {
				endpoint = `${CALENDAR_API_URL}/api/events`;
			} else {
				endpoint = `${CALENDAR_API_URL}/api/events/my/events`;
			}

			const url = `${endpoint}?${params.toString()}`;

			const response = await authService.authenticatedFetch(url);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error fetching events:", error);
			throw error;
		}
	},

	// Create a new event
	createEvent: async (eventData) => {
		try {
			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events`,
				{
					method: "POST",
					body: JSON.stringify(eventData),
				}
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error creating event:", error);
			throw error;
		}
	},

	// Update an existing event
	updateEvent: async (eventId, eventData) => {
		try {
			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events/${eventId}`,
				{
					method: "PUT",
					body: JSON.stringify(eventData),
				}
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error updating event:", error);
			throw error;
		}
	},

	// Delete an event
	deleteEvent: async (eventId, projectId = null) => {
		try {
			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events/${eventId}`,
				{
					method: "DELETE",
					body: JSON.stringify({ projectId }),
				}
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error deleting event:", error);
			throw error;
		}
	},

	// Get calendar cards (tasks with due dates)
	getCalendarCards: async (filters = {}) => {
		try {
			const params = new URLSearchParams();

			// Add filters to params
			if (filters.startDate)
				params.append("startDate", filters.startDate);
			if (filters.endDate) params.append("endDate", filters.endDate);
			if (filters.projectId)
				params.append("projectId", filters.projectId);
			if (filters.workspaceId)
				params.append("workspaceId", filters.workspaceId);

			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events/calendar-cards?${params.toString()}`
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error fetching calendar cards:", error);
			throw error;
		}
	},

	// Update card due date
	updateCardDueDate: async (cardId, dueDate) => {
		try {
			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events/cards/${cardId}/due-date`,
				{
					method: "PUT",
					body: JSON.stringify({ dueDate }),
				}
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error updating card due date:", error);
			throw error;
		}
	},

	// Check user availability across all workspaces
	checkAvailability: async (
		userIds,
		startTime,
		endTime,
		excludeEventId = null
	) => {
		try {
			const response = await authService.authenticatedFetch(
				`${CALENDAR_API_URL}/api/events/check-availability`,
				{
					method: "POST",
					body: JSON.stringify({
						userIds,
						startTime,
						endTime,
						excludeEventId,
					}),
				}
			);

			return await handleResponse(response);
		} catch (error) {
			console.error("Error checking user availability:", error);
			throw error;
		}
	},
};

export const calendarDataApi = {
	// Performance monitoring
	performanceMetrics: {
		totalRequests: 0,
		cacheHits: 0,
		cacheMisses: 0,
		averageResponseTime: 0,
		lastUpdateTime: null,

		recordRequest: (wasCached, responseTime) => {
			calendarDataApi.performanceMetrics.totalRequests++;
			if (wasCached) {
				calendarDataApi.performanceMetrics.cacheHits++;
			} else {
				calendarDataApi.performanceMetrics.cacheMisses++;
			}

			// Update average response time
			const currentAvg =
				calendarDataApi.performanceMetrics.averageResponseTime;
			const totalRequests =
				calendarDataApi.performanceMetrics.totalRequests;
			calendarDataApi.performanceMetrics.averageResponseTime =
				(currentAvg * (totalRequests - 1) + responseTime) /
				totalRequests;

			calendarDataApi.performanceMetrics.lastUpdateTime = new Date();
		},

		getCacheHitRate: () => {
			const total = calendarDataApi.performanceMetrics.totalRequests;
			if (total === 0) return 0;
			return (
				(calendarDataApi.performanceMetrics.cacheHits / total) *
				100
			).toFixed(1);
		},

		getStats: () => ({
			totalRequests: calendarDataApi.performanceMetrics.totalRequests,
			cacheHitRate:
				calendarDataApi.performanceMetrics.getCacheHitRate() + "%",
			averageResponseTime:
				calendarDataApi.performanceMetrics.averageResponseTime.toFixed(
					0
				) + "ms",
			lastUpdate: calendarDataApi.performanceMetrics.lastUpdateTime,
		}),
	},

	// Fetch both events and cards in a single request with caching
	fetchCalendarData: async (filters = {}) => {
		const startTime = performance.now();

		try {
			// Check cache first
			const cachedEvents = calendarCache.getEvents(filters);
			const cachedCards = calendarCache.getCards(filters);

			// If both are cached, return immediately
			if (cachedEvents && cachedCards) {
				const responseTime = performance.now() - startTime;
				calendarDataApi.performanceMetrics.recordRequest(
					true,
					responseTime
				);

				return {
					events: cachedEvents,
					cards: cachedCards,
					cached: {
						events: true,
						cards: true,
					},
				};
			}

			// Use combined endpoint for better performance
			const result = await calendarEventsApi.getCombinedData(filters);

			const events = result.data?.events || [];
			const cards = result.data?.cards || [];

			// Cache the results
			calendarCache.setEvents(filters, events);
			calendarCache.setCards(filters, cards);

			const responseTime = performance.now() - startTime;
			calendarDataApi.performanceMetrics.recordRequest(
				false,
				responseTime
			);

			return {
				events,
				cards,
				cached: {
					events: false,
					cards: false,
				},
			};
		} catch (error) {
			console.error("Error fetching calendar data:", error);

			// Fallback to separate requests if combined fails
			try {
				const cachedEvents = calendarCache.getEvents(filters);
				const cachedCards = calendarCache.getCards(filters);

				const promises = [];

				if (!cachedEvents) {
					promises.push(
						calendarEventsApi
							.getEvents(filters)
							.then((data) => ({ type: "events", data }))
					);
				}

				if (!cachedCards) {
					promises.push(
						calendarEventsApi
							.getCalendarCards(filters)
							.then((data) => ({ type: "cards", data }))
					);
				}

				const results = await Promise.all(promises);

				let events = cachedEvents;
				let cards = cachedCards;

				results.forEach((result) => {
					if (result.type === "events") {
						events = Array.isArray(result.data)
							? result.data
							: result.data.events || [];
						calendarCache.setEvents(filters, events);
					} else if (result.type === "cards") {
						cards = result.data.cards || [];
						calendarCache.setCards(filters, cards);
					}
				});

				return {
					events: events || [],
					cards: cards || [],
					cached: {
						events: !!cachedEvents,
						cards: !!cachedCards,
					},
				};
			} catch (fallbackError) {
				console.error("Fallback request also failed:", fallbackError);
				throw fallbackError;
			}
		}
	},

	// Enhanced fetch with retry logic and error recovery
	fetchCalendarDataWithRetry: async (filters = {}, maxRetries = 3) => {
		let lastError;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const result = await calendarDataApi.fetchCalendarData(filters);

				return result;
			} catch (error) {
				lastError = error;
				console.error(
					`Calendar fetch attempt ${attempt} failed:`,
					error
				);

				// Don't retry on authentication errors
				if (error.message && error.message.includes("Authentication")) {
					throw error;
				}

				// Exponential backoff for retries
				if (attempt < maxRetries) {
					const delay = Math.min(
						1000 * Math.pow(2, attempt - 1),
						10000
					); // Max 10 seconds

					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		// If all retries failed, throw the last error
		console.error(
			`Calendar data fetch failed after ${maxRetries} attempts`
		);
		throw lastError;
	},

	// Prefetch data for adjacent time periods
	prefetchAdjacentData: async (currentFilters, view) => {
		try {
			const currentDate = new Date(currentFilters.startDate);
			const adjacentFilters = [];

			if (view === "month") {
				// Prefetch previous and next month
				const prevMonth = new Date(currentDate);
				prevMonth.setMonth(prevMonth.getMonth() - 1);
				const nextMonth = new Date(currentDate);
				nextMonth.setMonth(nextMonth.getMonth() + 1);

				adjacentFilters.push(
					{
						...currentFilters,
						startDate: prevMonth.toISOString().split("T")[0],
					},
					{
						...currentFilters,
						startDate: nextMonth.toISOString().split("T")[0],
					}
				);
			} else if (view === "week") {
				// Prefetch previous and next week
				const prevWeek = new Date(currentDate);
				prevWeek.setDate(prevWeek.getDate() - 7);
				const nextWeek = new Date(currentDate);
				nextWeek.setDate(nextWeek.getDate() + 7);

				adjacentFilters.push(
					{
						...currentFilters,
						startDate: prevWeek.toISOString().split("T")[0],
					},
					{
						...currentFilters,
						startDate: nextWeek.toISOString().split("T")[0],
					}
				);
			}

			// Prefetch in background (don't await)
			adjacentFilters.forEach((filters) => {
				this.fetchCalendarData(filters).catch((_err) => {
					// Prefetch failed
				});
			});
		} catch (_error) {
			// Prefetch error
		}
	},

	// Enhanced cache invalidation with timestamp tracking
		invalidateCache: (
		identifier = null,
		type = "project",
		_reason = "unknown"
	) => {
		const timestamp = new Date().toISOString();

		if (!identifier) {
			calendarCache.clear();
		} else if (type === "workspace") {
			calendarCache.invalidateWorkspace(identifier);
		} else if (type === "user") {
			calendarCache.invalidateUserEvents();
		} else {
			calendarCache.invalidateProject(identifier);
		}
	},

	// Enhanced background sync with network status detection
	backgroundSync: {
		isEnabled: true,
		interval: null,
		lastSyncTime: null,

		start: (filters) => {
			if (!calendarDataApi.backgroundSync.isEnabled) return;

			// Clear any existing interval
			calendarDataApi.backgroundSync.stop();

			calendarDataApi.backgroundSync.interval = setInterval(async () => {
				// Only sync if online and window is visible
				if (
					navigator.onLine &&
					document.visibilityState === "visible"
				) {
					try {
						// Invalidate cache and fetch fresh data
						calendarCache.clear();
						await calendarDataApi.fetchCalendarData(filters);

						calendarDataApi.backgroundSync.lastSyncTime =
							new Date();
					} catch (_error) {
						console.error("Background sync failed:", _error);
					}
				}
			}, 10 * 60 * 1000); // Every 10 minutes
		},

		stop: () => {
			if (calendarDataApi.backgroundSync.interval) {
				clearInterval(calendarDataApi.backgroundSync.interval);
				calendarDataApi.backgroundSync.interval = null;
			}
		},

		enable: () => {
			calendarDataApi.backgroundSync.isEnabled = true;
		},

		disable: () => {
			calendarDataApi.backgroundSync.isEnabled = false;
			calendarDataApi.backgroundSync.stop();
		},
	},

	// Network status tracking
	networkSync: {
		wasOffline: false,

		init: () => {
			// Listen for online/offline events
			window.addEventListener("online", () => {
				if (calendarDataApi.networkSync.wasOffline) {
					// Trigger immediate sync when back online
					calendarCache.clear();
					window.dispatchEvent(new CustomEvent("networkRestored"));
				}
				calendarDataApi.networkSync.wasOffline = false;
			});

			window.addEventListener("offline", () => {
				calendarDataApi.networkSync.wasOffline = true;
			});
		},
	},
};

// Google Calendar API (communicates with calendar service)
// export const googleCalendarApi = {
//   // Check Google Calendar connection status
//   getStatus: async () => {
//     try {
//       const response = await fetch(`${CALENDAR_API_URL}/api/google/status`, {
//         credentials: 'include'
//       });

//       if (!response.ok) {
//         console.error('Failed to check Google Calendar status');
//         return { connected: false };
//       }

//       return await handleResponse(response);
//     } catch (error) {
//       console.error('Error checking Google Calendar status:', error);
//       return { connected: false };
//     }
//   },

//   // Connect to Google Calendar
//   connect: async () => {
//     try {
//       const response = await fetch(`${CALENDAR_API_URL}/api/google/connect`, {
//         method: 'GET',
//         credentials: 'include'
//       });

//       return await handleResponse(response);
//     } catch (error) {
//       console.error('Error connecting to Google Calendar:', error);
//       throw error;
//     }
//   },

//   // Get Google Calendar events
//   getEvents: async (timeMin, timeMax) => {
//     try {
//       const response = await fetch(
//         `${CALENDAR_API_URL}/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`,
//         { credentials: 'include' }
//       );

//       return await handleResponse(response);
//     } catch (error) {
//       console.error('Error fetching Google Calendar events:', error);
//       throw error;
//     }
//   },

//   // Delete Google Calendar event
//   deleteEvent: async (eventId) => {
//     try {
//       const response = await fetch(`${CALENDAR_API_URL}/api/google/events/${eventId}`, {
//         method: 'DELETE',
//         credentials: 'include'
//       });

//       return await handleResponse(response);
//     } catch (error) {
//       console.error('Error deleting Google Calendar event:', error);
//       throw error;
//     }
//   },

//   // Update Google Calendar event
//   updateEvent: async (eventId, eventData) => {
//     try {
//       const response = await fetch(`${CALENDAR_API_URL}/api/google/events/${eventId}`, {
//         method: 'PUT',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         credentials: 'include',
//         body: JSON.stringify(eventData)
//       });

//       return await handleResponse(response);
//     } catch (error) {
//       console.error('Error updating Google Calendar event:', error);
//       throw error;
//     }
//   }
// };

// Projects API (communicates with main backend service)
export const calendarProjectsApi = {
	// Get all projects for the current user
	getProjects: async () => {
		try {
			const response = await authService.authenticatedFetch(
				`${MAIN_API_URL}/api/projects`
			);
			return await handleResponse(response);
		} catch (error) {
			console.error("Error fetching projects:", error);
			throw error;
		}
	},
};

// calendarTeamsApi removed — single-user mode has no team members
export const calendarTeamsApi = {
	getTeamMembers: async () => ({ data: [] }),
};

// Users API (communicates with main backend service)
export const calendarUsersApi = {
	// Get user profile by ID
	getUserProfile: async (userId) => {
		try {
			const response = await authService.authenticatedFetch(
				`${MAIN_API_URL}/api/users/${userId}`
			);

			return await handleResponse(response);
		} catch (error) {
			console.error(`Error fetching profile for user ${userId}:`, error);
			throw error;
		}
	},

	// Fetch multiple user profiles
	getUserProfiles: async (userIds) => {
		try {
			const profiles = {};
			const fetchPromises = userIds.map(async (userId) => {
				if (!userId) return; // Skip invalid IDs

				try {
					const result = await calendarUsersApi.getUserProfile(
						userId
					);
					profiles[userId] = result.data || result;
				} catch (error) {
					console.error(
						`Error fetching profile for user ${userId}:`,
						error
					);
					profiles[userId] = { id: userId }; // Fallback
				}
			});

			await Promise.all(fetchPromises);
			return profiles;
		} catch (error) {
			console.error("Error fetching user profiles:", error);
			throw error;
		}
	},
};

// Export all API modules
export const calendarApi = {
	calendarEventsApi,
	/* googleCalendarApi, */ calendarTeamsApi,
	calendarProjectsApi,
	calendarUsersApi,
};
