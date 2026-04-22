import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import { useColumnContext } from "../context/ColumnContext";
import { useCardContext } from "../context/CardContext";
import { useCardActions } from "../hooks/useCardActions"; // Import useCardActions
import AddCardModal from "../kanban/features/cards/AddCardModal"; // Import AddCardModal
import viewsApi from "../viewsApi";
import {
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  Search,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Link2,
  Network,
  Trash2, // Icon for delete
  Plus, // Icon for add
  X, // Icon for closing notification
  Info, // Icon for info/legend
  ChevronUp,
  ChevronDown,
  Clock,
  CirclePlus,
} from "lucide-react";

const soraFontBase = "font-sora";

// NetworkView Skeleton Component
const NetworkViewSkeleton = () => {
  return (
    <div
      className={`h-screen w-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase} overflow-hidden`}
    >
      {/* Header Skeleton */}
      <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-6">
          {/* Search Bar Skeleton */}
          <div className="relative">
            <div className="w-80 h-10 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse"></div>
            <div className="absolute left-3 top-3 w-4 h-4 bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 rounded-full animate-pulse" />
          </div>
          {/* Controls Skeleton */}
          <div className="flex items-center gap-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              <div className="w-36 h-8 bg-emerald-100 dark:bg-emerald-900/20 midnight:bg-emerald-950/80 rounded-full animate-pulse"></div>
              <div className="w-36 h-8 bg-red-100 dark:bg-red-900/20 midnight:bg-red-950/80 rounded-full animate-pulse"></div>
              <div className="w-40 h-8 bg-indigo-100 dark:bg-indigo-900/20 midnight:bg-indigo-950/80 rounded-full animate-pulse"></div>
            </div>
            {/* Zoom Controls */}
            <div className="flex items-center border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg overflow-hidden">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse" />
              <div className="w-12 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse" />
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 animate-pulse" />
            </div>
            {/* Pan Reset Button */}
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse" />
            {/* Create Task Button */}
            <div className="w-24 h-7 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-md animate-pulse" />
            {/* Legend Button */}
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
      {/* Network Diagram Skeleton */}
      <div className="flex-1 relative bg-gray-50/30 dark:bg-gray-800/30 midnight:bg-gray-900/30 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Network className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700 midnight:text-gray-800 animate-pulse" />
            <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 mx-auto rounded animate-pulse"></div>
          </div>
        </div>
        {/* Elegant Skeleton Nodes */}
        <div className="absolute left-1/4 top-1/4 w-48 h-20 bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30 midnight:from-indigo-950/20 midnight:to-indigo-900/20 rounded-xl shadow-sm animate-pulse"></div>
        <div className="absolute left-2/4 top-1/3 w-44 h-18 bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30 midnight:from-emerald-950/20 midnight:to-emerald-900/20 rounded-xl shadow-sm animate-pulse"></div>
        <div className="absolute left-1/3 top-2/3 w-52 h-22 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 midnight:from-amber-950/20 midnight:to-amber-900/20 rounded-xl shadow-sm animate-pulse"></div>
        <div className="absolute left-3/4 top-1/2 w-40 h-16 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 midnight:from-red-950/20 midnight:to-red-900/20 rounded-xl shadow-sm animate-pulse"></div>
        {/* Elegant Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker
              id="arrow-skeleton"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-gray-300 dark:fill-gray-600 midnight:fill-gray-700"
              />
            </marker>
          </defs>
          <path
            d="M 25 25 Q 37.5 15 50 33"
            className="stroke-gray-300 dark:stroke-gray-600 midnight:stroke-gray-700 stroke-2 fill-none animate-pulse"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#arrow-skeleton)"
          />
          <path
            d="M 50 33 Q 41.5 50 33 67"
            className="stroke-gray-300 dark:stroke-gray-600 midnight:stroke-gray-700 stroke-2 fill-none animate-pulse"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#arrow-skeleton)"
          />
          <path
            d="M 33 67 Q 54 58 75 50"
            className="stroke-gray-300 dark:stroke-gray-600 midnight:stroke-gray-700 stroke-2 fill-none animate-pulse"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#arrow-skeleton)"
          />
        </svg>
      </div>
    </div>
  );
};

// The NetworkView component visualizes task dependencies as a network diagram
const NetworkView = ({ selectedProject, session }) => {
  const { columns, isLoading, error } = useColumnContext();
  const { setSelectedCard, selectedCard } = useCardContext();
  const { addDependency, removeDependency } = useCardActions(); // Get dependency actions

  // Refs
  const networkRef = useRef(null);
  const svgRef = useRef(null);
  const cardPositionCache = useRef(new Map()); // Stable position cache - persists across filter changes
  const cardOrderCache = useRef(new Map()); // Stable order index for each card in its column

  // State
  const [cards, setCards] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [cardDependencies, setCardDependencies] = useState({});
  const [dependentCards, setDependentCards] = useState({});
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterConfig, setFilterConfig] = useState({
    showCompleted: true,
    highlightBlockers: false, // Off by default
    highlightCriticalPath: false,
  });

  // Visualization state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredPlusButton, setHoveredPlusButton] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });
  const [dependencyMode, setDependencyMode] = useState({
    // State for adding dependencies
    active: false,
    sourceNodeId: null,
  });
  const [notification, setNotification] = useState({
    // State for notifications
    visible: false,
    message: "",
    type: "info", // "success", "error", "info"
  });

  // Modal state for Create Task functionality
  const [showCreateTask, setShowCreateTask] = useState(false);

  // Dropdown state for Dependency Legend
  const [showLegendDropdown, setShowLegendDropdown] = useState(false);
  const [isClosingLegend, setIsClosingLegend] = useState(false);
  const legendDropdownRef = useRef(null);
  const legendButtonRef = useRef(null);

  // Dependency configuration modal state
  const [showDependencyConfig, setShowDependencyConfig] = useState(false);
  const [pendingDependency, setPendingDependency] = useState({
    sourceNodeId: null,
    type: "FS",
    lag: 0,
  });

  // Mouse position for dependency linking line
  const [linkingMousePos, setLinkingMousePos] = useState({ x: 0, y: 0 });

  // Detect container size on mount and resize
  useLayoutEffect(() => {
    if (!networkRef.current) return;

    const updateSize = () => {
      const { width, height } = networkRef.current.getBoundingClientRect();
      setContainerSize({ width, height });
    };

    // Initial size
    updateSize();

    // Setup resize observer
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(networkRef.current);

    // Cleanup
    return () => {
      if (networkRef.current) {
        resizeObserver.unobserve(networkRef.current);
      }
    };
  }, [networkRef.current]);

  // Prevent body and html scrolling when component is mounted
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    };
  }, []);

  // Extract all cards from columns
  useEffect(() => {
    if (!columns || !Array.isArray(columns)) return;

    // Flatten all cards from all columns
    const allCards = columns.reduce((acc, column) => {
      if (column.Cards && Array.isArray(column.Cards)) {
        // Add column title and isCompletionColumn to each card for reference
        const cardsWithColumn = column.Cards.map((card) => ({
          ...card,
          columnTitle: column.title,
          isCompletionColumn: column.isCompletionColumn || false,
        }));
        return [...acc, ...cardsWithColumn];
      }
      return acc;
    }, []);

    setCards(allCards);
  }, [columns]);

  // Fetch dependencies for all cards - extracted as separate function to be reusable
  const fetchDependencies = useCallback(async () => {
    if (!cards.length) return;

    setIsLoadingDependencies(true);
    try {
      const dependenciesMap = {};
      const dependentsMap = {};

      console.log("🔍 Fetching dependencies for", cards.length, "cards");

      for (const card of cards) {
        // Fetch dependencies (cards this card depends on)
        const [dependencies, dependents] = await Promise.all([
          viewsApi.dependency.getCardDependencies(card.id).catch((err) => {
            console.error(
              `Error fetching dependencies for card ${card.id}:`,
              err
            );
            return [];
          }),
          viewsApi.dependency.getDependentCards(card.id).catch((err) => {
            console.error(
              `Error fetching dependents for card ${card.id}:`,
              err
            );
            return [];
          }),
        ]);

        if (dependencies && dependencies.length > 0) {
          console.log(
            `Card ${card.title} (${card.id}) depends on:`,
            dependencies
          );
          dependenciesMap[card.id] = dependencies;
        }

        if (dependents && dependents.length > 0) {
          console.log(
            `Card ${card.title} (${card.id}) is depended on by:`,
            dependents
          );
          dependentsMap[card.id] = dependents;
        }
      }

      console.log("📊 Final dependencies map:", dependenciesMap);
      console.log("📊 Final dependents map:", dependentsMap);

      setCardDependencies(dependenciesMap);
      setDependentCards(dependentsMap);
    } catch (error) {
      console.error("Error fetching dependencies:", error);
    } finally {
      setIsLoadingDependencies(false);
    }
  }, [cards]);

  // Smart dependency refresh: detect both card additions/removals AND updates (from modal saves)
  const dependencyCardIdsRef = useRef("");
  const cardsArrayRef = useRef(cards);

  useEffect(() => {
    if (cards.length === 0) return;

    // Create a stable string of card IDs to detect when cards are actually added/removed
    const currentCardIds = cards
      .map((c) => c.id)
      .sort()
      .join(",");
    const previousCardIds = dependencyCardIdsRef.current;
    const cardsArrayChanged = cardsArrayRef.current !== cards;

    // Check if this is first load, cards added/removed, OR cards array updated (modal save)
    const shouldRefresh =
      previousCardIds === "" || // First load
      currentCardIds !== previousCardIds || // Cards added/removed
      (cardsArrayChanged && previousCardIds !== ""); // Cards updated (same IDs, different reference)

    if (shouldRefresh) {
      dependencyCardIdsRef.current = currentCardIds;
      cardsArrayRef.current = cards;

      // Debounce to avoid multiple rapid refreshes
      const timeoutId = setTimeout(() => {
        console.log("🔄 Refreshing dependencies...", {
          firstLoad: previousCardIds === "",
          idsChanged: currentCardIds !== previousCardIds,
          arrayChanged: cardsArrayChanged,
        });
        fetchDependencies();
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [cards, fetchDependencies]);

  // Check if a card is blocked by dependencies
  const isCardBlocked = useCallback(
    (card) => {
      console.log(`🔍 Checking if card "${card.title}" is blocked:`, {
        hasCardDependenciesData: !!cardDependencies[card.id],
        cardDependenciesData: cardDependencies[card.id],
      });

      // Check if we have dependency data for this card
      if (cardDependencies[card.id] && cardDependencies[card.id].length > 0) {
        // Check if any dependency is not in a completion column
        const isBlocked = cardDependencies[card.id].some((dep) => {
          const notCompleted = !dep.Column?.isCompletionColumn;
          console.log(
            `  → Dependency "${dep.title || dep.Card?.title}" in column "${
              dep.Column?.title
            }":`,
            {
              isCompletionColumn: dep.Column?.isCompletionColumn,
              isBlocking: notCompleted,
            }
          );
          return notCompleted;
        });
        console.log(
          `  ✅ Final result: ${isBlocked ? "BLOCKED" : "NOT BLOCKED"}`
        );
        return isBlocked;
      }
      console.log(`  ❌ No dependency data - NOT BLOCKED`);
      return false;
    },
    [cardDependencies]
  );

  // Handle legend dropdown close with animation
  const handleCloseLegend = useCallback(() => {
    if (!isClosingLegend) {
      setIsClosingLegend(true);
      setTimeout(() => {
        setIsClosingLegend(false);
        setShowLegendDropdown(false);
      }, 200); // Match animation duration
    }
  }, [isClosingLegend]);

  // Handle click outside legend dropdown
  useEffect(() => {
    if (!showLegendDropdown) return;

    const handleClickOutside = (event) => {
      // If click is on the button, ignore (button handles toggle)
      if (legendButtonRef.current?.contains(event.target)) {
        return;
      }

      // If click is outside the dropdown, close it
      if (
        legendDropdownRef.current &&
        !legendDropdownRef.current.contains(event.target)
      ) {
        handleCloseLegend();
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        handleCloseLegend();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [showLegendDropdown, handleCloseLegend]);

  // Track card IDs to detect when cards are added/removed (not just filtered)
  const cardIdsRef = useRef(new Set());

  // Clear position cache when layout changes or when cards are actually added/removed
  useEffect(() => {
    const currentCardIds = new Set(cards.map((c) => c.id));
    const cardIdsChanged =
      currentCardIds.size !== cardIdsRef.current.size ||
      !Array.from(currentCardIds).every((id) => cardIdsRef.current.has(id));

    if (cardIdsChanged) {
      cardIdsRef.current = currentCardIds;
      cardPositionCache.current.clear();
      cardOrderCache.current.clear();
    }
  }, [cards]);

  // Clear caches when container size changes
  useEffect(() => {
    cardPositionCache.current.clear();
    cardOrderCache.current.clear();
  }, [containerSize.width, containerSize.height]);

  // Calculate nodes and edges for the network diagram
  useEffect(() => {
    if (!cards.length || !containerSize.width || !containerSize.height) return;

    // Calculate positions for ALL cards first (to maintain stable positions)
    // Group cards by column for stable positioning
    const cardsByColumn = {};
    cards.forEach((card) => {
      if (!cardsByColumn[card.columnId]) {
        cardsByColumn[card.columnId] = [];
      }
      cardsByColumn[card.columnId].push(card);
    });

    // Sort cards within each column by ID for stable positions (prevents shifting when filters change)
    Object.keys(cardsByColumn).forEach((columnId) => {
      cardsByColumn[columnId].sort((a, b) => {
        // Sort by ID to ensure stable ordering
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      });
    });

    // Assign stable order indices for ALL cards based on sorted order
    // Only assign if not already cached - this prevents position shifts
    Object.keys(cardsByColumn).forEach((columnId) => {
      cardsByColumn[columnId].forEach((card, index) => {
        if (!cardOrderCache.current.has(card.id)) {
          cardOrderCache.current.set(card.id, {
            columnId: card.columnId,
            orderIndex: index,
          });
        }
      });
    });

    const allNodesWithPositions = cards.map((card) => {
      // Check if we have a cached position for this card
      const cachedPosition = cardPositionCache.current.get(card.id);
      if (cachedPosition) {
        return { card, x: cachedPosition.x, y: cachedPosition.y };
      }

      // Calculate new position for this card (hierarchical layout)
      // Group by column and then position within column
      const columnIndex = columns.findIndex(
        (col) => col.id === card.columnId
      );

      // Use stable order index (already assigned above)
      const columnCardIndex = cardOrderCache.current.get(card.id).orderIndex;

      // Increased spacing between cards
      const columnWidth = Math.max(
        300,
        containerSize.width / (columns.length || 1)
      );
      const rowHeight = 180;

      const x = (columnIndex + 0.5) * columnWidth;
      const y = (columnCardIndex + 1) * rowHeight;

      // Cache this position
      cardPositionCache.current.set(card.id, { x, y });

      return { card, x, y };
    });

    // Note: We no longer filter nodes here - all nodes are rendered and hidden with CSS
    // This prevents position shifts when toggling filters

    // Create nodes for ALL cards (including hidden ones) with full data
    const allNodes = allNodesWithPositions.map(({ card, x, y }) => {
      const isCompleted = card.progress === 100 || card.isCompletionColumn;
      const isBlocked = isCardBlocked(card);
      const hasDependencies = card.dependencies && card.dependencies.length > 0;
      const hasDependent =
        dependentCards[card.id] && dependentCards[card.id].length > 0;

      // Calculate if this node is blocking any other nodes
      const isBlockingOthers =
        dependentCards[card.id]?.some(
          (dep) => !dep.Column?.isCompletionColumn
        ) || false;

      // Debug logging for blocked status
      if (isBlocked) {
        console.log(`🚫 Card "${card.title}" is BLOCKED:`, {
          cardId: card.id,
          hasDependencies,
          dependencies: cardDependencies[card.id],
          isCompleted,
        });
      }

      return {
        id: card.id,
        card,
        x,
        y,
        isCompleted,
        isBlocked,
        hasDependencies,
        hasDependent,
        isBlockingOthers,
      };
    });

    // Don't filter nodes - render all nodes but hide completed ones with CSS
    // This prevents position shifts when toggling filters
    const newNodes = allNodes;

    // Create edges from dependencies
    const newEdges = [];
    const edgeSet = new Set(); // Track unique edges to prevent duplicates

    console.log("🔗 Creating edges. Total nodes:", newNodes.length);
    console.log(
      "🔗 Card dependencies available:",
      Object.keys(cardDependencies).length
    );

    // Iterate through all nodes
    newNodes.forEach((sourceNode) => {
      // Use cardDependencies state which is fetched earlier
      const cardDepsData = cardDependencies[sourceNode.id] || [];

      if (cardDepsData.length > 0) {
        console.log(
          `Processing ${cardDepsData.length} dependencies for card ${sourceNode.card.title}:`,
          cardDepsData
        );
      }

      cardDepsData.forEach((depInfo) => {
        console.log("Dependency info structure:", depInfo);

        // Use targetCardId from the API response
        const targetId = depInfo.targetCardId;

        // Create unique edge ID
        const edgeId = `${sourceNode.id}-${depInfo.type || "FS"}-${targetId}`;

        // Check for duplicate edges
        if (edgeSet.has(edgeId)) {
          console.warn(`⚠️ Duplicate edge detected: ${edgeId}`);
          return;
        }

        // Find target node and create edge
        const targetNode = newNodes.find((n) => n.id === targetId);
        if (targetNode) {
          const edge = {
            id: edgeId, // Unique edge ID including type
            source: sourceNode.id,
            target: targetId, // Use targetCardId from fetched data
            type: depInfo.type || "FS", // Include type if available
            lag: depInfo.lag || 0, // Include lag if available
            isBlocking: !targetNode.isCompleted, // Blocking if the dependency (target) is not completed
          };
          console.log("✅ Created edge:", edge);
          edgeSet.add(edgeId);
          newEdges.push(edge);
        } else {
          console.warn(`⚠️ Target node not found for dependency ${targetId}`);
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);

    // Debug: Log edges and dependencies
    console.log("Network View Debug:", {
      nodesCount: newNodes.length,
      edgesCount: newEdges.length,
      cardDependencies,
      edges: newEdges,
    });
  }, [
    cards,
    searchTerm,
    filterConfig,
    cardDependencies,
    dependentCards,
    columns,
    isCardBlocked,
    containerSize,
  ]);

  // Handle zoom in and out
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  };

  // Handle pan (drag) operations
  const handleMouseDown = (e) => {
    if (e.button === 0) {
      // Left mouse button
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }

    // Track mouse position for dependency linking line
    if (dependencyMode.active && svgRef.current) {
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      // Convert screen coordinates to SVG coordinates
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setLinkingMousePos({ x, y });
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  // Handle card selection and dependency linking
  const handleNodeClick = (node, event) => {
    event.stopPropagation(); // Prevent background click

    // If clicking the source card while in dependency mode, cancel
    if (
      dependencyMode.active &&
      dependencyMode.sourceNodeId &&
      dependencyMode.sourceNodeId === node.id
    ) {
      setDependencyMode({ active: false, sourceNodeId: null });
      return;
    }

    if (
      dependencyMode.active &&
      dependencyMode.sourceNodeId &&
      dependencyMode.sourceNodeId !== node.id
    ) {
      // Check if this node can be connected
      if (!canConnectToNode(node.id)) {
        const sourceId = dependencyMode.sourceNodeId;
        const targetId = node.id;
        const type = pendingDependency.type || "FS";

        // Determine the specific reason and show appropriate notification
        if (sourceId === targetId) {
          showNotification(
            "Cannot create a dependency to the same card",
            "error"
          );
        } else if (dependencyAlreadyExists(sourceId, targetId, type)) {
          showNotification(
            "This dependency connection already exists",
            "error"
          );
        } else if (wouldCreateCircularDependency(sourceId, targetId)) {
          showNotification("Cannot create circular dependency", "error");
        }
        return;
      }

      // Complete dependency link
      handleAddDependency(dependencyMode.sourceNodeId, node.id);
      setDependencyMode({ active: false, sourceNodeId: null });
      event.stopPropagation(); // Prevent opening card detail modal
    } else {
      // Normal click: select card
      setSelectedCard(node.card);
      setSelectedNode(node.id); // Keep track of selected node
    }
  };

  // Start dependency linking mode - show config modal first
  const startDependencyLink = (nodeId, event) => {
    event.stopPropagation(); // Prevent card click
    setPendingDependency({
      sourceNodeId: nodeId,
      type: "FS",
      lag: 0,
    });
    setShowDependencyConfig(true);
  };

  // Confirm dependency configuration and start linking
  const confirmDependencyConfig = () => {
    setShowDependencyConfig(false);
    setDependencyMode({
      active: true,
      sourceNodeId: pendingDependency.sourceNodeId,
    });

    // Initialize linking mouse position to source node position to prevent initial jump
    const sourceNode = nodes.find(
      (n) => n.id === pendingDependency.sourceNodeId
    );
    if (sourceNode) {
      setLinkingMousePos({ x: sourceNode.x, y: sourceNode.y });
    }
  };

  // Cancel dependency linking mode and deselect edge
  const cancelDependencyLink = (event) => {
    // Check if clicked on a card or edge by looking for the node-group class
    const clickedElement = event.target;
    const isCard =
      clickedElement.closest && clickedElement.closest(".node-group");

    // Only cancel if NOT clicking on a card
    if (!isCard) {
      if (dependencyMode.active) {
        setDependencyMode({ active: false, sourceNodeId: null });
      }
      setSelectedEdge(null); // Deselect any selected edge
    }
  };

  // Check if adding a dependency would create a circular dependency
  const wouldCreateCircularDependency = (sourceId, targetId) => {
    // Check if there's already a path from targetId to sourceId
    const visited = new Set();
    const queue = [targetId];

    while (queue.length > 0) {
      const currentId = queue.shift();

      if (currentId === sourceId) {
        // Found a path from target back to source - would create a cycle
        return true;
      }

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Add all cards that currentId depends on to the queue
      const dependencies = cardDependencies[currentId] || [];
      dependencies.forEach((dep) => {
        if (dep.targetCardId && !visited.has(dep.targetCardId)) {
          queue.push(dep.targetCardId);
        }
      });
    }

    return false;
  };

  // Check if a dependency already exists between two cards with the given type
  const dependencyAlreadyExists = (sourceId, targetId, type) => {
    const deps = cardDependencies[sourceId] || [];
    return deps.some(
      (dep) => dep.targetCardId === targetId && dep.type === type
    );
  };

  // Check if a node can be a valid target for dependency linking
  const canConnectToNode = (nodeId) => {
    if (!dependencyMode.active || !dependencyMode.sourceNodeId) return true;

    const sourceId = dependencyMode.sourceNodeId;
    const targetId = nodeId;
    const type = pendingDependency.type || "FS";

    // Can't connect to self
    if (sourceId === targetId) return false;

    // Check for circular dependency
    if (wouldCreateCircularDependency(sourceId, targetId)) return false;

    // Check for duplicate
    if (dependencyAlreadyExists(sourceId, targetId, type)) return false;

    return true;
  };

  // Add dependency action
  const handleAddDependency = async (sourceId, targetId) => {
    // Check for circular dependency
    if (wouldCreateCircularDependency(sourceId, targetId)) {
      showNotification(
        "Cannot create dependency: Would create a circular dependency",
        "error"
      );
      setDependencyMode({ active: false, sourceNodeId: null });
      return;
    }

    // Optimistically add the new edge to state immediately BEFORE the API call
    const targetNode = nodes.find((n) => n.id === targetId);
    const newEdge = {
      id: `${sourceId}-${pendingDependency.type}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: pendingDependency.type,
      lag: pendingDependency.lag || 0,
      isBlocking: !targetNode.card.isCompleted,
    };

    setEdges((prev) => [...prev, newEdge]);

    // Update cardDependencies state to include the new dependency
    setCardDependencies((prev) => ({
      ...prev,
      [sourceId]: [
        ...(prev[sourceId] || []),
        {
          targetCardId: targetId,
          type: pendingDependency.type,
          lag: pendingDependency.lag || 0,
        },
      ],
    }));

    // End dependency mode immediately so temporary line disappears and permanent line shows
    setDependencyMode({ active: false, sourceNodeId: null });

    // Now make the API call in the background
    try {
      const result = await addDependency(
        sourceId,
        targetId,
        pendingDependency.type,
        pendingDependency.lag
      );
      console.log("Dependency added:", result);
      showNotification("Dependency added successfully.", "success");

      // Refresh the card detail modal if it's open for either source or target card
      if (
        selectedCard &&
        (selectedCard.id === sourceId || selectedCard.id === targetId)
      ) {
        // Trigger a refresh by updating the selectedCard with a new timestamp
        setSelectedCard((prev) => ({
          ...prev,
          dependenciesUpdated: Date.now(), // This will trigger CardDetailModal to refresh
        }));
      }
    } catch (error) {
      console.error("Error adding dependency:", error);
      showNotification(`Failed to add dependency: ${error.message}`, "error");

      // Rollback the optimistic update on error
      setEdges((prev) => prev.filter((e) => e.id !== newEdge.id));
      setCardDependencies((prev) => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).filter(
          (dep) =>
            dep.targetCardId !== targetId || dep.type !== pendingDependency.type
        ),
      }));
    }
  };

  // Remove dependency action
  const handleRemoveDependency = async (edge, event) => {
    event.stopPropagation(); // Prevent other clicks
    // Find node titles for confirmation message
    const sourceTitle =
      nodes.find((n) => n.id === edge.source)?.card.title || "Unknown Task";
    const targetTitle =
      nodes.find((n) => n.id === edge.target)?.card.title || "Unknown Task";

    if (
      window.confirm(
        `Remove dependency from task "${sourceTitle}" to task "${targetTitle}"?`
      )
    ) {
      try {
        console.log(
          `Attempting to remove dependency: ${edge.source} no longer depends on ${edge.target}`
        );
        await removeDependency(edge.source, edge.target);
        console.log("Dependency removed");
        // Refresh dependencies locally (or refetch)
        setCardDependencies((prev) => {
          const updatedDeps = { ...prev };
          if (updatedDeps[edge.source]) {
            updatedDeps[edge.source] = updatedDeps[edge.source].filter(
              (dep) => dep.targetCardId !== edge.target
            );
          }
          return updatedDeps;
        });
        // Update edges state
        setEdges((prev) => prev.filter((e) => e.id !== edge.id));
        showNotification("Dependency removed successfully.", "success"); // Show success notification
      } catch (error) {
        console.error("Error removing dependency:", error);
        showNotification(
          `Failed to remove dependency: ${error.message}`,
          "error"
        ); // Show error notification
      }
    }
  };

  // Toggle filter settings
  const toggleCompletedFilter = () => {
    setFilterConfig((prev) => ({
      ...prev,
      showCompleted: !prev.showCompleted,
    }));
  };

  const toggleBlockersFilter = () => {
    setFilterConfig((prev) => ({
      ...prev,
      highlightBlockers: !prev.highlightBlockers,
    }));
  };

  // Get node color based on status - Enhanced colors
  const getNodeColor = (node) => {
    const progress = node.card.progress || 0;

    // Color based on progress percentage - Lighter, more vibrant colors
    if (progress === 0) {
      // Not started - Lighter Gray
      return "bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-500 dark:to-slate-600 midnight:from-slate-600 midnight:to-slate-700";
    } else if (progress < 25) {
      // Early progress (1-24%) - Softer Red/Rose
      return "bg-gradient-to-br from-rose-400 to-rose-500 dark:from-rose-500 dark:to-rose-600 midnight:from-rose-600 midnight:to-rose-700";
    } else if (progress < 50) {
      // Low-medium progress (25-49%) - Brighter Amber/Orange
      return "bg-gradient-to-br from-orange-400 to-amber-500 dark:from-orange-500 dark:to-amber-600 midnight:from-orange-600 midnight:to-amber-700";
    } else if (progress < 75) {
      // Medium progress (50-74%) - Cyan/Teal
      return "bg-gradient-to-br from-cyan-400 to-teal-500 dark:from-cyan-500 dark:to-teal-600 midnight:from-cyan-600 midnight:to-teal-700";
    } else if (progress < 100) {
      // High progress (75-99%) - Vibrant Purple/Violet
      return "bg-gradient-to-br from-violet-400 to-purple-500 dark:from-violet-500 dark:to-purple-600 midnight:from-violet-600 midnight:to-purple-700";
    } else {
      // Completed (100%) - Brighter Emerald Green
      return "bg-gradient-to-br from-emerald-400 to-green-500 dark:from-emerald-500 dark:to-green-600 midnight:from-emerald-600 midnight:to-green-700";
    }
  };
  // Get edge color based on dependency type
  const getDependencyTypeColor = (type) => {
    switch (type) {
      case "FS": // Finish-to-Start (most common)
        return {
          normal:
            "stroke-blue-500 dark:stroke-blue-400 midnight:stroke-blue-300",
          hover:
            "stroke-blue-700 dark:stroke-blue-600 midnight:stroke-blue-500",
          marker: "url(#arrow-fs)",
        };
      case "FF": // Finish-to-Finish
        return {
          normal:
            "stroke-purple-500 dark:stroke-purple-400 midnight:stroke-purple-300",
          hover:
            "stroke-purple-700 dark:stroke-purple-600 midnight:stroke-purple-500",
          marker: "url(#arrow-ff)",
        };
      case "SS": // Start-to-Start
        return {
          normal:
            "stroke-emerald-500 dark:stroke-emerald-400 midnight:stroke-emerald-300",
          hover:
            "stroke-emerald-700 dark:stroke-emerald-600 midnight:stroke-emerald-500",
          marker: "url(#arrow-ss)",
        };
      case "SF": // Start-to-Finish (rare)
        return {
          normal:
            "stroke-amber-500 dark:stroke-amber-400 midnight:stroke-amber-300",
          hover:
            "stroke-amber-700 dark:stroke-amber-600 midnight:stroke-amber-500",
          marker: "url(#arrow-sf)",
        };
      default:
        return {
          normal:
            "stroke-gray-500 dark:stroke-gray-400 midnight:stroke-gray-300",
          hover:
            "stroke-gray-700 dark:stroke-gray-600 midnight:stroke-gray-500",
          marker: "url(#arrow-gray)",
        };
    }
  };

  // Get edge color based on status and interactions - Enhanced styling
  const getEdgeColor = (edge) => {
    const isHovered = hoveredEdge === edge.id;
    const isSelected = selectedEdge === edge.id;
    // Highlight edges connected to the selected node or the node being hovered
    const isRelatedToSelected =
      selectedNode &&
      (edge.source === selectedNode || edge.target === selectedNode);
    const isRelatedToHovered =
      hoveredNode &&
      (edge.source === hoveredNode || edge.target === hoveredNode);

    // Get colors based on dependency type
    const typeColors = getDependencyTypeColor(edge.type);

    if (isSelected) return typeColors.hover;
    if (isHovered) return typeColors.hover;
    if (isRelatedToSelected) return typeColors.hover;
    if (isRelatedToHovered) return typeColors.hover;
    if (edge.isBlocking && filterConfig.highlightBlockers)
      return "stroke-red-600 dark:stroke-red-500 midnight:stroke-red-400";
    return typeColors.normal;
  };

  // Get stroke dash pattern based on dependency type for better identification
  const getEdgeStrokePattern = (type) => {
    switch (type) {
      case "FS": // Finish-to-Start - solid line (most common)
        return "0";
      case "FF": // Finish-to-Finish - dashed
        return "8,4";
      case "SS": // Start-to-Start - two long dashes, two dots
        return "12,3,12,6,2,2,2,6";
      case "SF": // Start-to-Finish - dash-dot
        return "8,4,2,4";
      default:
        return "0";
    }
  };

  // Get edge markers (both start and end) based on status and interactions
  const getEdgeMarkers = (edge, isHighlighted = false) => {
    // Determine if we should use large marker
    const useLarge =
      isHighlighted ||
      selectedEdge === edge.id ||
      hoveredEdge === edge.id ||
      (hoveredNode &&
        (edge.source === hoveredNode || edge.target === hoveredNode));

    const suffix = useLarge ? "-lg" : "";
    let baseType = "";

    if (edge.isBlocking && filterConfig.highlightBlockers) {
      baseType = "red";
    } else {
      // Get marker based on dependency type
      switch (edge.type) {
        case "FS":
          baseType = "fs";
          break;
        case "FF":
          baseType = "ff";
          break;
        case "SS":
          baseType = "ss";
          break;
        case "SF":
          baseType = "sf";
          break;
        default:
          baseType = "gray";
      }
    }

    return {
      start: `url(#arrow-${baseType}-start${suffix})`,
      end: `url(#arrow-${baseType}${suffix})`,
    };
  };

  // Auto-dismiss notification
  useEffect(() => {
    if (notification.visible) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, visible: false }));
      }, 5000); // Hide after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [notification.visible]);

  // Function to show notifications
  const showNotification = (message, type = "info") => {
    setNotification({ visible: true, message, type });
  };

  // Loading state
  if (isLoading || isLoadingDependencies) {
    return <NetworkViewSkeleton />;
  }
  // Error state
  if (error) {
    return (
      <div
        className={`h-screen w-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950 text-red-500 dark:text-red-400 midnight:text-red-300 overflow-hidden ${soraFontBase}`}
      >
        <div className="text-center p-8">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Error Loading Data</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Network View Beta Message
  // return (
  //   <div
  //     className={`h-screen w-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden ${soraFontBase}`}
  //   >
  //     <div className="text-center max-w-lg mx-auto px-8">
  //       <div className="relative">
  //         <Network className="w-24 h-24 mx-auto mb-6 text-gray-300 dark:text-gray-700 midnight:text-gray-800 animate-pulse" />
  //         <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs px-2 py-1 rounded-full font-medium">
  //           Soon™
  //         </div>
  //       </div>

  //       <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 midnight:text-gray-100 mb-4">
  //         🚧 Network Magic Loading... 🚧
  //       </h2>

  //       <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 midnight:from-blue-950/20 midnight:to-indigo-950/20 rounded-xl p-6 mb-6 border border-blue-100 dark:border-blue-800 midnight:border-blue-900">
  //         <p className="text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-3 leading-relaxed">
  //           <span className="font-semibold">Plot twist:</span> We're busy
  //           teaching our algorithms how to untangle spaghetti code... I mean,
  //           task dependencies! 🍝
  //         </p>
  //         <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
  //           Right now this view shows your tasks without their fancy connection
  //           lines. Soon you'll see the beautiful web of "this depends on that"
  //           in all its chaotic glory!
  //         </p>
  //       </div>

  //       <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
  //         <div className="flex items-center gap-2">
  //           <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
  //           <span>Dependencies coming soon</span>
  //         </div>
  //         <div className="flex items-center gap-2">
  //           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
  //           <span>Network visualization in progress</span>
  //         </div>
  //       </div>

  //       <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-600 mt-6 italic">
  //         Beta life: Move fast, visualize dependencies later 🎢
  //       </p>
  //     </div>
  //   </div>
  // );

  // No project selected
  if (!selectedProject?.id) {
    return (
      <div
        className={`h-screen w-full flex items-center justify-center bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden ${soraFontBase}`}
      >
        <div className="text-center">
          <Network className="w-20 h-20 mx-auto mb-4 text-gray-300 dark:text-gray-700 midnight:text-gray-800" />
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-200 mb-2">
            No Project Selected
          </h2>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-2">
            Please select a project to view its network diagram.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`h-full w-full flex flex-col bg-white dark:bg-gray-900 midnight:bg-gray-950 ${soraFontBase} overflow-hidden relative`}
      style={{ overflow: "hidden", maxHeight: "100vh", userSelect: "none" }}
    >
      {/* Notification Banner */}
      {notification.visible && (
        <div
          className={`absolute top-4 right-4 px-4 py-2 rounded-lg shadow-md text-sm z-[100] flex items-center gap-3 w-auto
            ${
              notification.type === "success"
                ? "bg-green-100 dark:bg-green-900/90 midnight:bg-green-950/90 text-green-800 dark:text-green-300 midnight:text-green-200 border border-green-300 dark:border-green-700"
                : ""
            }
            ${
              notification.type === "error"
                ? "bg-red-100 dark:bg-red-900/90 midnight:bg-red-950/90 text-red-800 dark:text-red-300 midnight:text-red-200 border border-red-300 dark:border-red-700"
                : ""
            }
            ${
              notification.type === "info"
                ? "bg-blue-100 dark:bg-blue-900/90 midnight:bg-blue-950/90 text-blue-800 dark:text-blue-300 midnight:text-blue-200 border border-blue-300 dark:border-blue-700"
                : ""
            }
          `}
        >
          <span className="whitespace-nowrap">{notification.message}</span>
          <button
            onClick={() =>
              setNotification((prev) => ({
                ...prev,
                visible: false,
              }))
            }
            className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="relative z-20 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-100 dark:border-gray-700 midnight:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-6">
          {/* Left section - Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-600" />
            <input
              type="text"
              className="pl-10 pr-4 py-2.5 w-80 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-200 text-sm placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 transition-all duration-200"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Right section - Filters and Controls */}
          <div className="flex items-center gap-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-hidden">
              {/* Show/Hide Completed */}
              <button
                onClick={toggleCompletedFilter}
                className={`px-3 py-1.5 text-xs font-medium border rounded-full transition-all duration-200 whitespace-nowrap ${
                  filterConfig.showCompleted
                    ? "bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300 border-emerald-200 dark:border-emerald-700 midnight:border-emerald-800"
                    : "bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3" />
                  {filterConfig.showCompleted
                    ? "Show Completed"
                    : "Hide Completed"}
                </div>
              </button>

              {/* Highlight Blockers */}
              <button
                onClick={toggleBlockersFilter}
                className={`px-3 py-1.5 text-xs font-medium border rounded-full transition-all duration-200 whitespace-nowrap ${
                  filterConfig.highlightBlockers
                    ? "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 text-red-700 dark:text-red-400 midnight:text-red-300 border-red-200 dark:border-red-700 midnight:border-red-800"
                    : "bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" />
                  Highlight Blockers
                </div>
              </button>

            </div>

            {/* Zoom Controls */}
            <div className="flex items-center border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={handleZoomOut}
                className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 midnight:text-gray-500 midnight:hover:bg-gray-800 transition-colors"
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-x border-gray-200 dark:border-gray-600 midnight:border-gray-700 min-w-16 text-center">
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 midnight:text-gray-500 midnight:hover:bg-gray-800 transition-colors"
                disabled={zoom >= 2}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Pan Reset Button */}
            <button
              onClick={() => setPan({ x: 0, y: 0 })}
              className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 midnight:text-gray-500 midnight:hover:bg-gray-800 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg transition-colors"
              title="Reset pan position"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>

            {/* Create Task Button */}
            <button
              onClick={() => setShowCreateTask(true)}
              className="px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-black dark:text-indigo-400 midnight:text-indigo-300 text-sm font-medium flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Create Task
            </button>

            {/* Dependency Legend Info Button */}
            <div className="relative">
              <button
                ref={legendButtonRef}
                onClick={() => {
                  if (showLegendDropdown) {
                    handleCloseLegend();
                  } else {
                    setShowLegendDropdown(true);
                  }
                }}
                className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 midnight:text-gray-500 midnight:hover:bg-gray-800 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg transition-colors"
                title="Dependency Legend"
              >
                <Info className="w-4 h-4" />
              </button>

              {/* Legend Dropdown */}
              {showLegendDropdown && (
                <div
                  ref={legendDropdownRef}
                  className={`absolute top-full right-0 mt-2 z-50 w-[280px] max-h-[82vh] overflow-y-auto rounded-xl shadow-[0_22px_50px_-25px_rgba(15,23,42,0.55)] backdrop-blur-xl border bg-white/95 dark:bg-gray-800/95 midnight:bg-gray-900/95 border-white/60 dark:border-gray-700/60 midnight:border-gray-800/60 ${
                    isClosingLegend ? "animate-fadeOutUp" : "animate-fadeInDown"
                  }`}
                  style={{
                    animation: isClosingLegend
                      ? "fadeOutUp 0.2s ease-in forwards"
                      : "fadeInDown 0.24s ease-out forwards",
                  }}
                >
                  <div className="p-5 text-xs">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                      <Network className="w-5 h-5 text-indigo-500 dark:text-indigo-400 midnight:text-indigo-300" />
                      <h3 className="font-bold text-gray-800 dark:text-gray-100 midnight:text-gray-50 text-sm">
                        Dependency Legend
                      </h3>
                    </div>

                    {/* Dependency Type Legend */}
                    <div className="mb-4">
                      <div className="font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-100 mb-2.5 text-xs">
                        Connection Types
                      </div>
                      <ul className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 space-y-2.5">
                        <li className="flex items-center gap-3">
                          <svg width="28" height="12" className="flex-shrink-0">
                            <line
                              x1="0"
                              y1="6"
                              x2="28"
                              y2="6"
                              className="stroke-blue-500 stroke-[3]"
                              strokeDasharray="0"
                            />
                          </svg>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100 text-[11px]">
                              Finish to Start
                            </div>
                          </div>
                        </li>
                        <li className="flex items-center gap-3">
                          <svg width="28" height="12" className="flex-shrink-0">
                            <line
                              x1="0"
                              y1="6"
                              x2="28"
                              y2="6"
                              className="stroke-purple-500 stroke-[3]"
                              strokeDasharray="8,4"
                            />
                          </svg>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100 text-[11px]">
                              Finish to Finish
                            </div>
                          </div>
                        </li>
                        <li className="flex items-center gap-3">
                          <svg width="28" height="12" className="flex-shrink-0">
                            <line
                              x1="0"
                              y1="6"
                              x2="28"
                              y2="6"
                              className="stroke-emerald-500 stroke-[3]"
                              strokeDasharray="2,4"
                            />
                          </svg>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100 text-[11px]">
                              Start to Start
                            </div>
                          </div>
                        </li>
                        <li className="flex items-center gap-3">
                          <svg width="28" height="12" className="flex-shrink-0">
                            <line
                              x1="0"
                              y1="6"
                              x2="28"
                              y2="6"
                              className="stroke-amber-500 stroke-[3]"
                              strokeDasharray="8,4,2,4"
                            />
                          </svg>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100 text-[11px]">
                              Start to Finish
                            </div>
                          </div>
                        </li>
                      </ul>
                    </div>

                    {/* Status Indicators */}
                    <div className="py-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                      <div className="font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-100 mb-2.5 text-xs">
                        Status Indicators
                      </div>
                      <ul className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 space-y-2">
                        <li className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded bg-red-500/90 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[7px] font-bold">
                              !
                            </span>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              BLOCKER
                            </span>{" "}
                            - Blocking other tasks
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Blocked Task
                            </span>{" "}
                            - Has incomplete dependencies
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <svg width="28" height="12" className="flex-shrink-0">
                            <line
                              x1="0"
                              y1="6"
                              x2="28"
                              y2="6"
                              className="stroke-red-600 stroke-[3]"
                              strokeDasharray="0"
                            />
                          </svg>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Red connection
                            </span>{" "}
                            - Blocking dependency
                          </div>
                        </li>
                      </ul>
                    </div>

                    {/* Priority Indicators */}
                    <div className="py-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                      <div className="font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-100 mb-2.5 text-xs">
                        Priority Indicators
                      </div>
                      <ul className="text-gray-600 dark:text-gray-400 midnight:text-gray-400 space-y-2">
                        <li className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full bg-red-300 flex-shrink-0 shadow-sm"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Red
                            </span>{" "}
                            - High Priority
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full bg-yellow-300 flex-shrink-0 shadow-sm"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Yellow
                            </span>{" "}
                            - Medium Priority
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full bg-blue-300 flex-shrink-0 shadow-sm"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Blue
                            </span>{" "}
                            - Low Priority
                          </div>
                        </li>
                      </ul>
                    </div>

                    {/* Card Colors (Progress) */}
                    <div className="py-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                      <div className="font-semibold text-gray-700 dark:text-gray-200 midnight:text-gray-100 mb-2.5 text-xs">
                        Card Colours (Progress State)
                      </div>
                      <ul className="text-gray-600 dark:text-gray-400 space-y-2">
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-gray-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Gray
                            </span>{" "}
                            - 0% (Not started)
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-red-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Red
                            </span>{" "}
                            - 1-24% (Early progress)
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-amber-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Amber
                            </span>{" "}
                            - 25-49% (Low-medium)
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-cyan-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Cyan
                            </span>{" "}
                            - 50-74% (Medium)
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-indigo-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Indigo
                            </span>{" "}
                            - 75-99% (High progress)
                          </div>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <div className="w-4 h-4 bg-emerald-500 flex-shrink-0 rounded"></div>
                          <div className="text-[10px]">
                            <span className="font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                              Green
                            </span>{" "}
                            - 100% (Completed)
                          </div>
                        </li>
                      </ul>
                    </div>

                    {/* Quick Tips */}
                    <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                      <div className="text-[9px] text-gray-500 dark:text-gray-400  midnight:text-gray-300 space-y-1.5">
                        <p>
                          💡 <span className="font-medium">Hover</span> over
                          connections for details
                        </p>
                        <p>
                          💡 <span className="font-medium">Click +</span> on a
                          task to add dependencies
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Network Diagram */}
      <div
        className="flex-1 h-full overflow-hidden bg-gray-50/30 dark:bg-gray-800/30 midnight:bg-gray-900/30 relative z-0" // Enhanced background
        ref={networkRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={cancelDependencyLink} // Cancel linking if clicking background
        style={{
          cursor: dependencyMode.active
            ? "crosshair"
            : dragging
            ? "grabbing"
            : "grab",
          overflow: "hidden",
        }} // Change cursor for linking mode
      >
        {/* Empty state */}
        {cards.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
            <div className="text-center max-w-sm px-6">
              {/* Decorative faded nodes */}
              <div className="relative w-48 h-32 mx-auto mb-6">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/25 midnight:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 midnight:border-indigo-900/30" />
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/25 midnight:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 midnight:border-emerald-900/30" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/25 midnight:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 midnight:border-amber-900/30" />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 192 128" fill="none">
                  <path d="M 56 64 Q 96 30 96 32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
                  <path d="M 96 40 Q 136 55 136 64" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
                </svg>
                <Network className="absolute inset-0 m-auto w-7 h-7 text-gray-300 dark:text-gray-600 midnight:text-gray-700" />
              </div>
              <h3 className="text-base font-semibold text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-1">
                No tasks yet
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 midnight:text-gray-600 leading-relaxed">
                Create cards in your project to start mapping out task dependencies here.
              </p>
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {" "}
          {/* Define markers for arrows - Enhanced styling with dependency types */}
          <defs>
            {/* Normal size end markers */}
            <marker
              id="arrow-gray"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-gray-500 dark:fill-gray-400 midnight:fill-gray-500"
              />
            </marker>
            <marker
              id="arrow-red"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-red-600 dark:fill-red-500 midnight:fill-red-400"
              />
            </marker>
            <marker
              id="arrow-fs"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-blue-500 dark:fill-blue-400 midnight:fill-blue-300"
              />
            </marker>
            <marker
              id="arrow-ff"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-purple-500 dark:fill-purple-400 midnight:fill-purple-300"
              />
            </marker>
            <marker
              id="arrow-ss"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-emerald-500 dark:fill-emerald-400 midnight:fill-emerald-300"
              />
            </marker>
            <marker
              id="arrow-sf"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-amber-500 dark:fill-amber-400 midnight:fill-amber-300"
              />
            </marker>

            {/* Large/highlighted end markers - darker colors for hover state */}
            <marker
              id="arrow-gray-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-gray-700 dark:fill-gray-600 midnight:fill-gray-500"
              />
            </marker>
            <marker
              id="arrow-red-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-red-600 dark:fill-red-500 midnight:fill-red-400"
              />
            </marker>
            <marker
              id="arrow-fs-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-blue-700 dark:fill-blue-600 midnight:fill-blue-500"
              />
            </marker>
            <marker
              id="arrow-ff-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-purple-700 dark:fill-purple-600 midnight:fill-purple-500"
              />
            </marker>
            <marker
              id="arrow-ss-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-emerald-700 dark:fill-emerald-600 midnight:fill-emerald-500"
              />
            </marker>
            <marker
              id="arrow-sf-lg"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-amber-700 dark:fill-amber-600 midnight:fill-amber-500"
              />
            </marker>

            {/* Start markers (pointing in same direction as flow) */}
            {/* Normal size start markers */}
            <marker
              id="arrow-gray-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-gray-500 dark:fill-gray-400 midnight:fill-gray-500"
              />
            </marker>
            <marker
              id="arrow-red-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-red-600 dark:fill-red-500 midnight:fill-red-400"
              />
            </marker>
            <marker
              id="arrow-fs-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-blue-500 dark:fill-blue-400 midnight:fill-blue-300"
              />
            </marker>
            <marker
              id="arrow-ff-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-purple-500 dark:fill-purple-400 midnight:fill-purple-300"
              />
            </marker>
            <marker
              id="arrow-ss-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-emerald-500 dark:fill-emerald-400 midnight:fill-emerald-300"
              />
            </marker>
            <marker
              id="arrow-sf-start"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="12"
              markerHeight="12"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-amber-500 dark:fill-amber-400 midnight:fill-amber-300"
              />
            </marker>

            {/* Large start markers - darker colors for hover state */}
            <marker
              id="arrow-gray-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-gray-700 dark:fill-gray-600 midnight:fill-gray-500"
              />
            </marker>
            <marker
              id="arrow-red-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-red-600 dark:fill-red-500 midnight:fill-red-400"
              />
            </marker>
            <marker
              id="arrow-fs-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-blue-700 dark:fill-blue-600 midnight:fill-blue-500"
              />
            </marker>
            <marker
              id="arrow-ff-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-purple-700 dark:fill-purple-600 midnight:fill-purple-500"
              />
            </marker>
            <marker
              id="arrow-ss-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-emerald-700 dark:fill-emerald-600 midnight:fill-emerald-500"
              />
            </marker>
            <marker
              id="arrow-sf-start-lg"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="18"
              markerHeight="18"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 z"
                className="fill-amber-700 dark:fill-amber-600 midnight:fill-amber-500"
              />
            </marker>
          </defs>
          {/* Main group for zoom and pan */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Draw edges first - all edges render behind cards */}
            {(() => {
              // ============================================================
              // SIMPLE ORTHOGONAL EDGE ROUTING
              // Non-overlapping paths with perpendicular arrows at card edges
              // ============================================================

              const CARD_HALF_WIDTH = 110;
              const CARD_HALF_HEIGHT = 50;
              const PORT_SPACING = 16; // Spacing between connection ports

              // Group edges by their source-target pair for unique routing
              const edgePairMap = new Map(); // "sourceId-targetId" -> edges[]
              edges.forEach((edge) => {
                const pairKey = `${edge.source}-${edge.target}`;
                if (!edgePairMap.has(pairKey)) {
                  edgePairMap.set(pairKey, []);
                }
                edgePairMap.get(pairKey).push(edge);
              });

              // Pre-calculate routing info for all edges
              const edgeRoutingInfo = new Map();
              const portCountByNodeEdge = new Map(); // "nodeId-edge" -> count

              // First pass: determine edge directions and count ports
              edges.forEach((edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                const targetNode = nodes.find((n) => n.id === edge.target);
                if (!sourceNode || !targetNode) return;

                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                // Choose exit/entry edges based on angle
                let exitEdge, entryEdge;
                if (angle >= -45 && angle < 45) {
                  exitEdge = "right"; entryEdge = "left";
                } else if (angle >= 45 && angle < 135) {
                  exitEdge = "bottom"; entryEdge = "top";
                } else if (angle >= 135 || angle < -135) {
                  exitEdge = "left"; entryEdge = "right";
                } else {
                  exitEdge = "top"; entryEdge = "bottom";
                }

                // Count ports per node edge
                const sourceKey = `${edge.source}-${exitEdge}`;
                const targetKey = `${edge.target}-${entryEdge}`;
                portCountByNodeEdge.set(sourceKey, (portCountByNodeEdge.get(sourceKey) || 0) + 1);
                portCountByNodeEdge.set(targetKey, (portCountByNodeEdge.get(targetKey) || 0) + 1);

                edgeRoutingInfo.set(edge.id, { exitEdge, entryEdge, sourceNode, targetNode, sourceKey, targetKey });
              });

              // Second pass: assign port indices
              const portIndexByNodeEdge = new Map(); // "nodeId-edge" -> next index
              edges.forEach((edge) => {
                const info = edgeRoutingInfo.get(edge.id);
                if (!info) return;

                const { sourceKey, targetKey } = info;

                // Get port index for source
                const sourcePortIndex = portIndexByNodeEdge.get(sourceKey) || 0;
                portIndexByNodeEdge.set(sourceKey, sourcePortIndex + 1);
                info.sourcePortIndex = sourcePortIndex;
                info.sourcePortCount = portCountByNodeEdge.get(sourceKey);

                // Get port index for target
                const targetPortIndex = portIndexByNodeEdge.get(targetKey) || 0;
                portIndexByNodeEdge.set(targetKey, targetPortIndex + 1);
                info.targetPortIndex = targetPortIndex;
                info.targetPortCount = portCountByNodeEdge.get(targetKey);

                // Get index within same source-target pair
                const pairKey = `${edge.source}-${edge.target}`;
                const pairEdges = edgePairMap.get(pairKey) || [];
                info.pairIndex = pairEdges.indexOf(edge);
                info.pairCount = pairEdges.length;
              });

              // Sort for rendering order
              const sortedEdges = [...edges].sort((a, b) => {
                const aHi = selectedEdge === a.id || hoveredEdge === a.id ||
                  (hoveredNode && (a.source === hoveredNode || a.target === hoveredNode));
                const bHi = selectedEdge === b.id || hoveredEdge === b.id ||
                  (hoveredNode && (b.source === hoveredNode || b.target === hoveredNode));
                return aHi === bHi ? 0 : aHi ? 1 : -1;
              });

              return sortedEdges.map((edge) => {
                const info = edgeRoutingInfo.get(edge.id);
                if (!info) return null;

                const { sourceNode, targetNode, exitEdge, entryEdge,
                        sourcePortIndex, sourcePortCount, targetPortIndex, targetPortCount,
                        pairIndex, pairCount } = info;

                const sx = sourceNode.x, sy = sourceNode.y;
                const tx = targetNode.x, ty = targetNode.y;
                if (isNaN(sx) || isNaN(sy) || isNaN(tx) || isNaN(ty)) return null;

                // Calculate port offset: distribute connections along edge
                const getPortOffset = (index, count) => {
                  if (count <= 1) return 0;
                  const totalSpread = Math.min(70, (count - 1) * PORT_SPACING);
                  return (index - (count - 1) / 2) * (totalSpread / (count - 1));
                };

                const sourcePortOffset = getPortOffset(sourcePortIndex, sourcePortCount);
                const targetPortOffset = getPortOffset(targetPortIndex, targetPortCount);

                // Arrow length - line ends at arrow base, arrow extends to card edge
                const ARROW_LENGTH = 12;

                // Calculate exit point - offset OUTWARD by arrow length so start arrow tip touches card edge
                let exitX, exitY;
                if (exitEdge === "right") { exitX = sx + CARD_HALF_WIDTH + ARROW_LENGTH; exitY = sy + sourcePortOffset; }
                else if (exitEdge === "left") { exitX = sx - CARD_HALF_WIDTH - ARROW_LENGTH; exitY = sy + sourcePortOffset; }
                else if (exitEdge === "bottom") { exitX = sx + sourcePortOffset; exitY = sy + CARD_HALF_HEIGHT + ARROW_LENGTH; }
                else { exitX = sx + sourcePortOffset; exitY = sy - CARD_HALF_HEIGHT - ARROW_LENGTH; }

                // Calculate entry point - offset OUTWARD by arrow length so end arrow tip touches card edge
                let entryX, entryY;
                if (entryEdge === "right") { entryX = tx + CARD_HALF_WIDTH + ARROW_LENGTH; entryY = ty + targetPortOffset; }
                else if (entryEdge === "left") { entryX = tx - CARD_HALF_WIDTH - ARROW_LENGTH; entryY = ty + targetPortOffset; }
                else if (entryEdge === "bottom") { entryX = tx + targetPortOffset; entryY = ty + CARD_HALF_HEIGHT + ARROW_LENGTH; }
                else { entryX = tx + targetPortOffset; entryY = ty - CARD_HALF_HEIGHT - ARROW_LENGTH; }

                // Check if line segment intersects a card
                const CARD_MARGIN = 15; // Small margin around cards
                const lineHitsCard = (x1, y1, x2, y2, node) => {
                  if (node.id === edge.source || node.id === edge.target) return false;
                  const l = node.x - CARD_HALF_WIDTH - CARD_MARGIN;
                  const r = node.x + CARD_HALF_WIDTH + CARD_MARGIN;
                  const t = node.y - CARD_HALF_HEIGHT - CARD_MARGIN;
                  const b = node.y + CARD_HALF_HEIGHT + CARD_MARGIN;

                  if (Math.abs(x1 - x2) < 1) { // Vertical line
                    return x1 > l && x1 < r && Math.max(y1, y2) > t && Math.min(y1, y2) < b;
                  } else if (Math.abs(y1 - y2) < 1) { // Horizontal line
                    return y1 > t && y1 < b && Math.max(x1, x2) > l && Math.min(x1, x2) < r;
                  }
                  return false;
                };

                const segmentBlocked = (x1, y1, x2, y2) => nodes.some(n => lineHitsCard(x1, y1, x2, y2, n));

                // Build SVG path from points
                const buildPath = (pts) => {
                  const f = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i-1].x) > 0.5 || Math.abs(p.y - pts[i-1].y) > 0.5);
                  if (f.length < 2) return null;
                  return `M ${f[0].x} ${f[0].y} ` + f.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
                };

                // Check if path hits any cards
                const pathBlocked = (pts) => {
                  for (let i = 0; i < pts.length - 1; i++) {
                    if (segmentBlocked(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y)) return true;
                  }
                  return false;
                };

                // Generate simple orthogonal path
                const exitHoriz = exitEdge === "left" || exitEdge === "right";
                const entryHoriz = entryEdge === "left" || entryEdge === "right";

                // Unique offset for edges between same pair of nodes
                const pairOffset = pairCount > 1 ? (pairIndex - (pairCount - 1) / 2) * 20 : 0;

                let pathPoints;

                if (exitHoriz !== entryHoriz) {
                  // L-shape: perpendicular edges - try direct path first
                  if (exitHoriz) {
                    pathPoints = [
                      { x: exitX, y: exitY },
                      { x: entryX, y: exitY },
                      { x: entryX, y: entryY }
                    ];
                  } else {
                    pathPoints = [
                      { x: exitX, y: exitY },
                      { x: exitX, y: entryY },
                      { x: entryX, y: entryY }
                    ];
                  }

                  // Only add detour if direct path is blocked
                  if (pathBlocked(pathPoints)) {
                    // Try small detours first, increase only if needed
                    for (const detour of [40, 70, 100, 140]) {
                      if (exitHoriz) {
                        const midY = entryEdge === "top"
                          ? Math.min(exitY, entryY) - detour - Math.abs(pairOffset)
                          : Math.max(exitY, entryY) + detour + Math.abs(pairOffset);
                        pathPoints = [
                          { x: exitX, y: exitY },
                          { x: exitX + (exitEdge === "right" ? 20 : -20), y: exitY },
                          { x: exitX + (exitEdge === "right" ? 20 : -20), y: midY + pairOffset },
                          { x: entryX, y: midY + pairOffset },
                          { x: entryX, y: entryY }
                        ];
                      } else {
                        const midX = entryEdge === "left"
                          ? Math.min(exitX, entryX) - detour - Math.abs(pairOffset)
                          : Math.max(exitX, entryX) + detour + Math.abs(pairOffset);
                        pathPoints = [
                          { x: exitX, y: exitY },
                          { x: exitX, y: exitY + (exitEdge === "bottom" ? 20 : -20) },
                          { x: midX + pairOffset, y: exitY + (exitEdge === "bottom" ? 20 : -20) },
                          { x: midX + pairOffset, y: entryY },
                          { x: entryX, y: entryY }
                        ];
                      }
                      if (!pathBlocked(pathPoints)) break;
                    }
                  }
                } else {
                  // Z-shape: parallel edges need middle segment
                  if (exitHoriz) {
                    const midX = (exitX + entryX) / 2 + pairOffset;
                    pathPoints = [
                      { x: exitX, y: exitY },
                      { x: midX, y: exitY },
                      { x: midX, y: entryY },
                      { x: entryX, y: entryY }
                    ];

                    // Only add detour if direct Z-path is blocked
                    if (pathBlocked(pathPoints)) {
                      for (const detour of [50, 80, 120, 160]) {
                        const routeY = sy < ty
                          ? Math.min(sy, ty) - CARD_HALF_HEIGHT - detour - Math.abs(pairOffset)
                          : Math.max(sy, ty) + CARD_HALF_HEIGHT + detour + Math.abs(pairOffset);
                        pathPoints = [
                          { x: exitX, y: exitY },
                          { x: exitX + (exitEdge === "right" ? 20 : -20), y: exitY },
                          { x: exitX + (exitEdge === "right" ? 20 : -20), y: routeY + pairOffset },
                          { x: entryX + (entryEdge === "right" ? 20 : -20), y: routeY + pairOffset },
                          { x: entryX + (entryEdge === "right" ? 20 : -20), y: entryY },
                          { x: entryX, y: entryY }
                        ];
                        if (!pathBlocked(pathPoints)) break;
                      }
                    }
                  } else {
                    const midY = (exitY + entryY) / 2 + pairOffset;
                    pathPoints = [
                      { x: exitX, y: exitY },
                      { x: exitX, y: midY },
                      { x: entryX, y: midY },
                      { x: entryX, y: entryY }
                    ];

                    // Only add detour if direct Z-path is blocked
                    if (pathBlocked(pathPoints)) {
                      for (const detour of [50, 80, 120, 160]) {
                        const routeX = sx < tx
                          ? Math.min(sx, tx) - CARD_HALF_WIDTH - detour - Math.abs(pairOffset)
                          : Math.max(sx, tx) + CARD_HALF_WIDTH + detour + Math.abs(pairOffset);
                        pathPoints = [
                          { x: exitX, y: exitY },
                          { x: exitX, y: exitY + (exitEdge === "bottom" ? 20 : -20) },
                          { x: routeX + pairOffset, y: exitY + (exitEdge === "bottom" ? 20 : -20) },
                          { x: routeX + pairOffset, y: entryY + (entryEdge === "bottom" ? 20 : -20) },
                          { x: entryX, y: entryY + (entryEdge === "bottom" ? 20 : -20) },
                          { x: entryX, y: entryY }
                        ];
                        if (!pathBlocked(pathPoints)) break;
                      }
                    }
                  }
                }

                const path = buildPath(pathPoints);

                // Check if edge is connected to hovered node
                const isConnectedToHoveredNode =
                  hoveredNode &&
                  (edge.source === hoveredNode || edge.target === hoveredNode);
                const isSelected = selectedEdge === edge.id;
                const isHovered = hoveredEdge === edge.id;
                const isHighlighted = isSelected || isHovered || isConnectedToHoveredNode;

                // Get markers and styling
                const markers = getEdgeMarkers(edge, isHighlighted);

                let strokeWidth = "stroke-[4px]";
                if (isSelected) {
                  strokeWidth = "stroke-[9px]";
                } else if (isHovered || isConnectedToHoveredNode) {
                  strokeWidth = "stroke-[8px]";
                }

                const strokeDashArray = getEdgeStrokePattern(edge.type);

                const shouldHideEdge =
                  !filterConfig.showCompleted &&
                  (sourceNode.isCompleted || targetNode.isCompleted);

                return (
                  <g
                    key={edge.id}
                    className="edge-group"
                    onMouseEnter={() => setHoveredEdge(edge.id)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdge(isSelected ? null : edge.id);
                    }}
                    style={{
                      cursor: "pointer",
                      opacity: shouldHideEdge ? 0 : 1,
                      pointerEvents: shouldHideEdge ? "none" : "auto",
                      filter:
                        isHovered || isSelected
                          ? "drop-shadow(0 0 4px rgba(0, 0, 0, 0.3))"
                          : "none",
                    }}
                  >
                    {/* Main colored path */}
                    <path
                      d={path}
                      className={`${getEdgeColor(edge)} fill-none transition-all duration-200 ${strokeWidth}`}
                      style={{
                        markerStart: markers.start,
                        markerEnd: markers.end,
                        strokeDasharray: strokeDashArray,
                        paintOrder: isHovered || isSelected ? "stroke" : "normal",
                      }}
                    />
                    {/* Invisible wider path for easier click and hover detection */}
                    <path
                      d={path}
                      className="stroke-transparent stroke-[30px] fill-none cursor-pointer"
                      onMouseEnter={() => setHoveredEdge(edge.id)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                  </g>
                );
              });
            })()}

            {/* Temporary dependency linking line */}
            {dependencyMode.active &&
              dependencyMode.sourceNodeId &&
              (() => {
                const sourceNode = nodes.find(
                  (n) => n.id === dependencyMode.sourceNodeId
                );
                if (!sourceNode) return null;

                // Get the styling for the selected dependency type
                const selectedType = pendingDependency.type || "FS";
                const strokePattern = getEdgeStrokePattern(selectedType);

                // Get stroke color based on type
                const strokeColors = {
                  FS: "#3b82f6", // blue-500
                  FF: "#a855f7", // purple-500
                  SS: "#10b981", // emerald-500
                  SF: "#f59e0b", // amber-500
                };
                const strokeColor = strokeColors[selectedType] || "#3b82f6";

                // Get marker IDs for the selected type
                const markerEnd = `url(#arrow-${selectedType.toLowerCase()}-lg)`;
                const markerStart = `url(#arrow-${selectedType.toLowerCase()}-start-lg)`;

                // Create a simple path from source to mouse position
                const path = `M ${sourceNode.x},${sourceNode.y} L ${linkingMousePos.x},${linkingMousePos.y}`;

                return (
                  <g>
                    <path
                      d={path}
                      className="fill-none pointer-events-none stroke-[6px]"
                      style={{
                        stroke: strokeColor,
                        strokeDasharray: strokePattern,
                        markerStart: markerStart,
                        markerEnd: markerEnd,
                      }}
                    />
                  </g>
                );
              })()}

            {/* Draw nodes */}
            {nodes.map((node) => {
              const isHovered = hoveredNode === node.id;
              const isSelected = selectedNode === node.id;
              const isLinkingSource =
                dependencyMode.active &&
                dependencyMode.sourceNodeId === node.id;

              // Check if this node is an invalid target for dependency linking
              const isInvalidTarget =
                dependencyMode.active &&
                dependencyMode.sourceNodeId &&
                !isLinkingSource &&
                !canConnectToNode(node.id);

              // Check if this node should be hidden based on completed filter
              const shouldHideCompleted =
                !filterConfig.showCompleted && node.isCompleted;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => handleNodeClick(node, e)} // Use updated click handler
                  className={
                    isInvalidTarget
                      ? "cursor-not-allowed node-group"
                      : "cursor-pointer node-group"
                  }
                  style={{
                    opacity: shouldHideCompleted
                      ? 0
                      : isInvalidTarget
                      ? 0.4
                      : 1,
                    pointerEvents: shouldHideCompleted ? "none" : "auto",
                  }}
                >
                  <foreignObject
                    x="-110" // Slightly wider
                    y="-50" // Slightly taller
                    width="220"
                    height="100"
                    className={`overflow-visible ${
                      isHovered || isSelected || isLinkingSource ? "z-10" : ""
                    }`}
                  >
                    <div
                      onMouseEnter={() =>
                        !isInvalidTarget && setHoveredNode(node.id)
                      }
                      onMouseLeave={() =>
                        !isInvalidTarget && setHoveredNode(null)
                      }
                      className={`
                        relative w-full h-full rounded-xl px-4 py-3
                        ${
                          isInvalidTarget
                            ? "border-2 border-dashed border-gray-400 dark:border-gray-600 midnight:border-gray-700"
                            : "border-2 border-white/30"
                        }
                        ${
                          isHovered && !isInvalidTarget
                            ? "ring-2 ring-offset-4 ring-offset-gray-50 dark:ring-offset-gray-800 midnight:ring-offset-gray-900 ring-indigo-400 dark:ring-indigo-500 midnight:ring-indigo-400 scale-105"
                            : ""
                        }
                        ${
                          isSelected && !isInvalidTarget
                            ? "ring-2 ring-offset-4 ring-offset-gray-50 dark:ring-offset-gray-800 midnight:ring-offset-gray-900 ring-blue-500 dark:ring-blue-400 midnight:ring-blue-400"
                            : ""
                        }
                        ${
                          isLinkingSource
                            ? "ring-2 ring-offset-4 ring-offset-gray-50 dark:ring-offset-gray-800 midnight:ring-offset-gray-900 ring-emerald-500 dark:ring-emerald-400 midnight:ring-emerald-400 animate-pulse"
                            : ""
                        }
                        ${getNodeColor(
                          node
                        )} text-white transition-all duration-300
                      `}
                    >
                      {/* Enhanced Card Content */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center min-w-0 flex-1">
                          {/* Status Icons */}
                          {node.isCompleted && (
                            <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 text-white" />
                          )}
                          {node.isBlocked && !node.isCompleted && (
                            <>
                              {console.log(
                                "🎨 Rendering AlertTriangle for:",
                                node.card.title,
                                {
                                  isBlocked: node.isBlocked,
                                  isCompleted: node.isCompleted,
                                }
                              )}
                              <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0 stroke-yellow-500 dark:stroke-yellow-400 midnight:stroke-yellow-300" />
                            </>
                          )}
                          {/* Linking Indicator */}
                          {isLinkingSource && (
                            <Link2 className="w-4 h-4 mr-2 flex-shrink-0 text-emerald-200 animate-ping" />
                          )}
                          {/* Priority Indicator */}
                          {node.card.priority && (
                            <div
                              className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
                                node.card.priority === "High"
                                  ? "bg-red-300"
                                  : node.card.priority === "Medium"
                                  ? "bg-yellow-300"
                                  : "bg-blue-300"
                              }`}
                            />
                          )}
                        </div>
                        {/* Blocker Badge */}
                        {node.isBlockingOthers && !node.isCompleted && (
                          <div
                            className="flex-shrink-0 bg-red-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white/30 shadow-md"
                            title="This task is blocking others"
                          >
                            BLOCKER
                          </div>
                        )}
                      </div>

                      {/* Title */}
                      <div
                        className="text-sm font-semibold text-white mb-2 line-clamp-2 leading-tight"
                        title={node.card.title}
                      >
                        {node.card.title}
                      </div>

                      <div className="text-xs flex items-center justify-between text-white/90">
                        <div
                          className="truncate mr-2 bg-black/10 px-2 py-1 rounded-md"
                          title={node.card.columnTitle}
                        >
                          {node.card.columnTitle}
                        </div>
                        {node.card.progress > 0 && (
                          <div className="flex-shrink-0 bg-white/20 px-2 py-1 rounded-md font-medium">
                            {node.card.progress}%
                          </div>
                        )}
                      </div>

                      {/* Enhanced Add Dependency Button */}
                      {!dependencyMode.active && (isHovered || isSelected) && (
                        <button
                          onClick={(e) => startDependencyLink(node.id, e)}
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            setHoveredPlusButton(true);
                          }}
                          onMouseLeave={(e) => {
                            e.stopPropagation();
                            setHoveredPlusButton(false);
                            setHoveredNode(null); // Clear hover when leaving plus button
                          }}
                          className="absolute -top-2 -right-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-full p-1.5 shadow-lg transition-all duration-200 hover:scale-110"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      {/* Enhanced Cancel Linking Button */}
                      {isLinkingSource && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDependencyMode({
                              active: false,
                              sourceNodeId: null,
                            });
                          }}
                          className="absolute -top-2 -left-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg transition-all duration-200 hover:scale-110"
                          title="Cancel adding dependency"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>{" "}
        {/* Floating instructions for dependency mode - Enhanced styling */}
        {dependencyMode.active && dependencyMode.sourceNodeId && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-900/90 dark:to-emerald-800/90 midnight:from-emerald-950/90 midnight:to-emerald-900/90 text-emerald-800 dark:text-emerald-200 midnight:text-emerald-100 px-6 py-3 rounded-xl shadow-lg text-sm z-50 border border-emerald-200 dark:border-emerald-700 midnight:border-emerald-800 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 animate-pulse" />
              <span>
                Click on the task that{" "}
                <strong className="font-semibold">
                  {
                    nodes.find((n) => n.id === dependencyMode.sourceNodeId)
                      ?.card.title
                  }
                </strong>{" "}
                depends on
              </span>
            </div>
            <div className="text-xs text-emerald-600 dark:text-emerald-300 midnight:text-emerald-200 mt-1 text-center">
              Click background to cancel
            </div>
          </div>
        )}
      </div>{" "}
      {/* Floating instruction for plus button */}
      {hoveredPlusButton &&
        hoveredNode &&
        (() => {
          const hoveredNodeData = nodes.find((n) => n.id === hoveredNode);
          if (!hoveredNodeData) return null;

          // Calculate position near the plus button (close to the card)
          const cardX = hoveredNodeData.x * zoom + pan.x;
          const cardY = hoveredNodeData.y * zoom + pan.y;
          const instructionX = cardX + 60; // Position closer to the right of the card
          const instructionY = cardY - 40; // Position closer above the card

          return (
            <div
              className="absolute bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/90 dark:to-indigo-800/90 midnight:from-indigo-950/90 midnight:to-indigo-900/90 text-indigo-800 dark:text-indigo-200 midnight:text-indigo-100 px-4 py-2 rounded-lg shadow-lg text-sm z-50 border border-indigo-200 dark:border-indigo-700 midnight:border-indigo-800 backdrop-blur-sm pointer-events-none"
              style={{
                left: `${instructionX}px`,
                top: `${instructionY}px`,
              }}
            >
              <div className="flex items-center gap-2">
                <CirclePlus className="w-4 h-4" />
                <span className="whitespace-nowrap">
                  Click to add a dependency
                </span>
              </div>
            </div>
          );
        })()}
      {/* Enhanced Info Panel for hovered node - Positioned next to card */}
      {hoveredNode &&
        !hoveredPlusButton &&
        !showDependencyConfig &&
        (() => {
          const hoveredNodeData = nodes.find((n) => n.id === hoveredNode);
          if (!hoveredNodeData) return null;

          // Calculate position next to the card (accounting for zoom and pan)
          const cardX = hoveredNodeData.x * zoom + pan.x;
          const cardY = hoveredNodeData.y * zoom + pan.y;

          // Position to the right of the card with some spacing
          const detailX = cardX + 140; // Card width/2 (114) + spacing (26)
          const detailY = cardY - 100; // Vertically centered with slight offset

          return (
            <div
              className="absolute bg-white/95 dark:bg-gray-800/95 midnight:bg-gray-900/95 p-5 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 max-w-sm max-h-80 overflow-y-auto z-10 backdrop-blur-sm pointer-events-none"
              style={{
                left: `${detailX}px`,
                top: `${detailY}px`,
              }}
            >
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-2 line-clamp-2">
                  {nodes.find((n) => n.id === hoveredNode)?.card.title}
                </h3>

                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-md">
                    {nodes.find((n) => n.id === hoveredNode)?.card.columnTitle}
                  </span>
                  {nodes.find((n) => n.id === hoveredNode)?.card.priority && (
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium ${
                        nodes.find((n) => n.id === hoveredNode)?.card
                          .priority === "High"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : nodes.find((n) => n.id === hoveredNode)?.card
                              .priority === "Medium"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {nodes.find((n) => n.id === hoveredNode)?.card.priority}
                    </span>
                  )}
                </div>
              </div>

              {/* Due Date */}
              {nodes.find((n) => n.id === hoveredNode)?.card.dueDate && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-3">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span>
                    Due:{" "}
                    {new Date(
                      nodes.find((n) => n.id === hoveredNode)?.card.dueDate
                    ).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Description */}
              {nodes.find((n) => n.id === hoveredNode)?.card.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-3 line-clamp-3">
                  {nodes.find((n) => n.id === hoveredNode)?.card.description}
                </p>
              )}

              {/* Progress */}
              <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-3">
                Progress:{" "}
                <span className="font-medium">
                  {nodes.find((n) => n.id === hoveredNode)?.card.progress || 0}%
                </span>
              </div>

              {/* Dependencies info */}
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                {cardDependencies[hoveredNode]?.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    <span>{cardDependencies[hoveredNode].length} deps</span>
                  </div>
                )}
                {dependentCards[hoveredNode]?.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Network className="w-3 h-3" />
                    <span>{dependentCards[hoveredNode].length} blocking</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}{" "}
      {/* No dependencies message */}
      {nodes.length > 0 && edges.length === 0 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-blue-50 dark:bg-blue-900/90 midnight:bg-blue-950/90 text-blue-800 dark:text-blue-200 midnight:text-blue-100 px-6 py-3 rounded-xl shadow-lg text-sm z-50 border border-blue-200 dark:border-blue-700 midnight:border-blue-800">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            <span>
              No dependencies yet. Hover over a task and click the{" "}
              <Plus className="w-3 h-3 inline mx-1" /> button to create
              connections.
            </span>
          </div>
        </div>
      )}
      {/* Create Task Modal */}
      {showCreateTask && (
        <AddCardModal
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => setShowCreateTask(false)}
        />
      )}
      {/* Dependency Configuration Modal */}
      {showDependencyConfig && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 midnight:bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-scaleIn">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-500" />
              Configure Dependency
            </h2>

            {/* Dependency Type Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 midnight:text-indigo-200 mb-3">
                Dependency Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    value: "FS",
                    label: "Finish-to-Start",
                    shortLabel: "FS",
                    description: "Target must finish first",
                    bg: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10",
                    border:
                      "border-blue-200 dark:border-blue-800 midnight:border-blue-700",
                    text: "text-blue-700 dark:text-blue-400 midnight:text-blue-400",
                    hoverBg:
                      "hover:bg-blue-100 dark:hover:bg-blue-900/30 midnight:hover:bg-blue-900/20",
                    activeBg:
                      "bg-blue-100 dark:bg-blue-900/40 midnight:bg-blue-900/30",
                    icon: "text-blue-600 dark:text-blue-500 midnight:text-blue-500",
                  },
                  {
                    value: "FF",
                    label: "Finish-to-Finish",
                    shortLabel: "FF",
                    description: "Both finish together",
                    bg: "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/10",
                    border:
                      "border-purple-200 dark:border-purple-800 midnight:border-purple-700",
                    text: "text-purple-700 dark:text-purple-400 midnight:text-purple-400",
                    hoverBg:
                      "hover:bg-purple-100 dark:hover:bg-purple-900/30 midnight:hover:bg-purple-900/20",
                    activeBg:
                      "bg-purple-100 dark:bg-purple-900/40 midnight:bg-purple-900/30",
                    icon: "text-purple-600 dark:text-purple-500 midnight:text-purple-500",
                  },
                  {
                    value: "SS",
                    label: "Start-to-Start",
                    shortLabel: "SS",
                    description: "Target must start first",
                    bg: "bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10",
                    border:
                      "border-green-200 dark:border-green-800 midnight:border-green-700",
                    text: "text-green-700 dark:text-green-400 midnight:text-green-400",
                    hoverBg:
                      "hover:bg-green-100 dark:hover:bg-green-900/30 midnight:hover:bg-green-900/20",
                    activeBg:
                      "bg-green-100 dark:bg-green-900/40 midnight:bg-green-900/30",
                    icon: "text-green-600 dark:text-green-500 midnight:text-green-500",
                  },
                  {
                    value: "SF",
                    label: "Start-to-Finish",
                    shortLabel: "SF",
                    description: "Target starts, this finishes",
                    bg: "bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10",
                    border:
                      "border-amber-200 dark:border-amber-800 midnight:border-amber-700",
                    text: "text-amber-700 dark:text-amber-400 midnight:text-amber-400",
                    hoverBg:
                      "hover:bg-amber-100 dark:hover:bg-amber-900/30 midnight:hover:bg-amber-900/20",
                    activeBg:
                      "bg-amber-100 dark:bg-amber-900/40 midnight:bg-amber-900/30",
                    icon: "text-amber-600 dark:text-amber-500 midnight:text-amber-500",
                  },
                ].map((type) => {
                  const isSelected = pendingDependency.type === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() =>
                        setPendingDependency((prev) => ({
                          ...prev,
                          type: type.value,
                        }))
                      }
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? `${type.border} ${type.bg}`
                          : "border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                      } ${type.hoverBg} hover:shadow-md`}
                    >
                      <div className="flex items-center mb-2">
                        <div
                          className={`w-8 h-8 rounded-lg ${type.activeBg} flex items-center justify-center flex-shrink-0`}
                        >
                          <span className={`text-xs font-bold ${type.icon}`}>
                            {type.shortLabel}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div
                          className={`text-xs font-semibold ${type.text} mb-0.5`}
                        >
                          {type.label}
                        </div>
                        <div className={`text-[10px] ${type.text}`}>
                          {type.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lag Time Input */}
            <div className="mb-6">
              <label className="flex items-center text-sm font-medium mb-3 text-gray-700 dark:text-gray-300 midnight:text-indigo-200">
                <Clock className="w-4 h-4 mr-2" />
                Lag Time
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={pendingDependency.lag}
                  onChange={(e) =>
                    setPendingDependency((prev) => ({
                      ...prev,
                      lag: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  min="0"
                  step="0.5"
                  className="w-full pl-4 pr-24 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 midnight:border-gray-700 text-gray-900 dark:text-white midnight:text-indigo-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 midnight:focus:ring-indigo-500 focus:border-transparent
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                    hours
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDependency((prev) => ({
                          ...prev,
                          lag: Math.max(0, (parseFloat(prev.lag) || 0) + 0.5),
                        }))
                      }
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-400 transition-colors rounded-t"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDependency((prev) => ({
                          ...prev,
                          lag: Math.max(0, (parseFloat(prev.lag) || 0) - 0.5),
                        }))
                      }
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-400 transition-colors rounded-b"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                Time delay before the dependency can start/finish
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDependencyConfig(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDependencyConfig}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white dark:text-gray-100 midnight:text-gray-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                Start Linking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { NetworkViewSkeleton };
export default NetworkView;
