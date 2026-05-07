import authService from "../../services/authService.js";

const CALENDAR_API_URL = import.meta.env.VITE_CALENDAR_URL;
const MAIN_API_URL = import.meta.env.VITE_USER_URL;

class CalendarCache {
	constructor() {
		this.eventCache = new Map();
		this.cardCache = new Map();
		this.cacheTTL = 5 * 60 * 1000;
	}

	generateCacheKey(filters) {
		return JSON.stringify({
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
		if (item && Date.now() - item.timestamp < this.cacheTTL) return item.data;
		cache.delete(key);
		return null;
	}

	set(cache, key, data) {
		cache.set(key, { data, timestamp: Date.now() });
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
}

const calendarCache = new CalendarCache();

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

const appendDateRange = (params, filters = {}) => {
	if (filters.startDate) params.append("startDate", filters.startDate);
	if (filters.endDate) params.append("endDate", filters.endDate);
};

export const calendarEventsApi = {
	getCombinedData: async (filters = {}) => {
		const params = new URLSearchParams();
		appendDateRange(params, filters);

		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events/combined-data?${params.toString()}`,
			{
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
			}
		);

		return await handleResponse(response);
	},

	getEvents: async (filters = {}) => {
		const params = new URLSearchParams();
		appendDateRange(params, filters);
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events?${params.toString()}`
		);
		return await handleResponse(response);
	},

	createEvent: async (eventData) => {
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events`,
			{
				method: "POST",
				body: JSON.stringify(eventData),
			}
		);
		return await handleResponse(response);
	},

	updateEvent: async (eventId, eventData) => {
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events/${eventId}`,
			{
				method: "PUT",
				body: JSON.stringify(eventData),
			}
		);
		return await handleResponse(response);
	},

	deleteEvent: async (eventId) => {
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events/${eventId}`,
			{ method: "DELETE" }
		);
		return await handleResponse(response);
	},

	getCalendarCards: async (filters = {}) => {
		const params = new URLSearchParams();
		appendDateRange(params, filters);
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events/calendar-cards?${params.toString()}`
		);
		return await handleResponse(response);
	},

	updateCardDueDate: async (cardId, dueDate) => {
		const response = await authService.authenticatedFetch(
			`${CALENDAR_API_URL}/api/events/cards/${cardId}/due-date`,
			{
				method: "PUT",
				body: JSON.stringify({ dueDate }),
			}
		);
		return await handleResponse(response);
	},
};

