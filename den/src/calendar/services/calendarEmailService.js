// Email service configuration
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL;

// Validate email service URL on module load (optional in self-hosted build)
if (!EMAIL_SERVICE_URL) {
	// Calendar invite emails are optional — skip silently if not configured.
} else {
	console.log('Email Service configured:', EMAIL_SERVICE_URL);
	
	// Warn if using localhost in what appears to be a containerized environment
	if (EMAIL_SERVICE_URL.includes('localhost') && process.env.NODE_ENV === 'production') {
		console.warn('⚠️  WARNING: EMAIL_SERVICE_URL uses localhost in production!');
		console.warn('⚠️  This will likely fail in Docker/containerized environments.');
		console.warn('⚠️  Use the service name or external URL instead.');
	}
}	

/**
 * Send a calendar-related email using The Cat's templates
 * @param {string} action - The email template action (invitation, update, etc.)
 * @param {string} userEmail - Recipient email
 * @param {object} templateData - Data for the email template
 */
const sendCalendarEmail = async (action, userEmail, templateData) => {
	console.log('=== CALENDAR EMAIL SERVICE START ===');
	console.log('Action:', action);
	console.log('User Email:', userEmail);
	console.log('Email Service URL:', EMAIL_SERVICE_URL);
	console.log('Template Data:', JSON.stringify(templateData, null, 2));
	
	try {
		const endpoint = `${EMAIL_SERVICE_URL}/api/email/template/calendar/${action}`;
		console.log('Calling endpoint:', endpoint);
		
		const payload = {
			userEmail: userEmail,
			data: { ...templateData, userEmail },
		};
		console.log('Request payload:', JSON.stringify(payload, null, 2));
		
		// Send email to the email microservice using the template endpoint
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		console.log('Response status:', response.status);
		console.log('Response statusText:', response.statusText);

		if (!response.ok) {
			const error = await response.json();
			console.error('Email service returned error:', error);
			throw new Error(
				`Email service error: ${error.error || "Unknown error"}`
			);
		}

		const result = await response.json();
		console.log('Email service success response:', result);
		console.log(
			`The Cat delivered ${action} email to ${userEmail}:`,
			result.message
		);
		console.log('=== CALENDAR EMAIL SERVICE END (SUCCESS) ===');

		return result;
	} catch (error) {
		console.error('=== CALENDAR EMAIL SERVICE ERROR ===');
		console.error('Error type:', error.constructor.name);
		console.error('Error message:', error.message);
		console.error('Error stack:', error.stack);
		
		// Provide helpful guidance for common errors
		if (error.cause?.code === 'ECONNREFUSED') {
			console.error('');
			console.error('🔥 CONNECTION REFUSED ERROR DETECTED 🔥');
			console.error('The email service is not reachable at:', endpoint);
			console.error('');
			console.error('Common causes:');
			console.error('1. Email service is not running');
			console.error('2. Wrong hostname (localhost in Docker won\'t work)');
			console.error('3. Wrong port number');
			console.error('4. Network connectivity issues');
			console.error('');
			console.error('If running in Docker, use the service name instead of localhost!');
			console.error('Example: EMAIL_SERVICE_URL=http://email-service:9000');
			console.error('');
		}
		
		console.error(
			`The Cat failed to send ${action} email to ${userEmail}:`,
			error
		);
		console.error('=== CALENDAR EMAIL SERVICE END (FAILED) ===');
		throw error;
	}
};

/**
 * Send event invitation emails to all attendees
 * @param {object} event - The event object
 * @param {object} organizer - The organizer user object
 * @param {object} supabase - Supabase client for user lookups
 */
