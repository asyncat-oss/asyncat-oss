// Centralized API functions for Settings components
import authService from "../services/authService.js";

const MAIN_URL = import.meta.env.VITE_USER_URL;
const AUTH_API_URL = import.meta.env.VITE_AUTH_URL;
const CALENDAR_URL = import.meta.env.VITE_CALENDAR_URL;

// Helper function to handle API responses
const handleResponse = async (response) => {
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(
			errorData.error || errorData.message || "An error occurred"
		);
	}
	return response.json();
};

// Helper function to make API calls with common options
const apiCall = async (url, options = {}) => {
	const response = await authService.authenticatedFetch(url, options);
	return handleResponse(response);
};

// ===========================================
// WORKSPACE/TEAM SETTINGS API FUNCTIONS
// ===========================================

export const workspaceApi = {
	// Fetch team members
	fetchMembers: async (workspaceId) => {
		return apiCall(`${MAIN_URL}/api/teams/${workspaceId}/members`);
	},

	// Fetch team stats (including member limits)
	fetchStats: async (workspaceId) => {
		return apiCall(`${MAIN_URL}/api/teams/${workspaceId}/stats`);
	},

	// Update workspace settings
	updateWorkspace: async (workspaceId, updateData) => {
		const result = await apiCall(`${MAIN_URL}/api/teams/${workspaceId}`, {
			method: "PUT",
			body: JSON.stringify(updateData),
		});
		return result;
	},

	// Invite member to workspace
	inviteMember: async (workspaceId, email) => {
		try {
			const result = await apiCall(
				`${MAIN_URL}/api/teams/${workspaceId}/members`,
				{
					method: "POST",
					body: JSON.stringify({ email }),
				}
			);
			return result;
		} catch (error) {
			if (error.code === "MEMBER_LIMIT_REACHED") throw error;
			throw error;
		}
	},

	// Invite non-app user to workspace (user without account)
	inviteNonAppUser: async (workspaceId, email, roleInfo = {}) => {
		return apiCall(
			`${MAIN_URL}/api/teams/${workspaceId}/invitations/non-app-user`,
			{
				method: "POST",
				body: JSON.stringify({
					email,
					role: roleInfo.role || null,
					department: roleInfo.department || null,
					responsibilities: roleInfo.responsibilities || null,
				}),
			}
		);
	},

	// Cancel non-app user invitation
	cancelNonAppUserInvitation: async (workspaceId, email) => {
		const result = await apiCall(
			`${MAIN_URL}/api/teams/${workspaceId}/invitations/non-app-user/${encodeURIComponent(
				email
			)}`,
			{
				method: "DELETE",
			}
		);
		return result;
	},

	// Remove member from workspace
	removeMember: async (workspaceId, userId, confirmDataLoss = false) => {
		// Use query parameter for confirmDataLoss to avoid issues with DELETE body
		const url = `${MAIN_URL}/api/teams/${workspaceId}/members/${userId}${
			confirmDataLoss ? "?confirmDataLoss=true" : ""
		}`;

		const response = await authService.authenticatedFetch(url, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			// Also include in body as backup
			body: JSON.stringify({ confirmDataLoss }),
		});

		// Handle the special case where confirmation is required
		if (response.status === 400) {
			const errorData = await response.json().catch(() => ({}));
			if (errorData.requiresConfirmation) {
				// Return a special error that includes the confirmation data
				const confirmationError = new Error(
					"Data loss confirmation required"
				);
				confirmationError.confirmationData = errorData;
				throw confirmationError;
			}
			// For other 400 errors, handle normally
			throw new Error(
				errorData.error || errorData.message || "Bad request"
			);
		}

		const result = await handleResponse(response);
		return result;
	},

	// Delete workspace
	deleteWorkspace: async (workspaceId, force = false) => {
		const result = await apiCall(`${MAIN_URL}/api/teams/${workspaceId}`, {
			method: "DELETE",
			body: JSON.stringify({ force }),
		});
		return result;
	},

	// Leave workspace
	leaveWorkspace: async (workspaceId) => {
		const result = await apiCall(
			`${MAIN_URL}/api/teams/${workspaceId}/leave`,
			{
				method: "POST",
			}
		);
		return result;
	},
};

// ===========================================
// SECURITY/AUTH API FUNCTIONS
// ===========================================

export const securityApi = {
	// Change password
	changePassword: async (currentPassword, newPassword) => {
		return apiCall(`${AUTH_API_URL}/auth/change-password`, {
			method: "POST",
			body: JSON.stringify({ currentPassword, newPassword }),
		});
	},
};

// ===========================================
// PROFILE API FUNCTIONS
// ===========================================

export const profileApi = {
	// Fetch user profile
	fetchProfile: async () => {
		return apiCall(`${MAIN_URL}/api/users/me`);
	},

	// Update user profile
	updateProfile: async (updateData) => {
		const result = await apiCall(`${MAIN_URL}/api/users/me`, {
			method: "PUT",
			body: JSON.stringify(updateData),
		});
		return result;
	},

	// Upload profile picture
	uploadProfilePicture: async (file) => {
		const formData = new FormData();
		formData.append("profilePicture", file);

		const response = await authService.authenticatedFetch(
			`${MAIN_URL}/api/users/me/profile-picture`,
			{
				method: "POST",
				body: formData, // Don't set Content-Type header for FormData
			}
		);

		const result = await handleResponse(response);
		return result;
	},

	// Delete custom profile picture
	deleteCustomImage: async () => {
		const result = await apiCall(
			`${MAIN_URL}/api/users/me/profile-picture`,
			{
				method: "DELETE",
			}
		);
		return result;
	},
};

