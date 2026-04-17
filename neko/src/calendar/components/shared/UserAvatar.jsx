import React from "react";

// Import profile pictures (matching kanban implementation)
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

// Mapping for profile pictures (matching kanban implementation)
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

const UserAvatar = ({
	user,
	size = "md",
	className = "",
	showTooltip = true,
	onClick = null,
}) => {
	// Get user profile picture from profile picture ID (matching kanban implementation)
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

	// Get initial for user (matching kanban implementation)
	const getUserInitial = (user) => {
		// Try all possible locations for the name or email
		const name = user?.name || "";
		if (name) return name.charAt(0).toUpperCase();

		const email = user?.email || "";
		if (email) return email.charAt(0).toUpperCase();

		return "U"; // Default fallback
	};

	// Get display name for tooltip (matching kanban implementation)
	const getUserDisplayName = (user) => {
		return user?.name || user?.email || "User";
	};

	// Size configurations
	const sizeClasses = {
		xs: "w-4 h-4 text-xs",
		sm: "w-6 h-6 text-xs",
		md: "w-8 h-8 text-sm",
		lg: "w-10 h-10 text-sm",
		xl: "w-12 h-12 text-base",
		"2xl": "w-16 h-16 text-lg",
	};

	const profilePicture = getProfilePicture(user?.profile_picture);
	const initial = getUserInitial(user);
	const displayName = getUserDisplayName(user);

	const avatarElement = (
		<div
			className={`${
				sizeClasses[size]
			} rounded-full border-2 border-white dark:border-gray-700 midnight:border-gray-900
        flex items-center justify-center font-medium
        transition-transform duration-200 hover:scale-110 ${className}
        ${onClick ? "cursor-pointer" : ""}
      `}
			title={showTooltip ? displayName : undefined}
			onClick={onClick}
		>
			{profilePicture ? (
				<img
					src={profilePicture}
					alt={displayName}
					className="w-full h-full rounded-full object-cover"
					onError={(e) => {
						// Fallback to initials if image fails to load
						e.target.style.display = "none";
						e.target.nextSibling.style.display = "flex";
					}}
				/>
			) : (
				<div
					className="w-full h-full rounded-full bg-gradient-to-br from-blue-500/80 to-indigo-600/80 dark:from-blue-600/80 dark:to-indigo-700/80 midnight:from-blue-700/80 midnight:to-indigo-800/80
             text-white flex items-center justify-center shadow-sm"
				>
					{initial}
				</div>
			)}
			{/* Hidden fallback for failed image loads */}
			<div
				className="w-full h-full rounded-full bg-gradient-to-br from-blue-500/80 to-indigo-600/80 dark:from-blue-600/80 dark:to-indigo-700/80 midnight:from-blue-700/80 midnight:to-indigo-800/80
           text-white flex items-center justify-center shadow-sm"
				style={{ display: "none" }}
			>
				{initial}
			</div>
		</div>
	);

	return avatarElement;
};

export default UserAvatar;