export const sendEventInvitations = async (event, organizer, supabase) => {
	try {
		if (!event.attendees || !Array.isArray(event.attendees)) {
			console.log("The Cat says: No attendees to invite. How lonely.");
			return;
		}

		const invitationPromises = event.attendees
			.filter((attendee) => attendee.status === "pending") // Only send to pending attendees
			.map(async (attendee) => {
				try {
					// Get attendee user info if we have user_id
					let attendeeName = "Mysterious Human";
					let attendeeEmail = attendee.email;

					if (attendee.user_id) {
						const { data: user } = await supabase
							.from("users")
							.select("name, email")
							.eq("id", attendee.user_id)
							.single();

						if (user) {
							attendeeName = user.name || "Mysterious Human";
							attendeeEmail = user.email;
						}
					}

					const templateData = {
						userName: attendeeName,
						userEmail: attendeeEmail,
						eventTitle: event.title,
						organizerName: organizer.name || "Someone Important",
						eventDate: new Date(
							event.startTime
						).toLocaleDateString(),
						startTime: new Date(
							event.startTime
						).toLocaleTimeString(),
						endTime: new Date(event.endTime).toLocaleTimeString(),
						eventDescription:
							event.description && event.description.trim()
								? event.description.trim()
								: null,
					};
					return sendCalendarEmail(
						"invitation",
						attendeeEmail,
						templateData
					);
				} catch (error) {
					console.error(
						`The Cat couldn't invite ${attendee.email}:`,
						error
					);
					return null;
				}
			});

		const results = await Promise.allSettled(invitationPromises);
		const successful = results.filter(
			(r) => r.status === "fulfilled"
		).length;
		const failed = results.filter((r) => r.status === "rejected").length;

		console.log(
			`The Cat sent ${successful} invitations successfully, ${failed} failed.`
		);
		return { successful, failed };
	} catch (error) {
		console.error("The Cat failed to send invitations:", error);
		throw error;
	}
};

/**
 * Send event update notifications to all attendees
 * @param {object} event - The updated event object
 * @param {object} updater - The user who updated the event
 * @param {object} supabase - Supabase client
 * @param {string} updateMessage - Description of what changed
 */
export const sendEventUpdateNotifications = async (
	event,
	updater,
	supabase,
	updateMessage
) => {
	try {
		if (!event.attendees || !Array.isArray(event.attendees)) {
			console.log("The Cat says: No attendees to notify about updates.");
			return;
		}

		const updatePromises = event.attendees
			.filter(
				(attendee) =>
					attendee.status !== "declined" && // Don't bother people who declined
					attendee.user_id !== updater.id && // Don't notify the person who made the change
					attendee.email !== updater.email
			)
			.map(async (attendee) => {
				try {
					let attendeeName = "Mysterious Human";
					let attendeeEmail = attendee.email;

					if (attendee.user_id) {
						const { data: user } = await supabase
							.from("users")
							.select("name, email")
							.eq("id", attendee.user_id)
							.single();

						if (user) {
							attendeeName = user.name || "Mysterious Human";
							attendeeEmail = user.email;
						}
					}

					const templateData = {
						userName: attendeeName,
						userEmail: attendeeEmail,
						eventTitle: event.title,
						updatedBy: updater.name || "Someone Indecisive",
						newDate: new Date(event.startTime).toLocaleDateString(),
						newTime: `${new Date(
							event.startTime
						).toLocaleTimeString()} - ${new Date(
							event.endTime
						).toLocaleTimeString()}`,
						eventDescription:
							event.description && event.description.trim()
								? event.description.trim()
								: null,
						updateMessage:
							updateMessage ||
							"Various mysterious changes were made",
					};

					return sendCalendarEmail(
						"event_updated",
						attendeeEmail,
						templateData
					);
				} catch (error) {
					console.error(
						`The Cat couldn't notify ${attendee.email} about updates:`,
						error
					);
					return null;
				}
			});

		const results = await Promise.allSettled(updatePromises);
		const successful = results.filter(
			(r) => r.status === "fulfilled"
		).length;

		console.log(
			`The Cat notified ${successful} people about event updates.`
		);
		return { successful };
	} catch (error) {
		console.error("The Cat failed to send update notifications:", error);
		throw error;
	}
};