// ===========================================
// INTEGRATIONS API FUNCTIONS
// ===========================================

export const integrationsApi = {
	// Google Calendar API functions
	googleCalendar: {
		// Fetch Google Calendar status
		fetchStatus: async () => {
			return apiCall(`${CALENDAR_URL}/api/google/status`);
		},

		// Get Google Calendar connect URL
		getConnectUrl: async () => {
			return apiCall(`${CALENDAR_URL}/api/google/connect`);
		},

		// Disconnect Google Calendar
		disconnect: async () => {
			return apiCall(`${CALENDAR_URL}/api/google/disconnect`, {
				method: "DELETE",
			});
		},
	},
};

// ===========================================
// AI HARDWARE STATS API
// ===========================================

const AI_API_BASE = import.meta.env.VITE_MAIN_URL + '/api/ai/providers';

// Minimal API — only hardware stats are needed by the sidebar HardwareWidget
export const aiProviderApi = {
  // Get hardware + running model stats (used by HardwareWidget)
  getStats: async () => {
    return apiCall(`${AI_API_BASE}/stats`);
  },
};

// ===========================================
// LOCAL MODEL MANAGER API
// ===========================================

export const localModelsApi = {
  // List all downloaded models
  listModels: async () => {
    return apiCall(`${AI_API_BASE}/local-models`);
  },

  // Get storage info
  getStorage: async () => {
    return apiCall(`${AI_API_BASE}/local-models/storage`);
  },

  // Delete a model
  deleteModel: async (filename) => {
    return apiCall(`${AI_API_BASE}/local-models/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  },

  // Start downloading a model
  startDownload: async (url, filename) => {
    return apiCall(`${AI_API_BASE}/local-models/download`, {
      method: 'POST',
      body: JSON.stringify({ url, filename }),
    });
  },

  // List active downloads
  listDownloads: async () => {
    return apiCall(`${AI_API_BASE}/local-models/downloads`);
  },

  // Get download status
  getDownloadStatus: async (downloadId) => {
    return apiCall(`${AI_API_BASE}/local-models/downloads/${downloadId}`);
  },

  // Cancel a download
  cancelDownload: async (downloadId) => {
    return apiCall(`${AI_API_BASE}/local-models/downloads/${downloadId}`, {
      method: 'DELETE',
    });
  },

  // Poll download progress (replaces SSE — avoids EventSource auth issues)
  // Returns a cleanup function that stops polling when called.
  streamDownloadProgress: (downloadId, onProgress, onDone, onError) => {
    let stopped = false;
    let intervalId = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const data = await apiCall(`${AI_API_BASE}/local-models/downloads/${downloadId}`);
        if (stopped) return;

        onProgress?.(data);

        if (data.status === 'complete' || data.status === 'error' || data.status === 'cancelled') {
          stopped = true;
          clearInterval(intervalId);
          onDone?.(data);
        }
      } catch (err) {
        if (!stopped) {
          stopped = true;
          clearInterval(intervalId);
          onError?.(err.message || 'Polling failed');
        }
      }
    };

    // Poll immediately, then every 800ms
    poll();
    intervalId = setInterval(poll, 800);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  },
};

// ===========================================
// BUILT-IN LLAMA.CPP SERVER API
// ===========================================

export const llamaServerApi = {
  // Check if llama-server binary is installed
  checkBinary: async () => {
    return apiCall(`${AI_API_BASE}/server/check`);
  },

  // Get current server state (idle / loading / ready / error)
  getStatus: async () => {
    return apiCall(`${AI_API_BASE}/server/status`);
  },

  // Start the built-in server with a downloaded model.
  // This returns immediately — the server loads in background.
  // Use pollStatus() to track progress.
  start: async (filename, ctxSize) => {
    return apiCall(`${AI_API_BASE}/server/start`, {
      method: 'POST',
      body: JSON.stringify({ filename, ctxSize }),
    });
  },

  // Stop the server and unload the model.
  stop: async () => {
    return apiCall(`${AI_API_BASE}/server/stop`, { method: 'POST' });
  },

  // Poll server status until it reaches 'ready' or 'error'.
  // onUpdate(snap) is called every poll cycle.
  // onReady(snap) is called once when status === 'ready'.
  // onError(snap) is called if status === 'error'.
  // Returns a cleanup function that stops polling.
  pollStatus: (onUpdate, onReady, onError) => {
    let stopped = false;
    let timerId = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const snap = await apiCall(`${AI_API_BASE}/server/status`);
        if (stopped) return;
        onUpdate?.(snap);
        if (snap.status === 'ready') {
          stopped = true;
          onReady?.(snap);
          return;
        }
        if (snap.status === 'error') {
          stopped = true;
          onError?.(snap);
          return;
        }
      } catch (err) {
        if (!stopped) {
          stopped = true;
          onError?.({ status: 'error', error: err.message });
          return;
        }
      }
      if (!stopped) {
        timerId = setTimeout(poll, 800);
      }
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timerId);
    };
  },
};

// ===========================================
// ERROR HANDLING UTILITIES
// ===========================================

export const apiUtils = {
	// Handle API errors with user-friendly messages
	handleError: (error, defaultMessage = "An unexpected error occurred") => {
		console.error("API Error:", error);
		return error.message || defaultMessage;
	},

	// Check if error is a network error
	isNetworkError: (error) => {
		return error instanceof TypeError && error.message.includes("fetch");
	},

	// Check if error is unauthorized
	isUnauthorized: (error) => {
		return (
			error.message?.includes("unauthorized") ||
			error.message?.includes("401")
		);
	},
};