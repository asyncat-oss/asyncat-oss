// CollaborationToolbar.jsx - Shows active collaborators and connection status
import React, { useState } from "react";
import { Users, Wifi, WifiOff, Eye, Edit3 } from "lucide-react";

// Import stock profile pictures
import catDP from "../../../assets/dp/CAT.webp";
import dogDP from "../../../assets/dp/DOG.webp";
import dolphinDP from "../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../assets/dp/FOX.webp";
import lionDP from "../../../assets/dp/LION.webp";
import owlDP from "../../../assets/dp/OWL.webp";
import penguinDP from "../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../assets/dp/WOLF.webp";

const profilePictureMap = {
  CAT: catDP,
  DOG: dogDP,
  DOLPHIN: dolphinDP,
  DRAGON: dragonDP,
  ELEPHANT: elephantDP,
  FOX: foxDP,
  LION: lionDP,
  OWL: owlDP,
  PENGUIN: penguinDP,
  WOLF: wolfDP,
};

// Helper function to get profile picture URL
const getProfilePicture = (profilePicId) => {
  if (!profilePicId) return null;

  // Check if it's a custom uploaded image (URL starts with https://)
  if (profilePicId.startsWith("https://")) {
    return profilePicId;
  }

  // Handle predefined avatars
  if (profilePictureMap[profilePicId]) {
    return profilePictureMap[profilePicId];
  }
  return null;
};

const CollaborationToolbar = ({
  collaborators,
  isConnected,
  error,
  loading,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const otherCollaborators = collaborators.filter((c) => !c.isCurrentUser);

  // Get active collaborators (those currently editing or viewing) - exclude current user
  const activeCollaborators = otherCollaborators.filter((c) => {
    const now = Date.now();
    const lastSeen = new Date(c.lastSeen).getTime();
    return now - lastSeen < 60000; // Active in the last minute
  });

  const typingCollaborators = otherCollaborators.filter((c) => c.isTyping);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
          Connecting to collaboration...
        </span>
      </div>
    );
  }

  if (otherCollaborators.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-500 midnight:text-green-400">
            <Wifi className="w-4 h-4" />
            <span className="text-xs font-medium">Live</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
            <WifiOff className="w-4 h-4" />
            <span className="text-xs font-medium">Offline</span>
          </div>
        )}
      </div>

      {/* Active Collaborators */}
      {activeCollaborators.length > 0 && (
        <div
          className="relative flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 midnight:hover:bg-gray-800 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Users className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />

          {/* Avatar Stack */}
          <div className="flex -space-x-3">
            {activeCollaborators.slice(0, 3).map((collaborator, index) => {
              const profilePicUrl = getProfilePicture(collaborator.profilePicture);
              const isOnline = collaborator.lastSeen && (Date.now() - new Date(collaborator.lastSeen).getTime()) < 30000; // Online if active in last 30 seconds

              return (
                <div
                  key={collaborator.userId}
                  className="relative"
                  style={{ zIndex: 3 - index }}
                  title={`${collaborator.name}${collaborator.isCurrentUser ? ' (You)' : ''} - ${isOnline ? 'Online' : 'Away'}`}
                >
                  {/* Outer ring for online status */}
                  <div className={`w-10 h-10 rounded-full p-0.5 ${isOnline ? 'bg-gradient-to-br from-green-400 to-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    {/* Inner white ring */}
                    <div className="w-full h-full rounded-full p-0.5 bg-white dark:bg-gray-800 midnight:bg-gray-900">
                      {/* Avatar container */}
                      <div
                        className="relative w-full h-full rounded-full overflow-hidden"
                        style={{ backgroundColor: collaborator.color }}
                      >
                        {profilePicUrl ? (
                          <img
                            src={profilePicUrl}
                            alt={collaborator.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                            {collaborator.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Online status dot - bottom right */}
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 midnight:border-gray-900 shadow-sm" />
                  )}

                  {/* Typing indicator - top right */}
                  {collaborator.isTyping && (
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 midnight:border-gray-900 flex items-center justify-center shadow-md animate-pulse"
                      style={{ backgroundColor: collaborator.color }}
                    >
                      <Edit3 className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
              );
            })}

            {activeCollaborators.length > 3 && (
              <div className="relative" style={{ zIndex: 0 }}>
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700 border-2 border-white dark:border-gray-800 midnight:border-gray-900 flex items-center justify-center shadow-sm">
                  <span className="text-sm font-bold text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                    +{activeCollaborators.length - 3}
                  </span>
                </div>
              </div>
            )}
          </div>

          <span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
            {activeCollaborators.length} online
          </span>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-700 rounded-lg shadow-lg p-3 z-50">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-2">
                Active Collaborators
              </h4>

              <div className="space-y-3">
                {activeCollaborators.map((collaborator) => {
                  const profilePicUrl = getProfilePicture(collaborator.profilePicture);
                  const isOnline = collaborator.lastSeen && (Date.now() - new Date(collaborator.lastSeen).getTime()) < 30000;

                  return (
                    <div
                      key={collaborator.userId}
                      className="flex items-center gap-3"
                    >
                      {/* Profile picture with online indicator */}
                      <div className="relative flex-shrink-0">
                        {/* Outer ring for online status */}
                        <div className={`w-10 h-10 rounded-full p-0.5 ${isOnline ? 'bg-gradient-to-br from-green-400 to-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                          {/* Inner white ring */}
                          <div className="w-full h-full rounded-full p-0.5 bg-white dark:bg-gray-800 midnight:bg-gray-900">
                            {/* Avatar container */}
                            <div
                              className="relative w-full h-full rounded-full overflow-hidden"
                              style={{ backgroundColor: collaborator.color }}
                            >
                              {profilePicUrl ? (
                                <img
                                  src={profilePicUrl}
                                  alt={collaborator.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                                  {collaborator.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Online status dot */}
                        {isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 midnight:border-gray-900 shadow-sm" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-300 truncate">
                          {collaborator.name}
                          {collaborator.isCurrentUser && (
                            <span className="ml-1 text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-semibold">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 flex items-center gap-1">
                          {collaborator.isTyping ? (
                            <>
                              <Edit3 className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                              <span className="text-blue-600 dark:text-blue-400 font-medium">Typing...</span>
                            </>
                          ) : isOnline ? (
                            <>
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <span className="text-green-600 dark:text-green-400 font-medium">Online</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>Away</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Typing Indicators */}
      {typingCollaborators.length > 0 && !isExpanded && (
        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 midnight:text-indigo-400">
          <Edit3 className="w-4 h-4" />
          <span className="text-xs">
            {typingCollaborators.length === 1
              ? `${typingCollaborators[0].name} is typing...`
              : `${typingCollaborators.length} people are typing...`}
          </span>
        </div>
      )}

      {/* Error State */}
      {error && !isConnected && (
        <div className="text-xs text-amber-600 dark:text-amber-400 midnight:text-amber-400 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-950/20 px-2 py-1 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default CollaborationToolbar;
