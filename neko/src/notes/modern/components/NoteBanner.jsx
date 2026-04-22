import { useState, useEffect, useMemo, useRef } from "react";
import { Image as ImageIcon, Plus, Settings, Loader, Move } from "lucide-react";
import BannerSelector from "./BannerSelector";
import { attachmentApi } from "../../attachmentApi";

const NoteBanner = ({ note, onBannerChange, isEditable = true }) => {
  const [showBannerSelector, setShowBannerSelector] = useState(false);
  const [bannerData, setBannerData] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const bannerRef = useRef(null);

  // Create stable reference for banner data
  const stableBannerData = useMemo(() => {
    return note?.metadata?.banner || null;
  }, [
    note?.id,
    note?.metadata?.banner?.filename,
    note?.metadata?.banner?.type,
  ]);

  // Sync banner data with note metadata whenever note changes
  useEffect(() => {
    setBannerData(stableBannerData);
    // Reset image loading state when banner data changes
    if (stableBannerData?.type !== "image") {
      setImageLoading(false);
    }
  }, [note?.id, stableBannerData]);

  // Handle image preloading to detect when it's ready
  useEffect(() => {
    if (bannerData?.type === "image" && bannerData.filename && imageLoading) {
      const imageUrl = attachmentApi.getAttachmentUrl(
        note.id,
        bannerData.filename
      );
      const img = new Image();

      img.onload = () => {
        setImageLoading(false);
      };

      img.onerror = () => {
        setImageLoading(false);
      };

      img.src = imageUrl;
    }
  }, [bannerData, note?.id, imageLoading]);

  const handleBannerChange = (newBanner) => {
    setBannerData(newBanner);

    // Start loading state for new image banners
    if (newBanner && newBanner.type === "image") {
      setImageLoading(true);
    }

    if (onBannerChange) {
      onBannerChange(newBanner);
    }
    setShowBannerSelector(false);
  };

  const getBannerStyle = () => {
    if (!bannerData) return {};

    switch (bannerData.type) {
      case "color":
        return { backgroundColor: bannerData.color };
      case "gradient":
        return { background: bannerData.gradient };
      case "image":
        // Always construct the URL using the attachmentApi like in the card
        const imageUrl = attachmentApi.getAttachmentUrl(
          note.id,
          bannerData.filename
        );

        // Use stored position or default to center
        const position = bannerData.position || { x: 50, y: 50 };

        return {
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: `${position.x}% ${position.y}%`,
          backgroundRepeat: "no-repeat",
        };
      default:
        return {};
    }
  };

  const handleDragStart = (e) => {
    if (!isEditable || bannerData?.type !== "image") return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      initialPosition: bannerData.position || { x: 50, y: 50 },
    });

    // Prevent text selection during drag
    e.preventDefault();
  };

  const handleDragMove = (e) => {
    if (!isDragging || !dragStart || !bannerRef.current) return;

    const rect = bannerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // Calculate percentage change based on banner dimensions
    const percentChangeX = (deltaX / rect.width) * 100;
    const percentChangeY = (deltaY / rect.height) * 100;

    // Apply changes to position
    const newX = Math.max(
      0,
      Math.min(100, dragStart.initialPosition.x + percentChangeX)
    );
    const newY = Math.max(
      0,
      Math.min(100, dragStart.initialPosition.y + percentChangeY)
    );

    // Update banner data with new position
    const updatedBanner = {
      ...bannerData,
      position: { x: newX, y: newY },
    };

    setBannerData(updatedBanner);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);
    setDragStart(null);

    // Save the final position
    if (bannerData && onBannerChange) {
      onBannerChange(bannerData);
    }
  };

  // Add event listeners for drag
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => handleDragMove(e);
      const handleMouseUp = () => handleDragEnd();

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragStart, bannerData]);

  const renderBannerContent = () => {
    if (bannerData) {
      const bannerStyle = getBannerStyle();

      // Add loading state for images
      if (bannerData.type === "image" && !bannerStyle.backgroundImage) {
        return (
          <div className="relative w-full h-32 sm:h-40 md:h-48 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse">
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 midnight:text-gray-400">
              Loading Banner...
            </div>
          </div>
        );
      }

      return (
        <div
          ref={bannerRef}
          className={`group relative w-full h-32 sm:h-40 md:h-48 transition-all duration-300 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 ${
            bannerData.type === "image" && isEditable
              ? isDragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : ""
          }`}
          style={bannerStyle}
          onMouseDown={
            bannerData.type === "image" ? handleDragStart : undefined
          }
        >
          {/* Overlay for better text readability - made lighter */}
          <div className="absolute inset-0 bg-black/5 pointer-events-none" />

          {/* Dragging overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
              <div className="bg-white/95 dark:bg-gray-800/95 midnight:bg-gray-900/95 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2">
                <Move className="w-4 h-4 text-blue-600 dark:text-blue-500 midnight:text-blue-400" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-500 midnight:text-blue-400">
                  Drag to reposition
                </span>
              </div>
            </div>
          )}

          {/* Loading indicator for images */}
          {bannerData.type === "image" && (
            <div
              className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 pointer-events-none"
              style={{ zIndex: -1 }}
            >
              <ImageIcon className="w-8 h-8" />
            </div>
          )}

          {/* Image loading overlay with blur effect */}
          {imageLoading && bannerData.type === "image" && (
            <div className="absolute inset-0 bg-gray-200/80 dark:bg-gray-700/80 midnight:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-20 pointer-events-none">
              <div className="flex flex-col items-center space-y-2">
                <Loader className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-300 midnight:text-gray-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                  Loading Banner...
                </span>
              </div>
            </div>
          )}

          {/* Banner controls (only when editable) */}
          {isEditable && (
            <div className="absolute top-3 right-3 flex gap-2 z-10">
              <button
                onClick={() => setShowBannerSelector(true)}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-900/90 hover:bg-white dark:hover:bg-gray-800 midnight:hover:bg-gray-900 rounded-lg shadow-sm transition-all duration-200 text-gray-700 dark:text-gray-400 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-white midnight:hover:text-slate-100"
                title="Change banner"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Drag hint indicator - shows when hovering on image banners */}
          {bannerData.type === "image" && isEditable && !isDragging && (
            <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <button className="p-2 bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-900/90 rounded-lg shadow-sm text-gray-700 dark:text-gray-400 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-white midnight:hover:text-slate-100">
                <Move className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      );
    }

    // No banner - show placeholder, disabling interactions when not editable
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (!isEditable) return;
            setShowBannerSelector(true);
          }}
          disabled={!isEditable}
          className={`w-full h-12 border-2 border-dashed transition-colors flex items-center justify-center text-sm font-medium ${
            isEditable
              ? "border-gray-300 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-slate-300 group"
              : "border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-gray-400 dark:text-gray-500 midnight:text-slate-500 cursor-default opacity-60"
          }`}
        >
          <Plus className="w-4 h-4 mr-2" />
          <span>Add banner</span>
        </button>
      </div>
    );
  };

  return (
    <>
      {renderBannerContent()}

      {showBannerSelector && (
        <BannerSelector
          note={note}
          currentBanner={bannerData}
          onBannerChange={handleBannerChange}
          onClose={() => setShowBannerSelector(false)}
        />
      )}
    </>
  );
};

export default NoteBanner;
