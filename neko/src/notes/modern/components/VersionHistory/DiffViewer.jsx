// DiffViewer.jsx - Google Docs style diff viewer with inline changes and user attribution
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RotateCcw,
  SquareX,
  SquareChevronUp,
  SquareChevronDown,
  FlipHorizontal2,
  Loader,
  MapPinCheckInside,
  MapPinXInside,
} from "lucide-react";
import {
  diff,
  DIFF_INSERT,
  DIFF_DELETE,
  DIFF_EQUAL,
  calculateSimilarity,
} from "./utils/textDiff";
import { getUserColor } from "./utils/userColors";
import Block from "../Block";
import ChartDiffSummary from "./ChartDiffSummary";
import "./DiffViewer.css";

// Import stock profile pictures
import catDP from "../../../../assets/dp/CAT.webp";
import dogDP from "../../../../assets/dp/DOG.webp";
import dolphinDP from "../../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../../assets/dp/FOX.webp";
import lionDP from "../../../../assets/dp/LION.webp";
import owlDP from "../../../../assets/dp/OWL.webp";
import penguinDP from "../../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../../assets/dp/WOLF.webp";

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

const DEFAULT_CONTRIBUTOR = { name: "Unknown User", profile_picture: "" };

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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const INITIAL_HOVER_TOOLTIP_STATE = {
  visible: false,
  x: 0,
  y: 0,
  userName: "",
  userPic: "",
  userColor: "",
};

const BLOCK_TYPE_LABELS = {
  text: "Text",
  heading1: "H1",
  heading2: "H2",
  heading3: "H3",
  numberedList: "Numbered",
  bulletList: "Bullet",
  todo: "Todo",
  quote: "Quote",
  table: "Table",
  code: "Code",
  divider: "Divider",
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
  callout: "Callout",
  toggle: "Toggle",
  embed: "Embed",
  math: "Math",
  linkPreview: "Link",
  lineChart: "Line Chart",
  barChart: "Bar Chart",
  pieChart: "Pie Chart",
  areaChart: "Area Chart",
  scatterChart: "Scatter Chart",
  donutChart: "Donut Chart",
  progressBar: "Progress Bar",
  breadcrumb: "Breadcrumb",
  button: "Button",
};

// Unique prefixes for moved block identifiers (avoids conflicts)
const BLOCK_TYPE_PREFIXES = {
  text: "TX",
  heading1: "HD1",
  heading2: "HD2",
  heading3: "HD3",
  numberedList: "NUM",
  bulletList: "BUL",
  todo: "TD",
  quote: "QT",
  table: "TBL",
  code: "CD",
  divider: "DIV",
  image: "IMG",
  video: "VID",
  audio: "AUD",
  file: "FL",
  callout: "CL",
  toggle: "TG",
  embed: "EB",
  math: "MT",
  linkPreview: "LNK",
  lineChart: "LC",
  barChart: "BC",
  pieChart: "PC",
  areaChart: "AC",
  scatterChart: "SC",
  donutChart: "DC",
  progressBar: "PB",
  breadcrumb: "BR",
  button: "BTN",
};