/**
 * Send event cancellation notifications
 * @param {object} event - The cancelled event object
 * @param {object} canceller - The user who cancelled the event
 * @param {object} supabase - Supabase client
 * @param {string} reason - Cancellation reason
 */
export const sendEventCancellationNotifications = async (
	event,
	canceller,
	supabase,
	reason
) => {
	try {
		if (!event.attendees || !Array.isArray(event.attendees)) {
			console.log(
				"The Cat says: No one to disappoint with this cancellation."
			);
			return;
		}

		const cancellationPromises = event.attendees
			.filter(
				(attendee) =>
					attendee.status !== "declined" && // Don't bother people who already declined
					attendee.user_id !== canceller.id && // Don't notify the canceller
					attendee.email !== canceller.email
			)
			.map(async (attendee) => {
				try {
					let attendeeName = "Mysterious Human";
					let attendeeEmail = attendee.email;
					let responseStatus = "agreed to attend";

					if (attendee.user_id) {
						const { data: user } = await supabase
							.from("users")
							.select("name, email")
							.eq("id", attendee.user_id)
							.single();

						if (user) {
							attendeeName = user.name || "Mysterious Human";
							attendeeEmail = user.email;
						}
					}

					// Set response status message based on attendee status
					switch (attendee.status) {
						case "accepted":
							responseStatus = "enthusiastically accepted";
							break;
						case "maybe":
							responseStatus = "tentatively considered attending";
							break;
						case "creator":
							responseStatus = "organized";
							break;
						default:
							responseStatus = "agreed to attend";
					}

					const templateData = {
						userName: attendeeName,
						userEmail: attendeeEmail,
						eventTitle: event.title,
						responseStatus: responseStatus,
						originalDateTime: `${new Date(
							event.startTime
						).toLocaleDateString()} at ${new Date(
							event.startTime
						).toLocaleTimeString()}`,
						cancelledBy: canceller.name || "The Party Pooper",
						cancellationReason: reason || null,
					};

					return sendCalendarEmail(
						"event_cancelled",
						attendeeEmail,
						templateData
					);
				} catch (error) {
					console.error(
						`The Cat couldn't notify ${attendee.email} about cancellation:`,
						error
					);
					return null;
				}
			});

		const results = await Promise.allSettled(cancellationPromises);
		const successful = results.filter(
			(r) => r.status === "fulfilled"
		).length;

		console.log(
			`The Cat delivered disappointment to ${successful} people.`
		);
		return { successful };
	} catch (error) {
		console.error(
			"The Cat failed to send cancellation notifications:",
			error
		);
		throw error;
	}
};

/**
 * Send RSVP response notification to event organizer
 * @param {object} event - The event object
 * @param {object} respondent - The user who responded
 * @param {string} responseStatus - accepted, declined, or maybe
 * @param {object} supabase - Supabase client
 * @param {string} responseMessage - Optional message from respondent
 */
export const sendRSVPNotification = async (
	event,
	respondent,
	responseStatus,
	supabase,
	responseMessage = null
) => {
	try {
		// Get the event organizer
		const { data: organizer } = await supabase
			.from("users")
			.select("name, email")
			.eq("id", event.createdBy)
			.single();

		if (!organizer) {
			console.log(
				"The Cat says: No organizer found to notify. How mysterious."
			);
			return;
		}

		// Don't notify if the organizer is responding to their own event
		if (respondent.id === event.createdBy) {
			console.log(
				"The Cat says: Organizer responding to their own event. No notification needed."
			);
			return;
		}

		// Count current attendees for status
		const acceptedCount = (event.attendees || []).filter(
			(a) => a.status === "accepted"
		).length;
		const maybeCount = (event.attendees || []).filter(
			(a) => a.status === "maybe"
		).length;
		const declinedCount = (event.attendees || []).filter(
			(a) => a.status === "declined"
		).length;

		// Set response action text
		let responseAction = "responded to";
		switch (responseStatus) {
			case "accepted":
				responseAction = "accepted";
				break;
			case "declined":
				responseAction = "declined";
				break;
			case "maybe":
				responseAction = "gave a wishy-washy maybe to";
				break;
		}

		const templateData = {
			userName: organizer.name || "Event Organizer",
			userEmail: organizer.email,
			eventTitle: event.title,
			respondentName: respondent.name || "Someone",
			responseAction: responseAction,
			responseStatus: responseStatus,
			responseMessage: responseMessage,
			attendanceCount: `${acceptedCount} confirmed, ${maybeCount} maybe, ${declinedCount} declined`,
		};

		return sendCalendarEmail(
			"response_notification",
			organizer.email,
			templateData
		);
	} catch (error) {
		console.error("The Cat failed to send RSVP notification:", error);
		throw error;
	}
};

