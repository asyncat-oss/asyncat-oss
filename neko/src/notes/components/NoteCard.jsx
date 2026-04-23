import React, { useState } from "react";
import {
  FileText,
  Clock,
  Check,
  Loader,
} from "lucide-react";
import { attachmentApi } from "../attachmentApi";

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};



const NoteCard = ({
  note,
  onClick,
  isSelected,
  onToggleSelect,
  userData,
  getProfilePicture,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(true);
  const [bannerError, setBannerError] = useState(false);

  const handleClick = () => {
    onClick(note);
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onToggleSelect(note);
  };

  // Get banner data from note metadata
  const getBannerData = () => {
    try {
      if (note.metadata) {
        const metadata =
          typeof note.metadata === "string"
            ? JSON.parse(note.metadata)
            : note.metadata;
        return metadata.banner || null;
      }
    } catch (e) {
      console.error("Error parsing note metadata:", e);
    }
    return null;
  };

  const bannerData = getBannerData();

  const getBannerStyle = () => {
    if (!bannerData) return {};

    switch (bannerData.type) {
      case "color":
        return { backgroundColor: bannerData.color };
      case "gradient":
        return { background: bannerData.gradient };
      case "image":
        return {
          backgroundImage: `url(${attachmentApi.getAttachmentUrl(
            note.id,
            bannerData.filename
          )})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        };
      default:
        return {};
    }
  };

  const handleBannerLoad = () => {
    setBannerLoading(false);
  };

  const handleBannerError = () => {
    setBannerLoading(false);
    setBannerError(true);
  };

  // Preload banner image if it's an image type
  React.useEffect(() => {
    if (bannerData?.type === "image") {
      setBannerLoading(true);
      setBannerError(false);
      const img = new Image();
      img.onload = handleBannerLoad;
      img.onerror = handleBannerError;
      img.src = attachmentApi.getAttachmentUrl(note.id, bannerData.filename);
    } else {
      setBannerLoading(false);
    }
  }, [bannerData?.type, bannerData?.filename, note.id]);

  return (
    <div
      className={`relative bg-white dark:bg-gray-800 midnight:bg-slate-800 border rounded-2xl overflow-hidden
        transition-all duration-200 hover:shadow-lg dark:hover:shadow-gray-900/20 midnight:hover:shadow-indigo-900/20 cursor-pointer
        border-gray-200 dark:border-gray-700 midnight:border-slate-600 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-500
        ${
          isSelected
            ? "ring-2 ring-blue-500 dark:ring-blue-400 midnight:ring-indigo-400 border-transparent shadow-lg"
            : ""
        }
        group font-sora`}
      style={{ minHeight: "200px" }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Banner Preview */}
      <div className="h-16 w-full relative">
        {bannerData ? (
          <>
            {bannerData.type === "image" && bannerLoading && !bannerError && (
              <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 flex items-center justify-center z-10">
                <Loader className="w-6 h-6 text-blue-500 dark:text-blue-400 midnight:text-indigo-400 animate-spin" />
              </div>
            )}
            <div className="h-full w-full" style={getBannerStyle()}>
              <div className="h-full w-full bg-black/5" />{" "}
              {/* Subtle overlay */}
            </div>
          </>
        ) : (
          <div className="h-full w-full bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 flex items-center justify-center">
            <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 midnight:text-slate-600" />
          </div>
        )}
      </div>

      {/* Selection Checkbox */}
      {(isHovering || isSelected) && (
        <div
          className={`absolute top-4 right-4 w-5 h-5 rounded-md flex items-center justify-center cursor-pointer z-10 transition-all
            ${
              isSelected
                ? "bg-black dark:bg-white midnight:bg-indigo-500 text-white dark:text-black midnight:text-white"
                : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
            }`}
          onClick={handleCheckboxClick}
        >
          {isSelected && <Check className="w-3 h-3" />}
        </div>
      )}

      <div className="p-6">
        {/* Title */}
        <h3
          className="font-bold text-lg text-gray-900 dark:text-white midnight:text-slate-100 mb-4 pr-8 overflow-hidden break-words"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            textOverflow: "ellipsis",
            lineHeight: "1.5",
          }}
        >
          {note.title || "Untitled Note"}
        </h3>

        {/* Created By */}
        {userData && (
          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-2">
            {getProfilePicture &&
            getProfilePicture(userData.profile_picture) ? (
              <div className="w-5 h-5 min-w-[20px] min-h-[20px] max-w-[20px] max-h-[20px] rounded-full overflow-hidden flex-shrink-0 mr-2">
                <img
                  src={getProfilePicture(userData.profile_picture)}
                  alt={userData.name || "User"}
                  className="w-5 h-5 min-w-[20px] min-h-[20px] max-w-[20px] max-h-[20px] object-cover block"
                  style={{ width: "20px", height: "20px" }}
                />
              </div>
            ) : (
              <div className="w-5 h-5 min-w-[20px] min-h-[20px] max-w-[20px] max-h-[20px] rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 dark:bg-indigo-900 midnight:bg-indigo-800 flex items-center justify-center mr-2">
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-300 midnight:text-indigo-200">
                  {(userData.name || "U")[0].toUpperCase()}
                </span>
              </div>
            )}
            <span className="truncate">{userData.name || "Unknown"}</span>
          </div>
        )}

        {/* Last Modified */}
        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-auto">
          <Clock className="w-3.5 h-3.5 mr-2" />
          <span>{formatDate(note.updatedAt || note.updatedat)}</span>
        </div>
      </div>

      {/* Hover Effect Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-gray-50/50 dark:to-gray-800/50 midnight:to-indigo-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl pointer-events-none" />
    </div>
  );
};

export default NoteCard;
