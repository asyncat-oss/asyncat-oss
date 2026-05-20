import React, { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MoreHorizontal,
  CheckCircle,
  Paperclip,
  Siren,
  Disc3Icon,
  LifeBuoy,
  BadgeAlert,
  Check,
} from "lucide-react";
import { useCardContext } from "../../../context/viewContexts";
import { useColumnContext } from "../../../context/viewContexts";
import { useCardActions } from "../../../hooks/useCardActions";

const Card = ({ card, columnId, index, dragOverlay, zoomLevel = 90 }) => {
  const { setSelectedCard, deletingCards } = useCardContext();
  const { columns } = useColumnContext();
  const { fetchFreshCardData } = useCardActions();

  const [cardData, setCardData] = useState(card);
  const [isExiting, setIsExiting] = useState(false);

  const isDeleting = deletingCards.includes(card.id);
  const isFullyCompleted = cardData.progress === 100;

  useEffect(() => { setCardData(card); }, [card]);

  useEffect(() => {
    const currentColumn = columns.find((col) => col.id === columnId);
    const currentCard =
      currentColumn?.Cards?.find((c) => c.id === card.id) ||
      currentColumn?.cards?.find((c) => c.id === card.id);
    if (currentCard) setCardData(currentCard);
  }, [columns, columnId, card.id]);

  useEffect(() => {
    if (isDeleting && !isExiting) setIsExiting(true);
    else if (!isDeleting && isExiting) setIsExiting(false);
  }, [isDeleting, isExiting]);

  const handleCardClick = async () => {
    if (isDragging || isDeleting || isExiting) return;
    setSelectedCard(cardData);
    try {
      const freshCardData = await fetchFreshCardData(cardData.id);
      setSelectedCard(freshCardData);
    } catch {}
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", card, columnId, index },
  });

  const style = {
    transform:
      isDeleting || isExiting
        ? "scale(0.95) translateY(-10px)"
        : dragOverlay
        ? undefined
        : isDragging
        ? "rotate(2deg) scale(1.02)"
        : CSS.Transform.toString(transform),
    opacity: isDeleting || isExiting ? 0 : isDragging && !dragOverlay ? 0.5 : 1,
    height: isDeleting || isExiting ? "0" : "auto",
    margin: isDeleting || isExiting ? "0" : undefined,
    padding: isDeleting || isExiting ? "0" : undefined,
    overflow: isDeleting || isExiting ? "hidden" : undefined,
    transition:
      isDeleting || isExiting
        ? "transform 300ms, opacity 300ms, height 300ms, margin 300ms, padding 300ms"
        : dragOverlay
        ? "none"
        : transition || "transform 200ms, opacity 200ms",
    width: dragOverlay ? "18rem" : undefined,
    zIndex: isDragging && !dragOverlay ? 1 : undefined,
  };

  if (!cardData) return null;

  const getPriorityIcon = (priority) => {
    switch (priority?.toLowerCase()) {
      case "high":   return <Siren    className="w-4 h-4 text-red-400 dark:text-red-600" />;
      case "medium": return <Disc3Icon className="w-4 h-4 text-yellow-400 dark:text-yellow-600" />;
      case "low":    return <LifeBuoy  className="w-4 h-4 text-green-400 dark:text-green-600" />;
      default:       return <BadgeAlert className="w-4 h-4 text-gray-500" />;
    }
  };

  const getProgressColor = (progress) => {
    if (progress < 25) return "bg-red-400 dark:bg-red-600";
    if (progress < 50) return "bg-yellow-400 dark:bg-yellow-600";
    if (progress < 75) return "bg-blue-400 dark:bg-blue-600";
    return "bg-green-400 dark:bg-green-600";
  };

  const attachmentCount = (cardData.attachments?.length || 0) + (cardData.files?.length || 0);

  const baseClasses = [
    "p-4 rounded-xl mb-3 touch-none transition-all duration-200 search-result-card w-full max-w-sm cursor-grab",
    isFullyCompleted
      ? "bg-green-50/50 dark:bg-green-900/5 ring-2 ring-green-200 dark:ring-green-800 completed-card"
      : "bg-white dark:bg-gray-900 midnight:bg-gray-950 ring-1 ring-gray-900/5 dark:ring-white/10",
    dragOverlay
      ? "shadow-2xl ring-2 ring-blue-400/50 cursor-grabbing"
      : isDragging
      ? "shadow-lg ring-2 ring-blue-300/30"
      : "shadow-sm hover:shadow-md hover:ring-gray-900/10 dark:hover:ring-white/20",
    isDeleting || isExiting ? "pointer-events-none" : "",
  ].join(" ");

  if (isFullyCompleted) {
    return (
      <div id={`card-${card.id}`} ref={setNodeRef} {...attributes} {...listeners} className={baseClasses} style={style} onClick={handleCardClick}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500 shrink-0" />
            <h3 className="font-medium text-gray-900 dark:text-white line-clamp-1">{cardData.title}</h3>
          </div>
          <button className="p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        <div className="mb-3 px-2 py-1 text-xs rounded-md flex items-center bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <Check className="w-3 h-3 mr-1" />
          <span className="font-medium">Completed</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-1">
            {getPriorityIcon(cardData.priority)}
            <span>{cardData.priority}</span>
          </div>
          {attachmentCount > 0 && (
            <div className="flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              {attachmentCount}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id={`card-${card.id}`} ref={setNodeRef} {...attributes} {...listeners} className={baseClasses} style={style} onClick={handleCardClick}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 dark:text-white midnight:text-indigo-200 line-clamp-1">
          {cardData.title}
        </h3>
        <button className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {cardData.description && (
        <p className="mb-3 text-sm line-clamp-2 text-gray-600 dark:text-gray-300 midnight:text-gray-400">
          {cardData.description}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-600 midnight:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor(cardData.progress)} transition-all duration-300`}
            style={{ width: `${cardData.progress || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-300">Progress</span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{cardData.progress || 0}%</span>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {getPriorityIcon(cardData.priority)}
            <span>{cardData.priority}</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>{cardData.tasks?.completed || 0}/{cardData.tasks?.total || 0}</span>
          </div>
        </div>
        {attachmentCount > 0 && (
          <div className="flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            {attachmentCount}
          </div>
        )}
      </div>
    </div>
  );
};

export default Card;