/**
 * Send schedule conflict warning
 * @param {string} userEmail - Email of the user with conflicts
 * @param {string} userName - Name of the user
 * @param {string} conflictTime - Time period of the conflict
 * @param {Array} conflictingEvents - Array of conflicting events
 */
export const sendConflictWarning = async (
	userEmail,
	userName,
	conflictTime,
	conflictingEvents
) => {
	try {
		const templateData = {
			userName: userName || "Time-Challenged Human",
			userEmail: userEmail,
			conflictTime: conflictTime,
			conflictingEvents: conflictingEvents.map((event) => ({
				title: event.title,
				time: `${new Date(
					event.startTime
				).toLocaleDateString()} ${new Date(
					event.startTime
				).toLocaleTimeString()}`,
			})),
		};

		return sendCalendarEmail("conflict_warning", userEmail, templateData);
	} catch (error) {
		console.error(
			`The Cat failed to send conflict warning to ${userEmail}:`,
			error
		);
		throw error;
	}
};

/**
 * Send notification to attendees who were removed from an event
 * @param {object} event - The event object
 * @param {Array} removedAttendees - Array of removed attendees
 * @param {object} remover - The user who removed the attendees
 * @param {object} supabase - Supabase client for user lookups
 */
export const sendAttendeeRemovedNotifications = async (
	event,
	removedAttendees,
	remover,
	supabase
) => {
	try {
		if (
			!removedAttendees ||
			!Array.isArray(removedAttendees) ||
			removedAttendees.length === 0
		) {
			console.log("The Cat says: No attendees were removed.");
			return;
		}

		const removalPromises = removedAttendees.map(async (attendee) => {
			try {
				let attendeeName = "Mysterious Human";
				let attendeeEmail = attendee.email;

				if (attendee.user_id) {
					const { data: user } = await supabase
						.from("users")
						.select("name, email")
						.eq("id", attendee.user_id)
						.single();

					if (user) {
						attendeeName = user.name || "Mysterious Human";
						attendeeEmail = user.email;
					}
				}

				const templateData = {
					userName: attendeeName,
					userEmail: attendeeEmail,
					eventTitle: event.title,
					removedBy: remover.name || "Someone with Authority",
					eventDate: new Date(event.startTime).toLocaleDateString(),
					eventTime: new Date(event.startTime).toLocaleTimeString(),
					eventDescription:
						event.description && event.description.trim()
							? event.description.trim()
							: null,
				};

				return sendCalendarEmail(
					"attendee_removed",
					attendeeEmail,
					templateData
				);
			} catch (error) {
				console.error(
					`The Cat couldn't notify ${attendee.email} about removal:`,
					error
				);
				return null;
			}
		});

		const results = await Promise.allSettled(removalPromises);
		const successful = results.filter(
			(r) => r.status === "fulfilled"
		).length;
		const failed = results.filter((r) => r.status === "rejected").length;

		console.log(
			`The Cat notified ${successful} removed attendees, ${failed} failed.`
		);
		return { successful, failed };
	} catch (error) {
		console.error("The Cat failed to send removal notifications:", error);
		throw error;
	}
};
