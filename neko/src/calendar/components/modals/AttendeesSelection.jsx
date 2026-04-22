// AttendeesSelection.jsx — single-user OSS version
// Attendee selection is not applicable in single-user mode.
// This component is kept as a stub for API compatibility.

import { Users } from "lucide-react";

const AttendeesSelection = ({
	projectId,
	isPersonalEvent,
	selectedAttendees,
	setSelectedAttendees,
	availableAttendees,
	setAvailableAttendees,
}) => {
	// Single-user mode: no attendees to select
	if (isPersonalEvent) {
		return (
			<div className="text-center py-6 flex flex-col items-center">
				<Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
				<p className="text-sm text-gray-500 dark:text-gray-400">
					Personal events don't have attendees
				</p>
			</div>
		);
	}

	return (
		<div className="text-center py-6 flex flex-col items-center">
			<Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
			<p className="text-sm text-gray-500 dark:text-gray-400">
				Attendee management is not available in single-user mode
			</p>
		</div>
	);
};

export default AttendeesSelection;
