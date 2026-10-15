// The banner across the top of a note (a colour, a gradient or an image the
// user can drag into place), or a quiet "Add banner" line when there is none.

import { useState, useEffect, useMemo, useRef } from "react";
import { Image as ImageIcon, Plus, Pencil, Loader2, Move } from "lucide-react";
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
      case "image": {
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
      }
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
          <div className="relative h-32 w-full animate-pulse bg-hover sm:h-40 md:h-48">
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-fg-subtle">
              Loading banner…
            </div>
          </div>
        );
      }

      return (
        <div
          ref={bannerRef}
          className={`group relative h-32 w-full bg-hover transition-all duration-300 sm:h-40 md:h-48 ${
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
          {/* Dragging hint */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-1.5 text-[13px] font-medium text-fg shadow-sm">
                <Move className="h-3.5 w-3.5 text-fg-subtle" />
                Drag to reposition
              </div>
            </div>
          )}

          {/* Loading indicator for images */}
          {bannerData.type === "image" && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-hover text-fg-subtle"
              style={{ zIndex: -1 }}
            >
              <ImageIcon className="w-8 h-8" />
            </div>
          )}

          {/* Image loading veil */}
          {imageLoading && bannerData.type === "image" && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-canvas/70">
              <div className="flex items-center gap-2 text-[13px] text-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
                Loading banner…
              </div>
            </div>
          )}

          {/* Banner controls (only when editable) */}
          {isEditable && (
            <div className="absolute top-3 right-3 flex gap-2 z-10">
              <button
                type="button"
                onClick={() => setShowBannerSelector(true)}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-[12px] font-medium text-fg-muted opacity-0 shadow-sm outline-none transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 group-hover:opacity-100"
                title="Change banner"
              >
                <Pencil className="h-3.5 w-3.5" />
                Change banner
              </button>
            </div>
          )}

          {/* Drag hint indicator - shows when hovering on image banners */}
          {bannerData.type === "image" && isEditable && !isDragging && (
            <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <span className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-[12px] font-medium text-fg-muted shadow-sm">
                <Move className="h-3.5 w-3.5" />
                Drag to reposition
              </span>
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
          className={`flex h-10 w-full items-center justify-center gap-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
            isEditable
              ? "text-fg-subtle hover:bg-hover hover:text-fg-muted"
              : "cursor-default text-fg-subtle opacity-60"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
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