export const calendarDataApi = {
	performanceMetrics: {
		totalRequests: 0,
		cacheHits: 0,
		cacheMisses: 0,
		averageResponseTime: 0,
		lastUpdateTime: null,

		recordRequest: (wasCached, responseTime) => {
			calendarDataApi.performanceMetrics.totalRequests++;
			if (wasCached) calendarDataApi.performanceMetrics.cacheHits++;
			else calendarDataApi.performanceMetrics.cacheMisses++;

			const currentAvg = calendarDataApi.performanceMetrics.averageResponseTime;
			const totalRequests = calendarDataApi.performanceMetrics.totalRequests;
			calendarDataApi.performanceMetrics.averageResponseTime =
				(currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
			calendarDataApi.performanceMetrics.lastUpdateTime = new Date();
		},
	},

	fetchCalendarData: async (filters = {}) => {
		const startTime = performance.now();
		const cachedEvents = calendarCache.getEvents(filters);
		const cachedCards = calendarCache.getCards(filters);

		if (cachedEvents && cachedCards) {
			calendarDataApi.performanceMetrics.recordRequest(
				true,
				performance.now() - startTime
			);
			return {
				events: cachedEvents,
				cards: cachedCards,
				cached: { events: true, cards: true },
			};
		}

		try {
			const result = await calendarEventsApi.getCombinedData(filters);
			const events = result.data?.events || [];
			const cards = result.data?.cards || [];

			calendarCache.setEvents(filters, events);
			calendarCache.setCards(filters, cards);
			calendarDataApi.performanceMetrics.recordRequest(
				false,
				performance.now() - startTime
			);

			return {
				events,
				cards,
				cached: { events: false, cards: false },
			};
		} catch (error) {
			console.error("Error fetching calendar data:", error);

			const [eventsResult, cardsResult] = await Promise.all([
				cachedEvents
					? Promise.resolve({ events: cachedEvents })
					: calendarEventsApi.getEvents(filters),
				cachedCards
					? Promise.resolve({ cards: cachedCards })
					: calendarEventsApi.getCalendarCards(filters),
			]);

			const events = cachedEvents || eventsResult.events || [];
			const cards = cachedCards || cardsResult.cards || [];
			calendarCache.setEvents(filters, events);
			calendarCache.setCards(filters, cards);

			return {
				events,
				cards,
				cached: { events: !!cachedEvents, cards: !!cachedCards },
			};
		}
	},

	fetchCalendarDataWithRetry: async (filters = {}, maxRetries = 3) => {
		let lastError;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await calendarDataApi.fetchCalendarData(filters);
			} catch (error) {
				lastError = error;
				if (error.message?.includes("Authentication")) throw error;
				if (attempt < maxRetries) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}
		throw lastError;
	},

	prefetchAdjacentData: async (currentFilters, view) => {
		try {
			const currentDate = new Date(currentFilters.startDate);
			const adjacentFilters = [];

			if (view === "month") {
				const prevMonth = new Date(currentDate);
				prevMonth.setMonth(prevMonth.getMonth() - 1);
				const nextMonth = new Date(currentDate);
				nextMonth.setMonth(nextMonth.getMonth() + 1);
				adjacentFilters.push(
					{ ...currentFilters, startDate: prevMonth.toISOString().split("T")[0] },
					{ ...currentFilters, startDate: nextMonth.toISOString().split("T")[0] }
				);
			} else if (view === "week") {
				const prevWeek = new Date(currentDate);
				prevWeek.setDate(prevWeek.getDate() - 7);
				const nextWeek = new Date(currentDate);
				nextWeek.setDate(nextWeek.getDate() + 7);
				adjacentFilters.push(
					{ ...currentFilters, startDate: prevWeek.toISOString().split("T")[0] },
					{ ...currentFilters, startDate: nextWeek.toISOString().split("T")[0] }
				);
			}

			adjacentFilters.forEach((filters) => {
				calendarDataApi.fetchCalendarData(filters).catch(() => {});
			});
		} catch {
			// Background prefetch is opportunistic.
		}
	},

	invalidateCache: () => {
		calendarCache.clear();
	},

	backgroundSync: {
		isEnabled: true,
		interval: null,
		lastSyncTime: null,

		start: (filters) => {
			if (!calendarDataApi.backgroundSync.isEnabled) return;
			calendarDataApi.backgroundSync.stop();
			calendarDataApi.backgroundSync.interval = setInterval(async () => {
				if (navigator.onLine && document.visibilityState === "visible") {
					try {
						calendarCache.clear();
						await calendarDataApi.fetchCalendarData(filters);
						calendarDataApi.backgroundSync.lastSyncTime = new Date();
					} catch (error) {
						console.error("Background sync failed:", error);
					}
				}
			}, 10 * 60 * 1000);
		},

		stop: () => {
			if (calendarDataApi.backgroundSync.interval) {
				clearInterval(calendarDataApi.backgroundSync.interval);
				calendarDataApi.backgroundSync.interval = null;
			}
		},
	},

	networkSync: {
		wasOffline: false,

		init: () => {
			window.addEventListener("online", () => {
				if (calendarDataApi.networkSync.wasOffline) {
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

export const calendarProjectsApi = {
	getProjects: async () => {
		const response = await authService.authenticatedFetch(
			`${MAIN_API_URL}/api/projects`
		);
		return await handleResponse(response);
	},
};

export const calendarUsersApi = {
	getUserProfile: async (userId) => {
		const response = await authService.authenticatedFetch(
			`${MAIN_API_URL}/api/users/${userId}`
		);
		return await handleResponse(response);
	},

	getUserProfiles: async (userIds) => {
		const profiles = {};
		await Promise.all(
			userIds.filter(Boolean).map(async (userId) => {
				try {
					const result = await calendarUsersApi.getUserProfile(userId);
					profiles[userId] = result.data || result;
				} catch {
					profiles[userId] = { id: userId };
				}
			})
		);
		return profiles;
	},
};

export const calendarApi = {
	calendarEventsApi,
	calendarDataApi,
	calendarProjectsApi,
	calendarUsersApi,
};