const DiffViewer = ({
  noteId,
  oldBlocks = [],
  newBlocks = [],
  oldTitle = "",
  newTitle = "",
  onClose,
  onRestore,
  versionId,
  versionData,
  headerHeight = 96,
  versionUser = null,
  isLoading = false,
  restoringVersionId = null, // Shared restoring state from parent
}) => {
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [blocksWithDiffs, setBlocksWithDiffs] = useState([]);
  const [titleDiffHtml, setTitleDiffHtml] = useState("");
  const [hasTitleChange, setHasTitleChange] = useState(false);
  const changeRefs = useRef([]);
  const [topOffset, setTopOffset] = useState(headerHeight);
  const [hoverTooltip, setHoverTooltip] = useState(() => ({
    ...INITIAL_HOVER_TOOLTIP_STATE,
  }));
  const diffViewerRef = useRef(null);

  const getBlockTypeLabel = useCallback((type) => {
    if (!type) return "Text";
    return BLOCK_TYPE_LABELS[type] || "Text";
  }, []);

  const renderBlockTypeLabel = useCallback(
    ({ label, variant = "default", previousLabel = null }) => {
      if (!label) return null;
      const modifier =
        variant !== "default" ? ` diff-block-type-label--${variant}` : "";
      const title =
        previousLabel && previousLabel !== label
          ? `Previously ${previousLabel}`
          : undefined;

      return (
        <div
          className={`diff-block-type-label${modifier}`}
          title={title}
          aria-hidden="true"
        >
          <span className="diff-block-type-label__text">{label}</span>
        </div>
      );
    },
    []
  );

  useEffect(() => {
    // Refresh image URLs with current tokens before processing
    const refreshImageUrls = async (blocks) => {
      if (!blocks || !Array.isArray(blocks) || !noteId) return blocks;

      // Dynamically import attachmentsApi to avoid circular dependencies
      const { attachmentsApi } = await import("../../../noteApi");

      return blocks.map((block) => {
        if ((block.type === "image" || block.type === "video" || block.type === "audio") && block.properties?.filename) {
          // Generate fresh URL with current token
          const freshUrl = attachmentsApi.getAttachmentUrl(
            noteId,
            block.properties.filename
          );

          return {
            ...block,
            properties: {
              ...block.properties,
              url: freshUrl,
            },
          };
        }
        return block;
      });
    };

    // Refresh URLs in processed blocks (including nested oldBlock)
    const refreshProcessedBlocks = async (blocks) => {
      if (!blocks || !Array.isArray(blocks) || !noteId) return blocks;

      const { attachmentsApi } = await import("../../../noteApi");

      return blocks.map((block) => {
        let updatedBlock = { ...block };

        // Refresh URL in main block if it's an image, video, or audio
        if ((block.type === "image" || block.type === "video" || block.type === "audio") && block.properties?.filename) {
          const freshUrl = attachmentsApi.getAttachmentUrl(
            noteId,
            block.properties.filename
          );
          updatedBlock = {
            ...updatedBlock,
            properties: {
              ...updatedBlock.properties,
              url: freshUrl,
            },
          };
        }

        // Refresh URL in oldBlock if it exists and is an image, video, or audio
        if (
          (block.oldBlock?.type === "image" || block.oldBlock?.type === "video" || block.oldBlock?.type === "audio") &&
          block.oldBlock.properties?.filename
        ) {
          const freshUrl = attachmentsApi.getAttachmentUrl(
            noteId,
            block.oldBlock.properties.filename
          );
          updatedBlock = {
            ...updatedBlock,
            oldBlock: {
              ...updatedBlock.oldBlock,
              properties: {
                ...updatedBlock.oldBlock.properties,
                url: freshUrl,
              },
            },
          };
        }

        return updatedBlock;
      });
    };

    // Process blocks with refreshed image URLs
    Promise.all([refreshImageUrls(oldBlocks), refreshImageUrls(newBlocks)])
      .then(([refreshedOldBlocks, refreshedNewBlocks]) => {
        const processedBlocks = compareAndCreateInlineDiffs(
          refreshedOldBlocks,
          refreshedNewBlocks
        );
        // Refresh URLs again after processing to handle any oldBlock properties
        return refreshProcessedBlocks(processedBlocks);
      })
      .then((finalBlocks) => {
        setBlocksWithDiffs(finalBlocks);
        setCurrentChangeIndex(0);
      });
  }, [oldBlocks, newBlocks, noteId]);

  const titleChangeUserName =
    versionUser?.name || versionData?.user?.name || "Unknown User";
  const titleChangeUserProfilePicture =
    versionUser?.profilePicture || versionData?.user?.profilePicture || "";

  useEffect(() => {
    // Process title changes
    if (oldTitle !== newTitle) {
      setHasTitleChange(true);
      const titleDiff = createSmartDiffHTML(
        oldTitle,
        newTitle,
        titleChangeUserName,
        titleChangeUserProfilePicture,
        false
      );
      setTitleDiffHtml(titleDiff);
      setHoverTooltip({ ...INITIAL_HOVER_TOOLTIP_STATE });
    } else {
      setHasTitleChange(false);
      setTitleDiffHtml("");
      setHoverTooltip({ ...INITIAL_HOVER_TOOLTIP_STATE });
    }
  }, [oldTitle, newTitle, titleChangeUserName, titleChangeUserProfilePicture]);

  // Dynamically measure offset from top and left
  const [leftOffset, setLeftOffset] = useState(280);
  const [viewerWidth, setViewerWidth] = useState("auto");

  useEffect(() => {
    const measureOffsets = () => {
      // Find the max-w-5xl container inside ModernBlockEditor
      const editorContainer = document.querySelector(
        ".max-w-5xl.mx-auto.px-8.py-16.pb-24"
      );
      if (editorContainer) {
        const rect = editorContainer.getBoundingClientRect();
        // Match the editor position and width exactly
        setLeftOffset(rect.left);
        setTopOffset(rect.top + window.scrollY);
        // Set width to exactly match the editor container
        setViewerWidth(`${rect.width}px`);
      } else {
        // Fallback
        setLeftOffset(280);
        setTopOffset(headerHeight + 192); // header + typical banner height
        setViewerWidth("calc(100% - 280px)");
      }
    };

    // Small delay to ensure DOM is ready
    setTimeout(measureOffsets, 100);

    // Re-measure on window resize and scroll
    window.addEventListener("resize", measureOffsets);
    window.addEventListener("scroll", measureOffsets);
    return () => {
      window.removeEventListener("resize", measureOffsets);
      window.removeEventListener("scroll", measureOffsets);
    };
  }, [headerHeight]);

  // Add tooltips to diff spans and structured blocks after render
  useEffect(() => {
    const attachTooltips = () => {
      // Select both text diffs, structured block diffs, and added/deleted blocks
      const diffElements = document.querySelectorAll(
        ".diff-structured-deleted, .diff-structured-added, .diff-deleted-block, .diff-added-block"
      );

      diffElements.forEach((element) => {
        // Remove existing tooltip if any
        const existingTooltip = element.querySelector(".diff-user-tooltip");
        if (existingTooltip) {
          existingTooltip.remove();
        }

        const userName = element.getAttribute("data-user");
        const userPic = element.getAttribute("data-user-pic");
        const userColor = element.getAttribute("data-user-color");

        if (userName) {
          const tooltip = document.createElement("div");
          tooltip.className = "diff-user-tooltip";
          tooltip.style.backgroundColor = userColor;

          // Add profile picture or initial
          if (userPic) {
            const img = document.createElement("img");
            img.src = getProfilePicture(userPic) || userPic;
            img.alt = userName;
            img.className = "tooltip-profile-pic";
            tooltip.appendChild(img);
          } else {
            const initial = document.createElement("div");
            initial.className = "tooltip-profile-initial";
            initial.textContent = userName.charAt(0).toUpperCase();
            tooltip.appendChild(initial);
          }

          // Add user name
          const nameSpan = document.createElement("span");
          nameSpan.textContent = userName;
          nameSpan.className = "tooltip-user-name";
          tooltip.appendChild(nameSpan);

          element.appendChild(tooltip);
        }
      });
    };

    // Attach tooltips after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(attachTooltips, 100);
    return () => clearTimeout(timeoutId);
  }, [
    blocksWithDiffs,
    titleDiffHtml,
    hasTitleChange,
    leftOffset,
    topOffset,
    viewerWidth,
    currentChangeIndex,
  ]);

  useEffect(() => {
    if (!hasTitleChange) {
      changeRefs.current[0] = null;
      setHoverTooltip({ ...INITIAL_HOVER_TOOLTIP_STATE });
    }
  }, [hasTitleChange]);

  // Handler to close diff viewer with scroll-to-top
  const handleCloseDiff = useCallback(() => {
    if (onClose) {
      onClose();
      // Scroll editor container to top immediately after closing
      setTimeout(() => {
        const editorContainer = document.querySelector(".editor-fullscreen");
        if (editorContainer) {
          editorContainer.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 0);
    }
  }, [onClose]);

  // Handle ESC key to close diff viewer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleCloseDiff();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseDiff]);

  const updateHoverTooltipFromEvent = useCallback(
    (event) => {
      if (isLoading) {
        setHoverTooltip((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      const viewer = diffViewerRef.current;
      if (!viewer) return;

      let targetElement =
        event.target instanceof HTMLElement
          ? event.target.closest(
              ".diff-inline-insert, .diff-inline-delete, .diff-structured-added, .diff-structured-deleted, .diff-added-block, .diff-deleted-block"
            )
          : null;

      if (!targetElement && typeof document !== "undefined") {
        const hovered = document.elementFromPoint(event.clientX, event.clientY);
        if (hovered instanceof HTMLElement) {
          targetElement = hovered.closest(
            ".diff-inline-insert, .diff-inline-delete, .diff-structured-added, .diff-structured-deleted, .diff-added-block, .diff-deleted-block"
          );
        }
      }

      if (!targetElement) {
        setHoverTooltip((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      const viewerRect = viewer.getBoundingClientRect();
      const x = clamp(
        event.clientX - viewerRect.left,
        16,
        Math.max(viewerRect.width - 16, 16)
      );
      const y = clamp(
        event.clientY - viewerRect.top - 24,
        8,
        Math.max(viewerRect.height - 24, 8)
      );

      const isTitleArea = Boolean(
        targetElement.closest(".diff-title-container")
      );

      const userName =
        targetElement.getAttribute("data-user") ||
        (isTitleArea ? titleChangeUserName : "") ||
        "Unknown User";

      const rawUserPic = targetElement.getAttribute("data-user-pic");
      const userPic = rawUserPic
        ? rawUserPic
        : isTitleArea
        ? titleChangeUserProfilePicture || ""
        : "";

      const userColorAttr = targetElement.getAttribute("data-user-color");
      const userColor =
        userColorAttr && userColorAttr.trim().length > 0
          ? userColorAttr
          : getUserColor(userName).main;

      setHoverTooltip((prev) => {
        if (
          prev.visible &&
          Math.abs(prev.x - x) < 0.5 &&
          Math.abs(prev.y - y) < 0.5 &&
          prev.userName === userName &&
          prev.userPic === userPic &&
          prev.userColor === userColor
        ) {
          return prev;
        }

        return {
          visible: true,
          x,
          y,
          userName,
          userPic,
          userColor,
        };
      });
    },
    [isLoading, titleChangeUserName, titleChangeUserProfilePicture]
  );

  const handleHoverMouseEnter = useCallback(
    (event) => {
      updateHoverTooltipFromEvent(event);
    },
    [updateHoverTooltipFromEvent]
  );

  const handleHoverMouseMove = useCallback(
    (event) => {
      updateHoverTooltipFromEvent(event);
    },
    [updateHoverTooltipFromEvent]
  );

  const handleHoverMouseLeave = useCallback(() => {
    setHoverTooltip((prev) =>
      prev.visible ? { ...prev, visible: false } : prev
    );
  }, []);

  const titleChangeRef = useCallback(
    (el) => {
      if (hasTitleChange) {
        changeRefs.current[0] = el || null;
      }
    },
    [hasTitleChange]
  );

  // Block types that have structured data instead of simple text content
  const STRUCTURED_BLOCK_TYPES = [
    "table",
    "lineChart",
    "barChart",
    "pieChart",
    "areaChart",
    "scatterChart",
    "donutChart",
    "bullet_list",
    "numbered_list",
    "todo",
    "code",
    "callout",
    "toggle",
    "embed",
    "math",
    "link_preview",
    "progress_bar",
    "breadcrumb",
    "button",
    "image",
    "video",
    "audio",
  ];

  // Compare blocks and create inline diffs (show new content with old strikethrough)
  const compareAndCreateInlineDiffs = (oldBlocks, newBlocks) => {
    const results = [];

    const getBlockContributors = (block) => {
      if (!block) {
        return [DEFAULT_CONTRIBUTOR];
      }

      const contributorsSource = Array.isArray(block.__contributors)
        ? block.__contributors
        : [];

      const fallbackName =
        block?.updated_by || block?.created_by || DEFAULT_CONTRIBUTOR.name;
      const fallbackPicture =
        block?.user_profile_picture ||
        block?.updated_by_profile_picture ||
        block?.created_by_profile_picture ||
        "";

      const combined = contributorsSource
        .filter(Boolean)
        .map((contributor) => ({
          name: contributor?.name || DEFAULT_CONTRIBUTOR.name,
          profile_picture: contributor?.profile_picture || "",
        }));

      if (
        fallbackName &&
        !combined.some((contributor) => contributor.name === fallbackName)
      ) {
        combined.push({
          name: fallbackName,
          profile_picture: fallbackPicture,
        });
      }

      if (combined.length === 0) {
        combined.push({ ...DEFAULT_CONTRIBUTOR });
      }

      const seen = new Set();
      return combined.filter((contributor) => {
        const key = `${contributor.name}|${contributor.profile_picture || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const buildChangeInfo = (block, overrides = {}) => {
      const contributors = getBlockContributors(block);

      let primary =
        contributors.find(
          (contributor) => contributor.name !== DEFAULT_CONTRIBUTOR.name
        ) || contributors[contributors.length - 1] || DEFAULT_CONTRIBUTOR;

      if (
        overrides.user &&
        overrides.user !== DEFAULT_CONTRIBUTOR.name &&
        overrides.user !== "Unknown User"
      ) {
        primary = {
          name: overrides.user,
          profile_picture: overrides.userProfilePicture || "",
        };
        if (
          !contributors.some(
            (contributor) => contributor.name === primary.name
          )
        ) {
          contributors.push(primary);
        }
      }

      const userName =
        overrides.user ||
        primary?.name ||
        block?.updated_by ||
        block?.created_by ||
        DEFAULT_CONTRIBUTOR.name;
      const userProfilePicture =
        overrides.userProfilePicture ||
        primary?.profile_picture ||
        block?.user_profile_picture ||
        block?.updated_by_profile_picture ||
        block?.created_by_profile_picture ||
        "";

      return {
        ...overrides,
        user: userName,
        userProfilePicture,
        contributors,
      };
    };

    // Create maps for efficient lookup with positions
    const newBlocksById = new Map();
    newBlocks.forEach((block, index) => {
      if (block?.id) {
        newBlocksById.set(block.id, { block, position: index });
      }
    });

    const oldBlocksById = new Map();
    oldBlocks.forEach((block, index) => {
      if (block?.id) {
        oldBlocksById.set(block.id, { block, position: index });
      }
    });

    // Track which blocks have been processed
    const processedNewBlockIds = new Set();
    const processedOldBlockIds = new Set();

    // Track block movements using operation history if available
    const movedBlocks = new Map(); // blockId -> { oldPos, newPos, block }

    // Track ALL blocks that changed position (for identifying shifts)
    const positionChangedBlocks = new Set();
    oldBlocks.forEach((oldBlock, oldIndex) => {
      if (oldBlock?.id && newBlocksById.has(oldBlock.id)) {
        const newIndex = newBlocksById.get(oldBlock.id).position;
        if (oldIndex !== newIndex) {
          positionChangedBlocks.add(oldBlock.id);
        }
      }
    });

    // First, try to use operation history if available (most accurate)
    const operations = Array.isArray(versionData?.operations)
      ? versionData.operations
      : [];
    const moveOperations = operations.filter(
      (op) =>
        op.operation_type === "move_block" ||
        op.metadata?.operation_data?.type === "move_block"
    );

    if (moveOperations.length > 0) {
      // Use the actual MOVE_BLOCK operations from delta tracking
      // IMPORTANT: Operations only track the blocks that were explicitly moved by the user,
      // NOT the blocks that shifted position as a side effect.
      // We need to mark ONLY the explicitly moved blocks, not the shifted ones.

      moveOperations.forEach((op) => {
        const blockId = op.block_id || op.metadata?.operation_data?.blockId;
        const fromPos = op.metadata?.operation_data?.fromPosition;
        const toPos = op.metadata?.operation_data?.toPosition;

        if (blockId != null && fromPos != null && toPos != null) {
          const newData = newBlocksById.get(blockId);
          if (newData) {
            movedBlocks.set(blockId, {
              oldPos: fromPos,
              newPos: toPos,
              block: newData.block,
            });
          }
        }
      });
    } else {
      // Fallback to heuristic if no operation history available
      // Check if this is a pure reorder (no blocks added or deleted)
      const oldIds = new Set(oldBlocks.filter((b) => b?.id).map((b) => b.id));
      const newIds = new Set(newBlocks.filter((b) => b?.id).map((b) => b.id));
      const sameBlockSet =
        oldIds.size === newIds.size &&
        [...oldIds].every((id) => newIds.has(id));

      // Only detect moves if it's a pure reorder (same set of blocks)
      if (sameBlockSet) {
        // Find ALL blocks that changed position
        const positionChanges = [];
        oldBlocks.forEach((oldBlock, oldIndex) => {
          if (!oldBlock?.id) return;

          const newData = newBlocksById.get(oldBlock.id);
          if (!newData) return;

          const { block: newBlock, position: newIndex } = newData;

          // Check if content changed
          const contentChanged = hasBlockChanged(oldBlock, newBlock);

          // If position changed but content didn't, it's a candidate
          if (oldIndex !== newIndex && !contentChanged) {
            positionChanges.push({
              blockId: oldBlock.id,
              oldPos: oldIndex,
              newPos: newIndex,
              distance: Math.abs(newIndex - oldIndex),
              block: newBlock,
            });
          }
        });

        // Improved heuristic: Mark blocks that moved more than 1 position as "moved"
        // Blocks that only shifted by 1 position are likely just side effects
        if (positionChanges.length > 0) {
          // Sort by distance to identify intentional moves
          const sortedChanges = [...positionChanges].sort(
            (a, b) => b.distance - a.distance
          );

          // Mark blocks that moved more than 1 position OR are among the top movers
          const significantMoves = positionChanges.filter((pc) => {
            // If a block moved more than 1 position, it was likely intentionally moved
            return pc.distance > 1;
          });

          // If no blocks moved more than 1 position, fall back to maximum distance
          const blocksToMark =
            significantMoves.length > 0
              ? significantMoves
              : sortedChanges.filter(
                  (pc) => pc.distance === sortedChanges[0].distance
                );

          blocksToMark.forEach((pc) => {
            movedBlocks.set(pc.blockId, {
              oldPos: pc.oldPos,
              newPos: pc.newPos,
              block: pc.block,
            });
          });
        }
      }
    }

    // Process blocks in order from oldBlocks to maintain position
    let newBlockIndex = 0;

    for (let oldIndex = 0; oldIndex < oldBlocks.length; oldIndex++) {
      const oldBlock = oldBlocks[oldIndex];

      if (!oldBlock?.id) continue;

      // Check if this block was moved
      const moveInfo = movedBlocks.get(oldBlock.id);
      if (moveInfo) {
        // This block was moved - show "moved-from" indicator at old position
        results.push({
          ...oldBlock,
          diffType: "moved-from",
          movedTo: moveInfo.newPos,
          changeInfo: buildChangeInfo(oldBlock, {
            type: "moved",
            fromPosition: moveInfo.oldPos,
            toPosition: moveInfo.newPos,
          }),
        });
        processedOldBlockIds.add(oldBlock.id);
        // Don't mark as processed in new blocks yet - we'll handle that when we reach the new position
        continue;
      }

      // Check if this old block exists in new blocks
      const newBlockData = newBlocksById.get(oldBlock.id);
      const newBlock = newBlockData?.block;

      if (newBlock) {
        // Block exists in both - mark as processed
        processedOldBlockIds.add(oldBlock.id);
        processedNewBlockIds.add(newBlock.id);

        // Check for any new blocks that should come before this one
        while (newBlockIndex < newBlocks.length) {
          const currentNewBlock = newBlocks[newBlockIndex];

          if (currentNewBlock?.id === newBlock.id) {
            // We've reached the matching block
            break;
          }

          if (!processedNewBlockIds.has(currentNewBlock?.id)) {
            // Check if this is a moved block at its new position
            const moveInfo = movedBlocks.get(currentNewBlock.id);
            if (moveInfo) {
              // Show "moved-to" indicator (explicitly moved by user)
              processedNewBlockIds.add(currentNewBlock.id);
              results.push({
                ...currentNewBlock,
                diffType: "moved-to",
                movedFrom: moveInfo.oldPos,
                changeInfo: buildChangeInfo(currentNewBlock, {
                  type: "moved",
                  fromPosition: moveInfo.oldPos,
                  toPosition: moveInfo.newPos,
                }),
              });
            } else if (positionChangedBlocks.has(currentNewBlock.id)) {
              // Block changed position but not explicitly moved - it was shifted
              // Don't process it here, skip to the next block
              // It will be processed as "unchanged" when we get to it in oldBlocks loop
              newBlockIndex++;
              continue;
            } else {
              // Block doesn't exist in oldBlocks - this is a genuinely new block
              processedNewBlockIds.add(currentNewBlock.id);
              results.push({
                ...currentNewBlock,
                diffType: "added",
                changeInfo: buildChangeInfo(currentNewBlock, {
                  type: "added",
                }),
              });
            }
          }
          newBlockIndex++;
        }

        // For block type changes, show side-by-side with double lines
        if (newBlock.type !== oldBlock.type) {
        const userName =
          newBlock.updated_by || newBlock.created_by || "Unknown User";
        const userProfilePicture = newBlock.user_profile_picture || "";

        results.push({
          ...newBlock,
          diffType: "modified",
          oldBlock: oldBlock,
          isBlockTypeChange: true, // Flag to distinguish block type changes
          changeInfo: buildChangeInfo(newBlock, {
            type: "modified",
            user: userName,
            userProfilePicture,
            oldType: oldBlock.type,
            newType: newBlock.type,
          }),
        });

          newBlockIndex++;
          continue;
        }

        // Now process the matched block
        const isStructuredBlock =
          STRUCTURED_BLOCK_TYPES.includes(newBlock.type) ||
          STRUCTURED_BLOCK_TYPES.includes(oldBlock.type);

        // Check if only formatting changed (text is the same, but HTML tags differ)
        const oldTextContent = stripHTML(oldBlock.content || "");
        const newTextContent = stripHTML(newBlock.content || "");
        const oldContentHTML = normalizeHTML(oldBlock.content || "");
        const newContentHTML = normalizeHTML(newBlock.content || "");

        const textUnchanged = oldTextContent.trim() === newTextContent.trim();
        const formattingChanged = oldContentHTML !== newContentHTML;
        const isFormattingOnlyChange = textUnchanged && formattingChanged;

        // Special handling for TODO blocks: check if only text changed or checkbox also changed
        if (newBlock.type === "todo" && oldBlock.type === "todo") {
          const oldChecked = oldBlock.properties?.checked || false;
          const newChecked = newBlock.properties?.checked || false;
          const checkboxChanged = oldChecked !== newChecked;

          const textChanged = !textUnchanged;

          if (checkboxChanged || isFormattingOnlyChange) {
            // Checkbox state changed OR formatting-only change: use structured block display (show both old and new)
            const userName =
              newBlock.updated_by || newBlock.created_by || "Unknown User";
            const userProfilePicture = newBlock.user_profile_picture || "";

            results.push({
              ...newBlock,
              diffType: "modified",
              oldBlock: oldBlock,
              changeInfo: buildChangeInfo(newBlock, {
                type: "modified",
                user: userName,
                userProfilePicture,
              }),
            });
          } else if (textChanged) {
            // Only text changed: use inline diff display with preserved formatting
            const userName =
              newBlock.updated_by || newBlock.created_by || "Unknown User";
            const userProfilePicture = newBlock.user_profile_picture || "";
            const inlineDiffHTML = createFormattedDiffHTML(
              oldBlock.content || "",
              newBlock.content || "",
              userName,
              userProfilePicture
            );

            results.push({
              ...newBlock,
              content: inlineDiffHTML,
              diffType: "modified",
              originalContent: newBlock.content,
              changeInfo: buildChangeInfo(newBlock, {
                type: "modified",
                user: userName,
                userProfilePicture,
                oldType: oldBlock.type,
                newType: newBlock.type,
              }),
            });
          } else {
            // No changes
            results.push({
              ...newBlock,
              diffType: "unchanged",
            });
          }
        } else if (isStructuredBlock) {
          const blocksAreDifferent = hasBlockChanged(oldBlock, newBlock);

          if (blocksAreDifferent) {
            const userName =
              newBlock.updated_by || newBlock.created_by || "Unknown User";
            const userProfilePicture = newBlock.user_profile_picture || "";

            results.push({
              ...newBlock,
              diffType: "modified",
              oldBlock: oldBlock,
              changeInfo: buildChangeInfo(newBlock, {
                type: "modified",
                user: userName,
                userProfilePicture,
              }),
            });
          } else {
            results.push({
              ...newBlock,
              diffType: "unchanged",
            });
          }
        } else {
          // For regular text blocks, check if only formatting changed
          if (isFormattingOnlyChange && !isStructuredBlock) {
            // Formatting-only change: show old block vs new block (like todo checkbox)
            const userName =
              newBlock.updated_by || newBlock.created_by || "Unknown User";
            const userProfilePicture = newBlock.user_profile_picture || "";

            results.push({
              ...newBlock,
              diffType: "modified",
              oldBlock: oldBlock,
              isFormattingChange: true, // Flag to distinguish from TODO changes
              changeInfo: buildChangeInfo(newBlock, {
                type: "modified",
                user: userName,
                userProfilePicture,
              }),
            });
          } else if (
            oldContentHTML !== newContentHTML ||
            oldBlock.type !== newBlock.type
          ) {
            // Text content changed: use inline diff display with preserved formatting
            const userName =
              newBlock.updated_by || newBlock.created_by || "Unknown User";
            const userProfilePicture = newBlock.user_profile_picture || "";
            const inlineDiffHTML = createFormattedDiffHTML(
              oldBlock.content || "",
              newBlock.content || "",
              userName,
              userProfilePicture
            );

            results.push({
              ...newBlock,
              content: inlineDiffHTML,
              diffType: "modified",
              originalContent: newBlock.content,
              changeInfo: buildChangeInfo(newBlock, {
                type: "modified",
                user: userName,
                userProfilePicture,
                oldType: oldBlock.type,
                newType: newBlock.type,
              }),
            });
          } else {
            results.push({
              ...newBlock,
              diffType: "unchanged",
            });
          }
        }

        newBlockIndex++;
      } else {
        // Block was deleted - show it in its original position
        processedOldBlockIds.add(oldBlock.id);
        results.push({
          ...oldBlock,
          diffType: "deleted",
          changeInfo: buildChangeInfo(oldBlock, {
            type: "deleted",
          }),
        });
      }
    }

    // Add any remaining new blocks at the end
    while (newBlockIndex < newBlocks.length) {
      const currentNewBlock = newBlocks[newBlockIndex];

      if (!processedNewBlockIds.has(currentNewBlock?.id)) {
        // Check if this is a moved block at its new position
        const moveInfo = movedBlocks.get(currentNewBlock.id);
        if (moveInfo) {
          // Show "moved-to" indicator
          processedNewBlockIds.add(currentNewBlock.id);
          results.push({
            ...currentNewBlock,
            diffType: "moved-to",
            movedFrom: moveInfo.oldPos,
            changeInfo: buildChangeInfo(currentNewBlock, {
              type: "moved",
              fromPosition: moveInfo.oldPos,
              toPosition: moveInfo.newPos,
            }),
          });
        } else {
          processedNewBlockIds.add(currentNewBlock.id);
          results.push({
            ...currentNewBlock,
            diffType: "added",
            changeInfo: buildChangeInfo(currentNewBlock, {
              type: "added",
            }),
          });
        }
      }
      newBlockIndex++;
    }

    return results;
  };

  // Check if a block has changed by comparing its data
  const hasBlockChanged = (oldBlock, newBlock) => {
    // Type change always means changed
    if (oldBlock.type !== newBlock.type) return true;

    // Compare data field for structured blocks
    if (oldBlock.data || newBlock.data) {
      const oldData = JSON.stringify(oldBlock.data || {});
      const newData = JSON.stringify(newBlock.data || {});
      if (oldData !== newData) return true;
    }

    // Compare content
    if (oldBlock.content !== newBlock.content) return true;

    // Compare properties (includes TODO checkbox state)
    if (
      JSON.stringify(oldBlock.properties || {}) !==
      JSON.stringify(newBlock.properties || {})
    )
      return true;

    // Compare metadata
    if (
      JSON.stringify(oldBlock.metadata || {}) !==
      JSON.stringify(newBlock.metadata || {})
    )
      return true;

    return false;
  };

  // Strip HTML tags but preserve text content
  const stripHTML = (html) => {
    if (!html || typeof html !== "string") return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  // Get normalized HTML for comparison (keeps formatting tags)
  const normalizeHTML = (html) => {
    if (!html || typeof html !== "string") return "";
    // Remove only structural tags but keep formatting tags like strong, em, u, mark, etc.
    return html
      .replace(/<br\s*\/?>/gi, "\n") // Convert br to newlines
      .replace(/&nbsp;/g, " ") // Convert nbsp to spaces
      .trim();
  };

  const getSafeUserName = (name) => {
    if (!name || typeof name !== "string" || !name.trim()) {
      return "Unknown User";
    }
    return name;
  };

  const createDiffTooltipHTML = (userName, userProfilePicture, userColor) => {
    if (!userName) return "";

    const safeName = escapeHTML(userName);
    const safeInitial = escapeHTML(userName.charAt(0).toUpperCase());
    let avatarHTML = "";

    if (userProfilePicture) {
      const safePic = escapeHTML(userProfilePicture);
      avatarHTML = `<img src="${safePic}" alt="${safeName}" class="tooltip-profile-pic" />`;
    } else {
      avatarHTML = `<div class="tooltip-profile-initial">${safeInitial}</div>`;
    }

    return `<div class="diff-user-tooltip diff-user-tooltip-inline" style="background-color: ${userColor.main};">${avatarHTML}<span class="tooltip-user-name">${safeName}</span></div>`;
  };

  const createDiffSpan = (
    type,
    text,
    userName,
    userProfilePicture,
    userColor,
    includeTooltip = true
  ) => {
    if (!text) return "";

    const safeText = escapeHTML(text);
    const safeUserNameAttr = escapeHTML(userName || "");
    const safeUserPicAttr = escapeHTML(userProfilePicture || "");
    const tooltipHTML = includeTooltip
      ? createDiffTooltipHTML(userName, userProfilePicture, userColor)
      : "";

    if (type === "delete") {
      return `<span class="diff-inline-delete" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; --strikethrough-color: ${userColor.main};">${safeText}${tooltipHTML}</span>`;
    }

    return `<span class="diff-inline-insert" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; background-color: ${userColor.light};">${safeText}${tooltipHTML}</span>`;
  };

  // Create inline diff HTML showing deletions (strikethrough) and insertions (highlighted)
  // Each change is color-coded by user
  // IMPORTANT: Always show deletions before insertions
  const createInlineDiffHTML = (
    diffs,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    let html = "";
    const safeUserName = getSafeUserName(userName);
    const userColor = getUserColor(safeUserName);
    const userPic =
      getProfilePicture(userProfilePicture) || userProfilePicture || "";

    // Group consecutive DELETE and INSERT operations to ensure DELETE always comes first
    let i = 0;
    while (i < diffs.length) {
      const [op, text] = diffs[i];

      if (op === DIFF_EQUAL) {
        html += escapeHTML(text);
        i++;
      } else if (op === DIFF_DELETE) {
        // Check if next is INSERT - if so, show DELETE first, then INSERT
        const deletions = [];
        const insertions = [];

        // Collect all consecutive DELETE operations
        while (i < diffs.length && diffs[i][0] === DIFF_DELETE) {
          deletions.push(diffs[i][1]);
          i++;
        }

        // Collect all consecutive INSERT operations
        while (i < diffs.length && diffs[i][0] === DIFF_INSERT) {
          insertions.push(diffs[i][1]);
          i++;
        }

        // Show deletions first
        if (deletions.length > 0) {
          html += createDiffSpan(
            "delete",
            deletions.join(""),
            safeUserName,
            userPic,
            userColor,
            includeTooltip
          );
        }

        // Then show insertions
        if (insertions.length > 0) {
          html += createDiffSpan(
            "insert",
            insertions.join(""),
            safeUserName,
            userPic,
            userColor,
            includeTooltip
          );
        }
      } else if (op === DIFF_INSERT) {
        // INSERT operation - check if DELETE follows
        const deletions = [];
        const insertions = [];

        // Collect all consecutive INSERT operations
        while (i < diffs.length && diffs[i][0] === DIFF_INSERT) {
          insertions.push(diffs[i][1]);
          i++;
        }

        // Collect all consecutive DELETE operations that follow
        while (i < diffs.length && diffs[i][0] === DIFF_DELETE) {
          deletions.push(diffs[i][1]);
          i++;
        }

        // IMPORTANT: Always show deletions first, then insertions
        if (deletions.length > 0) {
          html += createDiffSpan(
            "delete",
            deletions.join(""),
            safeUserName,
            userPic,
            userColor,
            includeTooltip
          );
        }

        if (insertions.length > 0) {
          html += createDiffSpan(
            "insert",
            insertions.join(""),
            safeUserName,
            userPic,
            userColor,
            includeTooltip
          );
        }
      } else {
        i++;
      }
    }

    return html;
  };

  // Create full deletion + insertion HTML (Google Docs style)
  // Shows complete old text as deleted, followed by complete new text as inserted
  const createFullDeletionInsertionHTML = (
    oldText,
    newText,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    let html = "";
    const safeUserName = getSafeUserName(userName);
    const userColor = getUserColor(safeUserName);
    const userPic =
      getProfilePicture(userProfilePicture) || userProfilePicture || "";

    // Show full deleted text with strikethrough
    if (oldText) {
      html += createDiffSpan(
        "delete",
        oldText,
        safeUserName,
        userPic,
        userColor,
        includeTooltip
      );
    }

    // Show full inserted text with highlight
    if (newText) {
      html += createDiffSpan(
        "insert",
        newText,
        safeUserName,
        userPic,
        userColor,
        includeTooltip
      );
    }

    return html;
  };

  // Create word-level diff HTML for similar texts (small edits/typos)
  const createWordLevelDiffHTML = (
    oldText,
    newText,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    const contentDiff = diff(oldText, newText);
    return createInlineDiffHTML(
      contentDiff,
      userName,
      userProfilePicture,
      includeTooltip
    );
  };

  // Split text into sentences
  const splitIntoSentences = (text) => {
    // Split by sentence boundaries (. ! ?) followed by space or end of text
    // Keep the punctuation with the sentence
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [];
    return sentences.filter((s) => s.trim().length > 0);
  };

  // Create sentence-level diff HTML for moderately different texts
  // IMPORTANT: Always show deletions before insertions
  const createSentenceLevelDiffHTML = (
    oldText,
    newText,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    const oldSentences = splitIntoSentences(oldText);
    const newSentences = splitIntoSentences(newText);

    const safeUserName = getSafeUserName(userName);
    const userColor = getUserColor(safeUserName);
    const userPic = userProfilePicture || "";

    // Build a mapping of which sentences match
    const processedOld = new Set();
    const processedNew = new Set();
    const matchMap = new Map(); // Maps new sentence index to old sentence index

    // Find matches
    for (let i = 0; i < newSentences.length; i++) {
      for (let j = 0; j < oldSentences.length; j++) {
        if (processedOld.has(j)) continue;

        const similarity = calculateSimilarity(
          oldSentences[j].trim(),
          newSentences[i].trim()
        );
        if (similarity > 90) {
          // Very similar - mark as matched
          matchMap.set(i, { oldIndex: j, type: "unchanged" });
          processedOld.add(j);
          processedNew.add(i);
          break;
        } else if (similarity > 50 && !matchMap.has(i)) {
          // Moderately similar - mark as modified
          matchMap.set(i, { oldIndex: j, type: "modified" });
          processedOld.add(j);
          processedNew.add(i);
          break;
        }
      }
    }

    // Build output showing deletions before insertions
    let html = "";

    // First, show all deleted sentences (sentences in old but not in new)
    const deletedSentences = [];
    for (let j = 0; j < oldSentences.length; j++) {
      if (!processedOld.has(j)) {
        deletedSentences.push(oldSentences[j]);
      }
    }

    if (deletedSentences.length > 0) {
      html += createDiffSpan(
        "delete",
        deletedSentences.join(" "),
        safeUserName,
        userPic,
        userColor,
        includeTooltip
      );
    }

    // Then, show new/modified sentences
    for (let i = 0; i < newSentences.length; i++) {
      const match = matchMap.get(i);

      if (match && match.type === "unchanged") {
        // Unchanged sentence
        html += escapeHTML(newSentences[i]);
      } else if (match && match.type === "modified") {
        // Modified sentence - show word-level diff
        const sentenceDiff = diff(
          oldSentences[match.oldIndex],
          newSentences[i]
        );
        html += createInlineDiffHTML(
          sentenceDiff,
          safeUserName,
          userPic,
          includeTooltip
        );
      } else {
        // New sentence - show as inserted
        html += createDiffSpan(
          "insert",
          newSentences[i],
          safeUserName,
          userPic,
          userColor,
          includeTooltip
        );
      }
    }

    return html;
  };

  const renderContributorChips = (contributors) => {
    if (!Array.isArray(contributors) || contributors.length === 0) {
      return null;
    }

    const meaningfulContributors = contributors.filter(
      (contributor) =>
        contributor?.name && contributor.name !== DEFAULT_CONTRIBUTOR.name
    );

    const contributorsToShow =
      meaningfulContributors.length > 0
        ? meaningfulContributors
        : contributors;

    if (
      contributorsToShow.length === 1 &&
      contributorsToShow[0]?.name === DEFAULT_CONTRIBUTOR.name
    ) {
      return null;
    }

    const MAX_VISIBLE = 3;
    const visibleContributors = contributorsToShow.slice(0, MAX_VISIBLE);
    const remaining = contributorsToShow.length - MAX_VISIBLE;

    return (
      <div className="diff-contributor-chips">
        {visibleContributors.map((contributor, index) => {
          const displayName = contributor?.name || "Unknown User";
          const avatarUrl =
            getProfilePicture(contributor?.profile_picture) ||
            contributor?.profile_picture ||
            "";

          return (
            <div
              key={`${displayName}-${index}`}
              className="diff-contributor-chip"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="diff-contributor-avatar"
                />
              ) : (
                <span className="diff-contributor-avatar diff-contributor-avatar--fallback">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="diff-contributor-name">{displayName}</span>
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="diff-contributor-chip diff-contributor-chip-extra">
            +{remaining}
          </div>
        )}
      </div>
    );
  };

  // Create diff HTML that preserves formatting tags
  // Helper function to check if HTML contains strikethrough formatting
  const hasStrikethroughFormatting = (html) => {
    if (!html || typeof html !== "string") return false;
    // Check for <s>, <strike>, or <del> tags (opening tags)
    // Also check for style="text-decoration: line-through" or similar
    return (
      /<(s|strike|del)(\s+[^>]*)?>/i.test(html) ||
      /text-decoration:\s*line-through/i.test(html) ||
      /text-decoration-line:\s*line-through/i.test(html)
    );
  };

  const createFormattedDiffHTML = (
    oldHTML,
    newHTML,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    // Handle edge cases
    if (!oldHTML && !newHTML) return "";

    // Extract text content for comparison
    const oldText = stripHTML(oldHTML);
    const newText = stripHTML(newHTML);

    if (!oldText && !newText) return newHTML; // Both empty

    if (!oldText) {
      // Pure insertion - wrap the new HTML content
      const safeUserName = getSafeUserName(userName);
      const userColor = getUserColor(safeUserName);
      const userPic = userProfilePicture || "";
      const safeUserNameAttr = escapeHTML(userName || "");
      const safeUserPicAttr = escapeHTML(userPic);
      const tooltipHTML = includeTooltip
        ? createDiffTooltipHTML(userName, userPic, userColor)
        : "";

      return `<span class="diff-inline-insert" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; background-color: ${userColor.light};">${newHTML}${tooltipHTML}</span>`;
    }

    if (!newText) {
      // Pure deletion - wrap the old HTML content (content cleared with Cmd+Delete)
      // Check if content has strikethrough formatting
      const hasStrikethrough = hasStrikethroughFormatting(oldHTML);
      const strikethroughClass = hasStrikethrough
        ? " diff-has-strikethrough"
        : "";

      const safeUserName = getSafeUserName(userName);
      const userColor = getUserColor(safeUserName);
      const userPic = userProfilePicture || "";
      const safeUserNameAttr = escapeHTML(userName || "");
      const safeUserPicAttr = escapeHTML(userPic);
      const tooltipHTML = includeTooltip
        ? createDiffTooltipHTML(userName, userPic, userColor)
        : "";

      return `<span class="diff-inline-delete diff-content-cleared${strikethroughClass}" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; --strikethrough-color: ${userColor.main};">${oldHTML}${tooltipHTML}</span>`;
    }

    // If texts are identical, return new HTML as-is
    if (oldText.trim() === newText.trim()) {
      return newHTML;
    }

    // For complex changes with formatting, use a simpler approach:
    // Show old formatted content as deleted, new formatted content as inserted
    const safeUserName = getSafeUserName(userName);
    const userColor = getUserColor(safeUserName);
    const userPic = userProfilePicture || "";
    const safeUserNameAttr = escapeHTML(userName || "");
    const safeUserPicAttr = escapeHTML(userPic);
    const tooltipHTML = includeTooltip
      ? createDiffTooltipHTML(userName, userPic, userColor)
      : "";

    let html = "";

    // Show old formatted content with strikethrough
    if (oldHTML) {
      // Check if content has strikethrough formatting
      const hasStrikethrough = hasStrikethroughFormatting(oldHTML);
      const strikethroughClass = hasStrikethrough
        ? " diff-has-strikethrough"
        : "";

      html += `<span class="diff-inline-delete${strikethroughClass}" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; --strikethrough-color: ${userColor.main};">${oldHTML}${tooltipHTML}</span>`;
    }

    // Show new formatted content with highlight
    if (newHTML) {
      html += `<span class="diff-inline-insert" contenteditable="false" data-user="${safeUserNameAttr}" data-user-pic="${safeUserPicAttr}" data-user-color="${userColor.main}" style="color: ${userColor.text}; background-color: ${userColor.light};">${newHTML}${tooltipHTML}</span>`;
    }

    return html;
  };

  // Smart diff dispatcher - always use word-level diff for granular changes
  const createSmartDiffHTML = (
    oldText,
    newText,
    userName,
    userProfilePicture,
    includeTooltip = true
  ) => {
    // Handle edge cases
    if (!oldText && !newText) return "";
    if (!oldText) {
      // Pure insertion
      return createWordLevelDiffHTML(
        "",
        newText,
        userName,
        userProfilePicture,
        includeTooltip
      );
    }
    if (!newText) {
      // Pure deletion
      return createWordLevelDiffHTML(
        oldText,
        "",
        userName,
        userProfilePicture,
        includeTooltip
      );
    }

    // Normalize whitespace for comparison
    const oldNormalized = oldText.trim();
    const newNormalized = newText.trim();

    // If only whitespace changed, treat as unchanged
    if (oldNormalized === newNormalized) {
      return escapeHTML(newText);
    }

    // Always use word-level diff with smart grouping - handles all scenarios:
    // - Single word replacement: ~~cat~~ **dog**
    // - Partial edits: ~~workings~~ **timings**
    // - Delete + insert: ~~with many words.~~ **with alot of text.**
    return createWordLevelDiffHTML(
      oldText,
      newText,
      userName,
      userProfilePicture,
      includeTooltip
    );
  };

  // Escape HTML to prevent XSS
  const escapeHTML = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  // Get total number of changes
  const getTotalChanges = () => {
    // Track unique move operations (each moved block appears twice: moved-from and moved-to)
    const movedBlockIds = new Set();
    const changes = [];

    blocksWithDiffs.forEach((block) => {
      if (block.diffType === "unchanged") {
        return;
      }

      // For moved blocks, count each unique block ID only once
      if (block.diffType === "moved-from" || block.diffType === "moved-to") {
        if (!movedBlockIds.has(block.id)) {
          movedBlockIds.add(block.id);
          changes.push(block);
        }
      } else {
        // For other changes (added, deleted, modified), count normally
        changes.push(block);
      }
    });

    const titleChange = hasTitleChange ? 1 : 0;
    return changes.length + titleChange;
  };

  // Navigate to next change
  const nextChange = () => {
    const totalChanges = getTotalChanges();
    if (totalChanges === 0) return;

    let newIndex;
    if (totalChanges === 1) {
      // With only one change, just scroll to it
      newIndex = 0;
    } else {
      // Multiple changes: navigate to next
      if (currentChangeIndex < totalChanges - 1) {
        newIndex = currentChangeIndex + 1;
      } else {
        return; // Already at the last change
      }
    }

    setCurrentChangeIndex(newIndex);
    setTimeout(() => {
      changeRefs.current[newIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  };

  // Navigate to previous change
  const prevChange = () => {
    const totalChanges = getTotalChanges();
    if (totalChanges === 0) return;

    let newIndex;
    if (totalChanges === 1) {
      // With only one change, just scroll to it
      newIndex = 0;
    } else {
      // Multiple changes: navigate to previous
      if (currentChangeIndex > 0) {
        newIndex = currentChangeIndex - 1;
      } else {
        return; // Already at the first change
      }
    }

    setCurrentChangeIndex(newIndex);
    setTimeout(() => {
      changeRefs.current[newIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  };

  // Render blocks with inline diffs
  const renderBlocks = () => {
    // Start counter after title (title takes index 0 if it changed)
    let changeCounter = hasTitleChange ? 1 : 0;
    const oldContextBlocks = Array.isArray(oldBlocks) ? oldBlocks : [];
    const newContextBlocks = Array.isArray(newBlocks) ? newBlocks : [];

    // Track which moved blocks we've already counted and their assigned indices
    const movedBlockIndices = new Map(); // blockId -> changeIndex

    // Create unique identifiers for moved blocks with per-type counters
    // e.g., HD1-1, HD1-2, TX-1, TX-2, TBL-1, etc.
    const movedBlockIdentifiers = new Map(); // blockId -> identifier
    const typeCounters = new Map(); // blockType -> counter

    blocksWithDiffs.forEach((block) => {
      if (
        (block.diffType === "moved-from" || block.diffType === "moved-to") &&
        !movedBlockIdentifiers.has(block.id)
      ) {
        // Get unique prefix for this block type
        const typePrefix = BLOCK_TYPE_PREFIXES[block.type] || "BLK";

        // Get or initialize counter for this block type
        const currentCount = typeCounters.get(block.type) || 0;
        const nextCount = currentCount + 1;
        typeCounters.set(block.type, nextCount);

        // Create identifier: prefix + counter (e.g., HD1-1, TX-2, TBL-1)
        const identifier = `${typePrefix}-${nextCount}`;
        movedBlockIdentifiers.set(block.id, identifier);
      }
    });

    return blocksWithDiffs.map((block, index) => {
      const { diffType, changeInfo } = block;

      // Determine if this is a change and should be counted
      let isChange = diffType !== "unchanged";
      let changeIndex = -1;

      // For moved blocks, only count once (on the first occurrence we see)
      if (diffType === "moved-from" || diffType === "moved-to") {
        if (!movedBlockIndices.has(block.id)) {
          // First time seeing this moved block - assign a change index
          changeIndex = changeCounter;
          movedBlockIndices.set(block.id, changeIndex);
          changeCounter++;
        } else {
          // Second occurrence of this moved block - reuse the same index
          changeIndex = movedBlockIndices.get(block.id);
        }
      } else if (isChange) {
        changeIndex = changeCounter;
        changeCounter++;
      }

      const isCurrentChange = changeIndex === currentChangeIndex && isChange;

      let containerClass = "diff-block-container ";
      if (isCurrentChange) containerClass += "diff-block-current-highlight ";

      const previousType =
        diffType === "deleted"
          ? block.type
          : block?.oldBlock?.type ?? changeInfo?.oldType ?? null;
      const currentTypeLabel = getBlockTypeLabel(block.type);
      const previousTypeLabel = previousType
        ? getBlockTypeLabel(previousType)
        : null;

      let labelVariant = "default";
      let labelText = currentTypeLabel;
      let labelPrevious = previousTypeLabel;

      if (previousTypeLabel && previousTypeLabel !== currentTypeLabel) {
        labelVariant = "changed";
      }

      // Only create the combined typeLabel if it's NOT a block type change
      // (block type changes render separate labels for old and new)
      const typeLabel = !block.isBlockTypeChange
        ? renderBlockTypeLabel({
            label: labelText,
            variant: labelVariant,
            previousLabel: labelPrevious,
          })
        : null;

      const contributorBadges = renderContributorChips(
        changeInfo?.contributors
      );

      const ref = (el) => {
        if (isChange && el) {
          changeRefs.current[changeIndex] = el;
        }
      };

      // Determine if this is a structured block
      const isStructuredBlock = STRUCTURED_BLOCK_TYPES.includes(block.type);

      // For structured blocks OR formatting-only changes, render both old and new inline
      if (diffType === "modified" && block.oldBlock) {
        const userColor = changeInfo ? getUserColor(changeInfo.user) : null;

        // Use different styling based on change type:
        // - Formatting changes: double line
        // - Block type changes: double line
        // - TODO/structured changes: wavy line
        const useDoubleLine =
          block.isFormattingChange || block.isBlockTypeChange;
        const deletedClass = useDoubleLine
          ? "diff-structured-deleted diff-formatting-change"
          : "diff-structured-deleted";

        // For block type changes, show separate labels for old and new
        // For other changes, show single label at top
        if (block.isBlockTypeChange) {
          const oldTypeLabel = renderBlockTypeLabel({
            label: getBlockTypeLabel(block.oldBlock.type),
            variant: "deleted",
          });
          const newTypeLabel = renderBlockTypeLabel({
            label: getBlockTypeLabel(block.type),
            variant: "added",
          });

          return (
            <div key={block.id || index} ref={ref} className={containerClass}>
              {/* Chart diff summary for chart-to-chart type changes */}
              {(block.type === 'barChart' || block.type === 'lineChart' ||
                block.type === 'areaChart' || block.type === 'pieChart' ||
                block.type === 'donutChart' || block.type === 'scatterChart') &&
                (block.oldBlock.type === 'barChart' || block.oldBlock.type === 'lineChart' ||
                 block.oldBlock.type === 'areaChart' || block.oldBlock.type === 'pieChart' ||
                 block.oldBlock.type === 'donutChart' || block.oldBlock.type === 'scatterChart') && (
                <div style={{ marginBottom: "16px" }}>
                  <ChartDiffSummary
                    oldBlock={block.oldBlock}
                    newBlock={block}
                    changeInfo={changeInfo}
                  />
                </div>
              )}

              {contributorBadges}

              {/* Old version with its type label */}
              <div style={{ marginBottom: "16px", position: "relative" }}>
                <div style={{ marginBottom: "4px" }}>{oldTypeLabel}</div>
                <div
                  className={deletedClass}
                  data-user={changeInfo?.user || "Unknown User"}
                  data-user-pic={changeInfo?.userProfilePicture || ""}
                  data-user-color={userColor?.main}
                  style={{
                    opacity: 0.7,
                    position: "relative",
                    "--user-color": userColor?.main,
                  }}
                >
                  <Block
                    block={block.oldBlock}
                    readOnly={true}
                    isActive={false}
                    allBlocks={oldContextBlocks}
                    onChange={() => {}}
                    onKeyDown={() => {}}
                    onFocus={() => {}}
                    onAction={() => {}}
                  />
                </div>
              </div>

              {/* New version with its type label */}
              <div style={{ position: "relative" }}>
                <div style={{ marginBottom: "4px" }}>{newTypeLabel}</div>
                <div
                  className="diff-structured-added"
                  data-user={changeInfo?.user || "Unknown User"}
                  data-user-pic={changeInfo?.userProfilePicture || ""}
                  data-user-color={userColor?.main}
                  style={{
                    backgroundColor: userColor?.light,
                    borderRadius: "4px",
                    padding: "4px",
                    position: "relative",
                    "--user-color": userColor?.main,
                  }}
                >
                  <Block
                    block={block}
                    readOnly={true}
                    isActive={false}
                    allBlocks={newContextBlocks}
                    onChange={() => {}}
                    onKeyDown={() => {}}
                    onFocus={() => {}}
                    onAction={() => {}}
                  />
                </div>
              </div>
            </div>
          );
        }

        // For non-block-type changes (formatting, TODO checkbox, etc.)
        const isChartBlock = (block.type === 'barChart' || block.type === 'lineChart' ||
          block.type === 'areaChart' || block.type === 'pieChart' ||
          block.type === 'donutChart' || block.type === 'scatterChart');

        return (
          <div key={block.id || index} ref={ref} className={containerClass}>
            {typeLabel}
            {contributorBadges}

            {/* Chart diff summary for chart blocks */}
            {isChartBlock && (
              <ChartDiffSummary
                oldBlock={block.oldBlock}
                newBlock={block}
                changeInfo={changeInfo}
              />
            )}

            {/* Old version with line through entire block */}
            <div
              className={deletedClass}
              data-user={changeInfo?.user || "Unknown User"}
              data-user-pic={changeInfo?.userProfilePicture || ""}
              data-user-color={userColor?.main}
              style={{
                opacity: 0.7,
                position: "relative",
                "--user-color": userColor?.main,
              }}
            >
              <Block
                block={block.oldBlock}
                readOnly={true}
                isActive={false}
                allBlocks={oldContextBlocks}
                onChange={() => {}}
                onKeyDown={() => {}}
                onFocus={() => {}}
                onAction={() => {}}
              />
            </div>

            {/* New version with highlight styling */}
            <div
              className="diff-structured-added"
              data-user={changeInfo?.user || "Unknown User"}
              data-user-pic={changeInfo?.userProfilePicture || ""}
              data-user-color={userColor?.main}
              style={{
                backgroundColor: userColor?.light,
                borderRadius: "4px",
                padding: "4px",
                marginTop: "4px",
                position: "relative",
                "--user-color": userColor?.main,
              }}
            >
              <Block
                block={block}
                readOnly={true}
                isActive={false}
                allBlocks={newContextBlocks}
                onChange={() => {}}
                onKeyDown={() => {}}
                onFocus={() => {}}
                onAction={() => {}}
              />
            </div>
          </div>
        );
      }

      // Handle moved blocks with special styling
      if (diffType === "moved-from" || diffType === "moved-to") {
        const userColor = changeInfo ? getUserColor(changeInfo.user) : null;
        const isMovedFrom = diffType === "moved-from";

        // Get unique short identifier for this block
        const blockId = movedBlockIdentifiers.get(block.id) || "?";
        const blockTypeLabel = getBlockTypeLabel(block.type);

        // Create content preview for tooltip
        const blockPreview = block.content
          ? stripHTML(block.content).slice(0, 50).trim()
          : "";
        const tooltipText = blockPreview
          ? `Block ${blockId} (${blockTypeLabel}): "${blockPreview}${
              blockPreview.length >= 50 ? "..." : ""
            }"`
          : `Block ${blockId} (${blockTypeLabel})`;

        // Create short badge text
        const badge = isMovedFrom
          ? `Block ${blockId} Moved From Here`
          : `Block ${blockId} Moved To Here`;

        const BadgeIcon = isMovedFrom ? MapPinXInside : MapPinCheckInside;

        return (
          <div key={block.id || index} ref={ref} className={containerClass}>
            {typeLabel}
            {contributorBadges}
            <div
              className="diff-moved-block"
              data-user={changeInfo?.user || ""}
              data-user-pic={changeInfo?.userProfilePicture || ""}
              data-user-color={userColor?.main || ""}
              style={{
                position: "relative",
                borderLeft: `4px solid ${userColor?.main || "#6366f1"}`,
                backgroundColor: userColor?.light || "rgba(99, 102, 241, 0.05)",
                borderRadius: "8px",
                padding: "12px",
                "--user-color": userColor?.main || "#6366f1",
              }}
            >
              {/* Badge */}
              <div
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  backgroundColor: userColor?.main || "#6366f1",
                  color: "white",
                  padding: "4px 12px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  zIndex: 10,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  maxWidth: "400px",
                }}
                title={badge}
              >
                <BadgeIcon
                  className="w-4 h-4 flex-shrink-0"
                  strokeWidth={2.5}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badge}
                </span>
              </div>

              {/* Blurred block */}
              <div
                style={{
                  filter: "blur(1.5px)",
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              >
                <Block
                  block={block}
                  readOnly={true}
                  isActive={false}
                  allBlocks={isMovedFrom ? oldContextBlocks : newContextBlocks}
                  onChange={() => {}}
                  onKeyDown={() => {}}
                  onFocus={() => {}}
                  onAction={() => {}}
                />
              </div>
            </div>
          </div>
        );
      }

      // For added/deleted blocks
      let blockClass = "";
      let blockStyle = {};

      if (diffType === "deleted") {
        blockClass = "diff-deleted-block";
        if (changeInfo && changeInfo.user) {
          const userColor = getUserColor(changeInfo.user);
          blockStyle = {
            borderLeftColor: userColor.main,
            backgroundColor: userColor.light,
            "--user-color": userColor.main,
            "--user-text-color": userColor.text,
          };
        }
      } else if (diffType === "added") {
        blockClass = "diff-added-block";
        if (changeInfo && changeInfo.user) {
          const userColor = getUserColor(changeInfo.user);
          blockStyle = {
            borderLeftColor: userColor.main,
            backgroundColor: userColor.light,
            "--user-color": userColor.main,
            "--user-text-color": userColor.text,
          };
        }
      }

      return (
        <div key={block.id || index} ref={ref} className={containerClass}>
          {typeLabel}
          {contributorBadges}
          {/* Render the actual block */}
          <div
            className={blockClass}
            style={blockStyle}
            data-user={changeInfo?.user || ""}
            data-user-pic={changeInfo?.userProfilePicture || ""}
            data-user-color={
              changeInfo && changeInfo.user
                ? getUserColor(changeInfo.user).main
                : ""
            }
          >
            <Block
              block={block}
              readOnly={true}
              isActive={false}
              allBlocks={
                diffType === "deleted" ? oldContextBlocks : newContextBlocks
              }
              onChange={() => {}}
              onKeyDown={() => {}}
              onFocus={() => {}}
              onAction={() => {}}
            />
          </div>
        </div>
      );
    });
  };

  const totalChanges = getTotalChanges();

  const titleClassName =
    "w-full text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100 midnight:text-gray-100 leading-tight diff-title-content";

  const renderTitleSection = () => {
    if (!hasTitleChange && !newTitle) {
      return null;
    }

    const isCurrentTitleChange = hasTitleChange && currentChangeIndex === 0;
    const wrapperClasses = ["mb-8"];
    const containerClasses = ["diff-title-container"];

    if (isCurrentTitleChange) {
      containerClasses.push("diff-block-current-highlight");
    }

    const safeTitleUserName = getSafeUserName(titleChangeUserName);

    return (
      <div className={wrapperClasses.join(" ")}>
        <div className="mb-3">
          <span className="diff-title-badge">Title</span>
        </div>
        <div
          className={containerClasses.join(" ")}
          ref={hasTitleChange ? titleChangeRef : null}
          onMouseEnter={handleHoverMouseEnter}
          onMouseMove={handleHoverMouseMove}
          onMouseLeave={handleHoverMouseLeave}
        >
          {hasTitleChange ? (
            <div
              className={titleClassName}
              style={{ lineHeight: "1.1" }}
              dangerouslySetInnerHTML={{ __html: titleDiffHtml }}
            />
          ) : (
            <div className={titleClassName} style={{ lineHeight: "1.1" }}>
              {newTitle}
            </div>
          )}
        </div>
      </div>
    );
  };

  const tooltipDisplayName =
    hoverTooltip.userName && hoverTooltip.userName.trim().length > 0
      ? hoverTooltip.userName
      : "Unknown User";
  const tooltipBackgroundColor =
    hoverTooltip.userColor || getUserColor(tooltipDisplayName).main;

  // Check if this specific version is being restored
  const isRestoring = restoringVersionId === versionId;

  const handleRestore = async () => {
    if (onRestore && versionData && !isRestoring) {
      await onRestore({
        ...versionData,
        versionId,
      });
    }
  };

  return (
    <div className="diff-viewer-fullscreen">
      <div className="diff-viewer-container">
        {/* Header */}
        <div className="diff-viewer-header">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <FlipHorizontal2 className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-200">
                  Version Comparison
                </h2>
              </div>
              {totalChanges > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  <span>
                    Change {currentChangeIndex + 1} of {totalChanges}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={prevChange}
                      disabled={
                        totalChanges === 0 ||
                        (totalChanges > 1 && currentChangeIndex === 0)
                      }
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 midnight:text-gray-300"
                      title={
                        totalChanges === 1 ? "Go to change" : "Previous change"
                      }
                    >
                      <SquareChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={nextChange}
                      disabled={
                        totalChanges === 0 ||
                        (totalChanges > 1 &&
                          currentChangeIndex === totalChanges - 1)
                      }
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 midnight:text-gray-300"
                      title={
                        totalChanges === 1 ? "Go to change" : "Next change"
                      }
                    >
                      <SquareChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onRestore && versionData && (
                <button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white transition-all ${
                    isRestoring
                      ? "bg-blue-400 dark:bg-blue-500 midnight:bg-blue-600 cursor-wait"
                      : "bg-blue-500 dark:bg-blue-600 midnight:bg-blue-700 hover:bg-blue-600 dark:hover:bg-blue-700 midnight:hover:bg-blue-800"
                  }`}
                  title={isRestoring ? "Restoring..." : "Restore this version"}
                >
                  <RotateCcw
                    className={`w-4 h-4 ${isRestoring ? "animate-spin" : ""}`}
                  />
                  {isRestoring ? "Restoring..." : "Restore this version"}
                </button>
              )}
              <button
                onClick={handleCloseDiff}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-600 dark:text-gray-400 midnight:text-gray-300"
                title="Close"
              >
                <SquareX className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className={`diff-viewer-content ${
            isLoading ? "diff-viewer-loading" : ""
          }`}
          ref={diffViewerRef}
          onMouseEnter={handleHoverMouseEnter}
          onMouseMove={handleHoverMouseMove}
          onMouseLeave={handleHoverMouseLeave}
        >
          <div className="max-w-4xl mx-auto px-6 pt-8 pb-24">
            {/* Title section */}
            {renderTitleSection()}

            {/* Content section badge */}
            <div className="mb-6">
              <span className="diff-title-badge">Content</span>
            </div>

            {/* Blocks */}
            {isLoading ? (
              <div className="diff-loading-placeholder space-y-6">
                <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse" />
                <div className="h-48 rounded-xl bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse" />
              </div>
            ) : (
              renderBlocks()
            )}
          </div>

          {hoverTooltip.visible && !isLoading && (
            <div
              className={`diff-user-tooltip diff-hover-tooltip diff-hover-tooltip-visible`}
              style={{
                left: `${hoverTooltip.x}px`,
                top: `${hoverTooltip.y}px`,
                backgroundColor: tooltipBackgroundColor,
                "--tooltip-bg": tooltipBackgroundColor,
              }}
            >
              <div className="diff-hover-tooltip__content">
                <div className="diff-hover-tooltip__user">
                  {hoverTooltip.userPic ? (
                    <img
                      src={
                        getProfilePicture(hoverTooltip.userPic) ||
                        hoverTooltip.userPic
                      }
                      alt={tooltipDisplayName}
                      className="diff-hover-tooltip__avatar"
                    />
                  ) : (
                    <div
                      className="diff-hover-tooltip__avatar diff-hover-tooltip__avatar--fallback"
                      style={{ backgroundColor: tooltipBackgroundColor }}
                    >
                      {tooltipDisplayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="diff-hover-tooltip__user-info">
                    <span className="diff-hover-tooltip__name">
                      {tooltipDisplayName}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="diff-loading-overlay">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-m font-bold text-gray-600 dark:text-gray-300 midnight:text-gray-200">
              Loading Version Details...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffViewer;
