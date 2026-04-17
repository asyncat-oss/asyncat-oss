import React, { useState, useCallback } from "react";
import {
  Calendar,
  Check,
  X,
  Loader2,
  User,
  Clock,
  MapPin,
  HelpCircle,
  AlertCircle,
  Plus,
} from "lucide-react";
const CalendarContent = ({ onCreateEvent, onNavigateToCalendar }) => {
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const loading = false;

  // Solo mode: no event invites from other users
  const eventInvites = [];

  // Clear messages after timeout
  React.useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  React.useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Event invite responses are not used in solo mode (eventInvites is always [])
  const handleEventInviteResponse = useCallback(async (_eventId, _response) => {
    setError('Event invite responses are not available in the self-hosted build.');
  }, []);

  // Format event date/time
  const formatEventDateTime = useCallback((startTime, endTime, isAllDay) => {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isAllDay) {
      return start.toLocaleDateString();
    }

    const sameDay = start.toDateString() === end.toDateString();

    if (sameDay) {
      return `${start.toLocaleDateString()} ${start.toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      return `${start.toLocaleDateString()} ${start.toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )} - ${end.toLocaleDateString()} ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
  }, []);

  // Skeleton loader for event rows
  const EventSkeleton = () => (
    <div className="flex items-center py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800 animate-pulse">
      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 mr-3" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-2/3" />
        <div className="h-2 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded w-1/2" />
      </div>
      <div className="flex gap-1 ml-2">
        <div className="w-12 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded" />
        <div className="w-12 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Event Invites Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Event Invitations
          </h3>
          {eventInvites.length > 0 && (
            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 midnight:bg-red-900/30 text-red-700 dark:text-red-300 midnight:text-red-300 text-xs font-medium rounded-full">
              {eventInvites.length}
            </span>
          )}
        </div>

        {/* Success/Error messages */}
        {successMessage && (
          <div className="rounded-lg bg-green-50 dark:bg-green-800/20 midnight:bg-green-800/20 p-3 flex items-center gap-2 animate-in slide-in-from-top-1 duration-200">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400 midnight:text-green-400 flex-shrink-0" />
            <span className="text-xs text-green-700 dark:text-green-300 midnight:text-green-300">
              {successMessage}
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-800/20 midnight:bg-red-800/20 p-3 flex items-center gap-2 animate-in slide-in-from-top-1 duration-200">
            <X className="w-4 h-4 text-red-600 dark:text-red-400 midnight:text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300 midnight:text-red-300">
              {error}
            </span>
          </div>
        )}

        {/* Event Invites Content */}
        <div className="space-y-3">
          {loading ? (
            <div>
              {[...Array(2)].map((_, i) => (
                <EventSkeleton key={i} />
              ))}
            </div>
          ) : eventInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-8 h-8 text-gray-400 dark:text-gray-500 midnight:text-gray-600 mb-3" />
              <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
                No event invitations
              </h4>
              <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-xs leading-relaxed max-w-48">
                Event invitations will appear here when you receive them.
              </p>
            </div>
          ) : (
            eventInvites.map((invite, index) => (
              <div
                key={invite.id}
                className="bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg p-4 space-y-3 animate-in slide-in-from-top-1 duration-200"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded bg-white dark:bg-gray-700 midnight:bg-gray-700 flex items-center justify-center">
                      <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm truncate">
                        {invite.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs text-blue-600 dark:text-blue-300 midnight:text-blue-300 bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/30 flex-shrink-0 font-medium ml-2">
                        Event
                      </span>
                    </div>

                    {/* Event details */}
                    <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300">
                      {/* Event time */}
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatEventDateTime(
                          invite.startTime,
                          invite.endTime,
                          invite.isAllDay
                        )}
                      </div>

                      {/* Location for events */}
                      {invite.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{invite.location}</span>
                        </div>
                      )}

                      {/* Creator */}
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>
                          Created by{" "}
                          <span className="font-medium">
                            {invite.creator?.name ||
                              invite.creator?.email ||
                              "Unknown"}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {invite.description && (
                      <p className="text-gray-600 dark:text-gray-300 midnight:text-gray-300 text-xs mt-2 line-clamp-2 leading-relaxed">
                        {invite.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-700">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() =>
                        handleEventInviteResponse(invite.id, "accepted")
                      }
                      disabled={processingId === invite.id}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 border border-green-300 dark:border-green-600 midnight:border-green-600 bg-green-50 dark:bg-green-800/20 midnight:bg-green-800/20 text-green-700 dark:text-green-300 midnight:text-green-300 font-medium rounded text-xs transition-all duration-150 hover:bg-green-100 dark:hover:bg-green-800/30 midnight:hover:bg-green-800/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === invite.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Accept
                    </button>
                    <button
                      onClick={() =>
                        handleEventInviteResponse(invite.id, "maybe")
                      }
                      disabled={processingId === invite.id}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 border border-orange-300 dark:border-orange-600 midnight:border-orange-600 bg-orange-50 dark:bg-orange-800/20 midnight:bg-orange-800/20 text-orange-700 dark:text-orange-300 midnight:text-orange-300 font-medium rounded text-xs transition-all duration-150 hover:bg-orange-100 dark:hover:bg-orange-800/30 midnight:hover:bg-orange-800/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <HelpCircle className="w-3 h-3" />
                      Maybe
                    </button>
                    <button
                      onClick={() =>
                        handleEventInviteResponse(invite.id, "declined")
                      }
                      disabled={processingId === invite.id}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 border border-red-300 dark:border-red-600 midnight:border-red-600 bg-red-50 dark:bg-red-800/20 midnight:bg-red-800/20 text-red-700 dark:text-red-300 midnight:text-red-300 font-medium rounded text-xs transition-all duration-150 hover:bg-red-100 dark:hover:bg-red-800/30 midnight:hover:bg-red-800/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-3 h-3" />
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarContent;
