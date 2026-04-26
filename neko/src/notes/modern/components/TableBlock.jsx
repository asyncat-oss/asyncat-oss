import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Plus, X } from "lucide-react";
import { sanitizeTableCell } from "../../../utils/sanitizer";

// Memoized Table Cell component to prevent cursor jumping
const TABLE_SELECTION_STYLE_ID = "table-selection-overlay-style";

const ensureTableSelectionStyle = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(TABLE_SELECTION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = TABLE_SELECTION_STYLE_ID;
  style.textContent = `
    .table-selected-overlay ::selection,
    .table-selected-overlay *::selection {
      background: transparent !important;
      color: inherit !important;
    }
    .table-selected-overlay ::-moz-selection,
    .table-selected-overlay *::-moz-selection {
      background: transparent !important;
      color: inherit !important;
    }
  `;
  document.head.appendChild(style);
};

const TableCell = React.memo(
  ({
    cellKey,
    cell,
    isHeader,
    rowIndex,
    colIndex,
    onCellChange,
    onCellPaste,
    onKeyDown,
    onCellFocus,
    cellRefs,
    columnWidth,
    headerNumber,
  }) => {
    const elementRef = useRef(null);
    const initializedRef = useRef(false);

    // Initialize content and adjust height
    useEffect(() => {
      if (elementRef.current) {
        // Check if content needs updating (for undo operations or initialization)
        const currentContent = elementRef.current.innerHTML;
        const incomingContent = cell || "";

        // Update if not initialized OR if content is different
        // Skip updates when focused to prevent interference during typing
        // BUT always update if content has changed significantly (like from undo)
        const isSignificantChange = currentContent !== incomingContent;
        const isFocused = elementRef.current.matches(":focus");
        const shouldUpdate =
          !initializedRef.current ||
          (isSignificantChange && (!isFocused || incomingContent === ""));

        if (shouldUpdate) {
          // Sanitize content before setting innerHTML
          const sanitizedContent = sanitizeTableCell(incomingContent);
          elementRef.current.innerHTML = sanitizedContent;
          initializedRef.current = true;
        }

        // Adjust height after content is set and sync with row
        const element = elementRef.current;
        const parentTd = element.closest("td");
        if (parentTd) {
          const parentRow = parentTd.closest("tr");
          if (parentRow) {
            // Reset heights for measurement
            element.style.height = "auto";

            // Get all cells in this row
            const rowCells = parentRow.querySelectorAll("td");
            const rowContentElements =
              parentRow.querySelectorAll("[contenteditable]");

            // Reset all cell heights to auto for proper measurement
            rowContentElements.forEach((el) => {
              el.style.height = "auto";
            });

            // Force reflow
            element.offsetHeight;

            // Find the tallest content in this row
            let maxHeight = 40; // minimum height
            rowContentElements.forEach((el) => {
              const contentHeight = Math.max(el.scrollHeight, 40);
              if (contentHeight > maxHeight) {
                maxHeight = contentHeight;
              }
            });

            // Apply the maximum height to all cells and their contenteditable areas in the row
            rowCells.forEach((cell) => {
              cell.style.height = maxHeight + "px";
              const contentElement = cell.querySelector("[contenteditable]");
              if (contentElement) {
                contentElement.style.height = maxHeight + "px";
              }
            });
          }
        }
      }
    }, [cell]);

    // Update placeholder when header number changes
    useEffect(() => {
      if (elementRef.current && isHeader) {
        elementRef.current.setAttribute(
          "placeholder",
          `Header ${headerNumber}`
        );
      }
    }, [headerNumber, isHeader]);

    // Helper function to adjust cell height and synchronize row heights
    const adjustCellHeight = useCallback((element) => {
      const parentTd = element.closest("td");
      if (!parentTd) return;

      const parentRow = parentTd.closest("tr");
      if (!parentRow) return;

      // Reset heights for measurement
      element.style.height = "auto";

      // Get all cells in this row
      const rowCells = parentRow.querySelectorAll("td");
      const rowContentElements =
        parentRow.querySelectorAll("[contenteditable]");

      // Reset all cell heights to auto for proper measurement
      rowContentElements.forEach((el) => {
        el.style.height = "auto";
      });

      // Force reflow
      element.offsetHeight;

      // Find the tallest content in this row
      let maxHeight = 40; // minimum height
      rowContentElements.forEach((el) => {
        const contentHeight = Math.max(el.scrollHeight, 40);
        if (contentHeight > maxHeight) {
          maxHeight = contentHeight;
        }
      });

      // Apply the maximum height to all cells and their contenteditable areas in the row
      rowCells.forEach((cell) => {
        cell.style.height = maxHeight + "px";
        const contentElement = cell.querySelector("[contenteditable]");
        if (contentElement) {
          contentElement.style.height = maxHeight + "px";
        }
      });
    }, []);

    // Helper function to adjust cell height specifically for empty cells
    const adjustCellHeightForEmpty = useCallback((element) => {
      const parentTd = element.closest("td");
      if (!parentTd) return;

      const parentRow = parentTd.closest("tr");
      if (!parentRow) return;

      // Get all cells in this row
      const rowCells = parentRow.querySelectorAll("td");
      const rowContentElements =
        parentRow.querySelectorAll("[contenteditable]");

      // Reset all cell heights to auto for proper measurement
      rowContentElements.forEach((el) => {
        el.style.height = "auto";
      });

      // Force reflow
      element.offsetHeight;

      // Find the tallest content in this row, but don't count empty cells
      let maxHeight = 40; // minimum height
      rowContentElements.forEach((el) => {
        // Only consider cells with actual content for height calculation
        if (el.textContent && el.textContent.trim().length > 0) {
          const contentHeight = Math.max(el.scrollHeight, 40);
          if (contentHeight > maxHeight) {
            maxHeight = contentHeight;
          }
        }
      });

      // Apply the maximum height to all cells and their contenteditable areas in the row
      rowCells.forEach((cell) => {
        cell.style.height = maxHeight + "px";
        const contentElement = cell.querySelector("[contenteditable]");
        if (contentElement) {
          contentElement.style.height = maxHeight + "px";
        }
      });
    }, []);

    const handleInput = useCallback(
      (e) => {
        const element = e.target;

        // Clean up zero-width spaces when user starts typing
        if (element.textContent === "\u200B") {
          // If only zero-width space exists and user is typing, clear it
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Check if this is likely a typing event (not our programmatic change)
            if (
              element.innerHTML !== "\u200B" &&
              element.textContent.length > 1
            ) {
              element.textContent = element.textContent.replace(/\u200B/g, "");
              // Restore cursor position after cleanup
              try {
                const newRange = document.createRange();
                newRange.selectNodeContents(element);
                newRange.collapse(false);
                selection.removeAllRanges();
                selection.addRange(newRange);
              } catch (error) {
                // Ignore positioning errors
              }
            }
          }
        }

        // Dynamically adjust cell height based on content
        adjustCellHeight(element);

        // Immediately indicate user is typing (prevent auto-save interruption)
        onCellChange(rowIndex, colIndex, e, true); // Pass true to indicate user is actively typing

        // Clear any existing timeout
        clearTimeout(cellRefs.current[`timeout-${cellKey}`]);
        cellRefs.current[`timeout-${cellKey}`] = null;
      },
      [rowIndex, colIndex, onCellChange, cellKey, cellRefs, adjustCellHeight]
    );

    const handleKeyDownEvent = useCallback(
      (e) => {
        e.stopPropagation();

        if (e.key === "Enter") {
          if (e.shiftKey) {
            // Disable Shift+Enter in table cells for cleaner UX
            e.preventDefault();
            return;
          }

          // Allow regular Enter to create new lines in table cells
          // Don't prevent default - let the browser handle the line break
          setTimeout(() => {
            if (elementRef.current) {
              adjustCellHeight(elementRef.current);
              handleInput({ target: elementRef.current });
            }
          }, 0);
          return;
        }

        // Handle delete and backspace to maintain cursor position when cell becomes empty
        if (e.key === "Delete" || e.key === "Backspace") {
          // Store current selection before the delete operation
          const selection = window.getSelection();
          const element = elementRef.current;

          if (element && selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const isAtStart = range.startOffset === 0 && range.endOffset === 0;

            // Check if cell is already empty or will become empty
            const textContent = element.textContent || "";
            const isEmpty = textContent.trim() === "";
            const willBeEmpty = textContent.length <= 1;

            if (isEmpty || willBeEmpty) {
              // Prevent default delete behavior and handle manually
              e.preventDefault();

              // Clear all content including any HTML elements
              element.innerHTML = "";

              // Add a zero-width space to maintain cursor position
              const textNode = document.createTextNode("\u200B");
              element.appendChild(textNode);

              // Set cursor at the zero-width space
              try {
                const newRange = document.createRange();
                newRange.setStart(textNode, 0);
                newRange.setEnd(textNode, 0);
                selection.removeAllRanges();
                selection.addRange(newRange);

                // Ensure element has focus
                element.focus();
              } catch (error) {
                // Fallback: try alternative cursor positioning
                try {
                  const fallbackRange = document.createRange();
                  fallbackRange.selectNodeContents(element);
                  fallbackRange.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(fallbackRange);
                  element.focus();
                } catch (fallbackError) {
                  element.focus();
                }
              }

              // Force height adjustment with proper empty cell handling
              setTimeout(() => {
                adjustCellHeightForEmpty(element);
                handleInput({ target: element });
              }, 0);

              return;
            }
          }

          // For normal delete operations, handle cursor positioning after
          setTimeout(() => {
            if (elementRef.current) {
              const element = elementRef.current;
              const isEmpty =
                !element.textContent || element.textContent.trim() === "";

              if (isEmpty) {
                // Ensure the element maintains focus and cursor position when empty
                element.focus();

                // Set cursor position at the start of the empty element
                try {
                  const selection = window.getSelection();
                  if (selection) {
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                } catch (error) {
                  // Fallback: just ensure focus
                  element.focus();
                }

                adjustCellHeightForEmpty(element);
              } else {
                adjustCellHeight(element);
              }

              handleInput({ target: element });
            }
          }, 0);
        }

        onKeyDown(e, rowIndex, colIndex);
      },
      [
        adjustCellHeight,
        adjustCellHeightForEmpty,
        handleInput,
        onKeyDown,
        rowIndex,
        colIndex,
      ]
    );

    return (
      <div
        ref={(el) => {
          cellRefs.current[cellKey] = el;
          elementRef.current = el;
        }}
        contentEditable
        data-table-row={rowIndex}
        data-table-col={colIndex}
        suppressContentEditableWarning
        className={`outline-none resize-none bg-transparent ${
          isHeader ? "font-semibold text-center" : ""
        } text-gray-900 dark:text-gray-100 midnight:text-gray-100 focus:bg-blue-50 dark:focus:bg-blue-950 midnight:focus:bg-indigo-950`}
        style={{
          width: "100%",
          minHeight: "2.5rem",
          padding: "0.5rem 0.75rem",
          margin: 0,
          border: "none",
          boxSizing: "border-box",
          display: "block",
          position: "relative",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          hyphens: "none",
        }}
        onInput={handleInput}
        onPaste={(e) => {
          e.stopPropagation();
          onCellPaste(e, rowIndex, colIndex);
          // Adjust height after paste
          setTimeout(() => adjustCellHeight(e.target), 0);
        }}
        onKeyDown={handleKeyDownEvent}
        onFocus={(e) => {
          e.stopPropagation();
          if (onCellFocus) {
            onCellFocus(e, { row: rowIndex, col: colIndex });
          }
        }}
        onBlur={(e) => {
          e.stopPropagation();
        }}
        placeholder={isHeader ? `Header ${headerNumber}` : ""}
      />
    );
  }
);

const TableBlock = forwardRef(({ block, onChange, commonProps }, ref) => {
  useEffect(() => {
    ensureTableSelectionStyle();
  }, []);

  // Track block ID to detect when we're dealing with a completely different table
  const currentBlockIdRef = useRef(block.id);
  const [isTableInitialized, setIsTableInitialized] = useState(false);

  // Stable initialization - only reset if we're dealing with a different table entirely
  const [tableData, setTableData] = useState(() => {
    return block.properties?.tableData || [[""]];
  });
  const [hasHeader, setHasHeader] = useState(() => {
    return block.properties?.hasHeader || false;
  });
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [hoveredAddRow, setHoveredAddRow] = useState(null);
  const [hoveredAddCol, setHoveredAddCol] = useState(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [columnCounter, setColumnCounter] = useState(() => {
    return (
      block.properties?.columnCounter ||
      block.properties?.tableData?.[0]?.length ||
      3
    );
  });
  const [columnHeaders, setColumnHeaders] = useState(() => {
    return (
      block.properties?.columnHeaders ||
      Array.from(
        { length: block.properties?.tableData?.[0]?.length || 3 },
        (_, i) => i + 1
      )
    );
  });

  // Reset local state only if block ID changes (different table entirely)
  useEffect(() => {
    if (currentBlockIdRef.current !== block.id) {
      currentBlockIdRef.current = block.id;
      setTableData(block.properties?.tableData || [[""]]);
      setHasHeader(block.properties?.hasHeader || false);
      setColumnCounter(
        block.properties?.columnCounter ||
          block.properties?.tableData?.[0]?.length ||
          3
      );
      setColumnHeaders(
        block.properties?.columnHeaders ||
          Array.from(
            { length: block.properties?.tableData?.[0]?.length || 3 },
            (_, i) => i + 1
          )
      );
      setIsTableInitialized(true);
    } else if (!isTableInitialized) {
      setIsTableInitialized(true);
    }
  }, [block.id, isTableInitialized, block.properties]);
  const cellRefs = useRef({});
  const rowRefs = useRef({});
  const colRefs = useRef({});
  const tableWrapperRef = useRef(null);
  const tableContainerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const tableBlockContainerRef = useRef(null);
  const tableElementRef = useRef(null);
  const [isTableSelected, setIsTableSelected] = useState(false);
  const typingTimeoutRef = useRef(null);

  // Listen for clear modification events from undo operations
  useEffect(() => {
    const container = tableBlockContainerRef.current;
    if (!container) return;

    const handleClearModification = () => {
      setIsUserModifying(false);
      if (userModifyTimeoutRef.current) {
        clearTimeout(userModifyTimeoutRef.current);
        userModifyTimeoutRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    container.addEventListener(
      "clearTableModification",
      handleClearModification
    );
    return () => {
      container.removeEventListener(
        "clearTableModification",
        handleClearModification
      );
    };
  }, []);

  const blockFocusHandler = commonProps?.onFocus;

  const handleCellFocus = useCallback(
    (event, position) => {
      if (blockFocusHandler) {
        blockFocusHandler(event);
      }
      setSelectedCell(position);
      setIsTableSelected(false);
    },
    [blockFocusHandler]
  );

  // Expose the table block container element for blockRefs
  useImperativeHandle(
    ref,
    () => ({
      element: tableBlockContainerRef.current,
    }),
    []
  );

  // Helper function to save cursor position within a table cell
  const saveCursorPosition = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement && activeElement.contentEditable === "true") {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(activeElement);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        const caretOffset = preCaretRange.toString().length;

        // Find which cell this is
        for (const [key, cellElement] of Object.entries(cellRefs.current)) {
          if (cellElement === activeElement && !key.startsWith("timeout-")) {
            return {
              cellKey: key,
              caretOffset,
              element: activeElement,
            };
          }
        }
      }
    }
    return null;
  }, []);

  // Helper function to restore cursor position within a table cell
  const restoreCursorPosition = useCallback((savedPosition) => {
    if (!savedPosition) return;

    const { cellKey, caretOffset, element } = savedPosition;
    const cellElement = cellRefs.current[cellKey];

    if (cellElement && cellElement.contentEditable === "true") {
      // Ensure the element is focused
      cellElement.focus();

      // Restore cursor position
      try {
        const selection = window.getSelection();
        const range = document.createRange();

        let currentOffset = 0;
        let walker = document.createTreeWalker(
          cellElement,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent.length;
          if (currentOffset + nodeLength >= caretOffset) {
            range.setStart(node, caretOffset - currentOffset);
            range.setEnd(node, caretOffset - currentOffset);
            break;
          }
          currentOffset += nodeLength;
        }

        // If we couldn't find the exact position, set cursor at the end
        if (!range.collapsed || currentOffset < caretOffset) {
          range.selectNodeContents(cellElement);
          range.collapse(false);
        }

        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) {
        console.warn("Failed to restore cursor position:", error);
        // Fallback: just focus the element
        cellElement.focus();
      }
    }
  }, []);

  // Helper function to check if element is visible enough to show buttons
  const isElementVisible = useCallback((rect, containerRect) => {
    if (!rect || !containerRect) return false; // Default to false if we can't measure

    // Strict checking - only show if element is mostly visible (at least 80%)
    const elementWidth = rect.right - rect.left;
    const elementHeight = rect.bottom - rect.top;

    const visibleLeft = Math.max(rect.left, containerRect.left);
    const visibleRight = Math.min(rect.right, containerRect.right);
    const visibleTop = Math.max(rect.top, containerRect.top);
    const visibleBottom = Math.min(rect.bottom, containerRect.bottom);

    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    const visibilityRatio =
      (visibleWidth * visibleHeight) / (elementWidth * elementHeight);

    return visibilityRatio > 0.8; // Show only if at least 80% visible
  }, []);

  // Calculate responsive column width based on container and column count
  const getColumnWidth = useMemo(() => {
    const numColumns = tableData[0]?.length || 1;
    const minWidth = 120;
    const maxWidth = 250;

    // Use a more conservative container width to prevent unnecessary scrollbars
    const containerWidth = 700; // Conservative estimate to prevent premature scrolling
    const availableWidth = containerWidth - 80; // Account for padding and margins

    let calculatedWidth = Math.floor(availableWidth / numColumns);

    // Ensure width stays within bounds
    if (calculatedWidth < minWidth) {
      calculatedWidth = minWidth;
    } else if (calculatedWidth > maxWidth) {
      calculatedWidth = maxWidth;
    }

    return calculatedWidth;
  }, [tableData]);

  // Track when user is actively modifying table structure
  const [isUserModifying, setIsUserModifying] = useState(false);
  const userModifyTimeoutRef = useRef(null);

  // Helper to mark user modification and clear it after a delay
  const markUserModification = useCallback(() => {
    setIsUserModifying(true);
    if (userModifyTimeoutRef.current) {
      clearTimeout(userModifyTimeoutRef.current);
    }
    // Clear the flag after a reasonable delay to allow saves to complete
    userModifyTimeoutRef.current = setTimeout(() => {
      setIsUserModifying(false);
    }, 1000);
  }, []);

  // Track the last external update to avoid circular updates
  const lastExternalUpdateRef = useRef(null);

  // Only update state from props when we get a genuinely external update and table is initialized
  useEffect(() => {
    // Don't sync props until table is properly initialized to prevent premature resets
    if (!isTableInitialized) {
      return;
    }

    // NEVER reset local state during active user modifications OR when user modify timeout is active
    if (isUserModifying || userModifyTimeoutRef.current) {
      return;
    }

    const propsStateString = JSON.stringify({
      tableData: block.properties?.tableData,
      hasHeader: block.properties?.hasHeader,
      columnHeaders: block.properties?.columnHeaders,
      columnCounter: block.properties?.columnCounter,
    });

    // Skip if this is the same as what we just saved (prevent circular updates)
    if (lastExternalUpdateRef.current === propsStateString) {
      return;
    }

    // Only update if we have valid data and it's actually different from current state
    const currentStateString = JSON.stringify({
      tableData,
      hasHeader,
      columnHeaders,
      columnCounter,
    });

    // Apply external updates if:
    // 1. Local state is "smaller" (fewer rows/cols) - prevents overwriting user additions
    // 2. The state content is genuinely different (like from undo operations)
    // 3. There's a significant structural change in table data
    const propsData = block.properties?.tableData || [[""]];
    const hasFewerRows = tableData.length < propsData.length;
    const hasFewerCols = tableData[0]?.length < propsData[0]?.length;
    const stateContentDifferent = propsStateString !== currentStateString;

    // Check if this could be an undo operation (content changes without size increase)
    const couldBeUndo =
      stateContentDifferent &&
      propsData.length <= tableData.length &&
      (propsData[0]?.length || 0) <= (tableData[0]?.length || 0);

    const shouldAcceptPropsUpdate =
      hasFewerRows || hasFewerCols || stateContentDifferent;

    if (shouldAcceptPropsUpdate && block.properties?.tableData) {
      setTableData(block.properties.tableData);
      if (block.properties?.hasHeader !== undefined) {
        setHasHeader(block.properties.hasHeader);
      }
      if (block.properties?.columnHeaders) {
        setColumnHeaders(block.properties.columnHeaders);
      }
      if (block.properties?.columnCounter !== undefined) {
        setColumnCounter(block.properties.columnCounter);
      }
      lastExternalUpdateRef.current = propsStateString;
    }
  }, [block.properties, isUserModifying, isTableInitialized]);

  // Track if we need to activate auto-save system on first user interaction
  const [autoSaveActivated, setAutoSaveActivated] = useState(false);

  // Function to activate auto-save system (called on first user interaction)
  const activateAutoSave = useCallback(() => {
    if (!autoSaveActivated) {
      // Simply mark as activated without creating artificial state changes
      // This prevents false states from being captured in undo history
      setAutoSaveActivated(true);
    }
  }, [autoSaveActivated]);

  // Save changes to parent
  const saveTable = useCallback(
    (
      newTableData,
      newHasHeader = hasHeader,
      newColumnHeaders = columnHeaders,
      newColumnCounter = columnCounter
    ) => {
      const updatedProperties = {
        ...block.properties,
        tableData: newTableData,
        hasHeader: newHasHeader,
        columnHeaders: newColumnHeaders,
        columnCounter: newColumnCounter,
      };

      // Track what we're saving to prevent circular updates
      const saveStateString = JSON.stringify({
        tableData: newTableData,
        hasHeader: newHasHeader,
        columnHeaders: newColumnHeaders,
        columnCounter: newColumnCounter,
      });
      lastExternalUpdateRef.current = saveStateString;

      // Structural changes don't use typing detection - immediate save
      onChange(block.id, { properties: updatedProperties });
    },
    [
      block.properties,
      block.id,
      onChange,
      hasHeader,
      columnHeaders,
      columnCounter,
    ]
  );

  // Sync table state to parent immediately for undo history while user types
  const syncTableStateForUndo = useCallback(
    (
      nextTableData,
      nextHasHeader = hasHeader,
      nextColumnHeaders = columnHeaders,
      nextColumnCounter = columnCounter
    ) => {
      if (!onChange) {
        return;
      }

      const syncStateString = JSON.stringify({
        tableData: nextTableData,
        hasHeader: nextHasHeader,
        columnHeaders: nextColumnHeaders,
        columnCounter: nextColumnCounter,
      });

      // Avoid redundant updates
      if (lastExternalUpdateRef.current === syncStateString) {
        return;
      }

      const updatedProperties = {
        ...block.properties,
        tableData: nextTableData,
        hasHeader: nextHasHeader,
        columnHeaders: nextColumnHeaders,
        columnCounter: nextColumnCounter,
      };

      lastExternalUpdateRef.current = syncStateString;
      onChange(block.id, { properties: updatedProperties }, true);
    },
    [
      onChange,
      block.id,
      block.properties,
      hasHeader,
      columnHeaders,
      columnCounter,
    ]
  );

  // Track latest table state for cleanup handlers
  const latestTableStateRef = useRef({
    tableData,
    hasHeader,
    columnHeaders,
    columnCounter,
  });

  useEffect(() => {
    latestTableStateRef.current = {
      tableData,
      hasHeader,
      columnHeaders,
      columnCounter,
    };
  }, [tableData, hasHeader, columnHeaders, columnCounter]);

  const saveTableRef = useRef(saveTable);
  useEffect(() => {
    saveTableRef.current = saveTable;
  }, [saveTable]);

  // Cleanup effect to ensure pending saves are executed before unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        const {
          tableData: latestData,
          hasHeader: latestHeader,
          columnHeaders: latestHeaders,
          columnCounter: latestCounter,
        } = latestTableStateRef.current;
        saveTableRef.current(
          latestData,
          latestHeader,
          latestHeaders,
          latestCounter
        );
      }
      if (userModifyTimeoutRef.current) {
        clearTimeout(userModifyTimeoutRef.current);
      }
    };
  }, []);

  // Handle browser reload/navigation to save pending changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!typingTimeoutRef.current) {
        return;
      }

      clearTimeout(typingTimeoutRef.current);
      const {
        tableData: latestData,
        hasHeader: latestHeader,
        columnHeaders: latestHeaders,
        columnCounter: latestCounter,
      } = latestTableStateRef.current;
      saveTableRef.current(
        latestData,
        latestHeader,
        latestHeaders,
        latestCounter
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Handle cell content changes
  const handleCellChange = useCallback(
    (rowIndex, colIndex, e, isTyping = false) => {
      // Activate auto-save system on first user interaction
      activateAutoSave();

      // If user is actively typing, don't save yet - just update local state
      if (isTyping) {
        // Use innerHTML to preserve HTML elements like <br> tags, but clean zero-width spaces
        // Sanitize the content before processing
        let content = sanitizeTableCell(e.target.innerHTML);

        // Remove zero-width spaces from saved content
        if (content === "\u200B") {
          content = "";
        } else {
          content = content.replace(/\u200B/g, "");
        }

        const updatedRow = [...(tableData[rowIndex] || [])];
        updatedRow[colIndex] = content;
        const updatedTableData = [...tableData];
        updatedTableData[rowIndex] = updatedRow;

        setTableData(updatedTableData);

        const tableDataSnapshot = updatedTableData.map((row) => [...row]);
        const columnHeadersSnapshot = [...columnHeaders];

        syncTableStateForUndo(
          tableDataSnapshot,
          hasHeader,
          columnHeadersSnapshot,
          columnCounter
        );

        clearTimeout(typingTimeoutRef.current);

        const capturedHeader = hasHeader;
        const capturedHeaders = columnHeadersSnapshot;
        const capturedCounter = columnCounter;
        const capturedData = tableDataSnapshot;

        typingTimeoutRef.current = setTimeout(() => {
          saveTable(
            capturedData,
            capturedHeader,
            capturedHeaders,
            capturedCounter
          );
          typingTimeoutRef.current = null;
        }, 1000); // Wait 1 second after user stops typing

        return;
      }

      // Mark user modification to prevent state reset during typing
      markUserModification();

      // Save cursor position before any state changes
      const savedCursorPosition = saveCursorPosition();

      // Use innerHTML to preserve HTML elements like <br> tags, but clean zero-width spaces
      // Sanitize the content before processing
      let content = sanitizeTableCell(e.target.innerHTML);

      // Remove zero-width spaces from saved content
      if (content === "\u200B") {
        content = "";
      } else {
        content = content.replace(/\u200B/g, "");
      }

      const updatedRow = [...(tableData[rowIndex] || [])];
      updatedRow[colIndex] = content;
      const newTableData = [...tableData];
      newTableData[rowIndex] = updatedRow;

      // Update state
      setTableData(newTableData);

      // Save to parent using saveTable function
      saveTable(newTableData, hasHeader, columnHeaders, columnCounter);

      // Restore cursor position after state update
      if (savedCursorPosition) {
        // Use requestAnimationFrame to ensure DOM updates are complete
        requestAnimationFrame(() => {
          restoreCursorPosition(savedCursorPosition);
        });
      }
    },
    [
      tableData,
      hasHeader,
      columnHeaders,
      columnCounter,
      saveTable,
      syncTableStateForUndo,
      activateAutoSave,
      markUserModification,
      saveCursorPosition,
      restoreCursorPosition,
    ]
  );

  // Handle cell paste
  const handleCellPaste = useCallback(
    (e, rowIndex, colIndex) => {
      e.preventDefault();

      // Try to get HTML content first to preserve formatting
      let pasteContent = (e.clipboardData || window.clipboardData).getData(
        "text/html"
      );

      // If no HTML content, fall back to plain text
      if (!pasteContent) {
        pasteContent = (e.clipboardData || window.clipboardData).getData(
          "text"
        );
      }

      const selection = window.getSelection();

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        // Check if we have HTML content
        const hasHtml = (e.clipboardData || window.clipboardData).getData(
          "text/html"
        );

        if (hasHtml) {
          // Create a temporary div to parse HTML and sanitize it
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = pasteContent;

          // Remove any script tags and dangerous attributes for security
          const scripts = tempDiv.querySelectorAll("script");
          scripts.forEach((script) => script.remove());

          // Remove dangerous attributes and unwanted styling
          const allElements = tempDiv.querySelectorAll("*");
          allElements.forEach((el) => {
            // Remove dangerous attributes
            el.removeAttribute("onclick");
            el.removeAttribute("onload");
            el.removeAttribute("onerror");

            // Handle style attribute selectively - preserve only background-color for highlights
            if (el.hasAttribute("style")) {
              const style = el.style;
              const backgroundColor = style.backgroundColor;

              // Normalize color for comparison
              const normalizeColor = (color) => {
                return color ? color.toLowerCase().replace(/\s+/g, "") : "";
              };

              const normalizedBg = normalizeColor(backgroundColor);

              // Check if this is a legitimate highlight color
              // Includes: #fff3b0 (light), #facc15 (dark), #daa520 (midnight), #ffff00 (pure yellow)
              const isLikelyHighlight =
                normalizedBg &&
                // Hex formats
                (normalizedBg.includes("fff3b0") || // light theme
                  normalizedBg.includes("facc15") || // dark theme
                  normalizedBg.includes("daa520") || // midnight theme
                  normalizedBg.includes("ffff00") || // pure yellow
                  normalizedBg.includes("yellow") ||
                  // RGB formats for light theme #fff3b0 = rgb(255, 243, 176)
                  normalizedBg.includes("rgb(255,243,176)") ||
                  normalizedBg.includes("rgba(255,243,176") ||
                  // RGB formats for dark theme #facc15 = rgb(250, 204, 21)
                  normalizedBg.includes("rgb(250,204,21)") ||
                  normalizedBg.includes("rgba(250,204,21") ||
                  // RGB formats for midnight theme #daa520 = rgb(218, 165, 32)
                  normalizedBg.includes("rgb(218,165,32)") ||
                  normalizedBg.includes("rgba(218,165,32") ||
                  // RGB formats for pure yellow #ffff00 = rgb(255, 255, 0)
                  normalizedBg.includes("rgb(255,255,0)") ||
                  normalizedBg.includes("rgba(255,255,0"));

              if (isLikelyHighlight) {
                // Keep only background-color, remove everything else
                const bg = style.backgroundColor;
                el.removeAttribute("style");
                el.style.backgroundColor = bg;
              } else {
                // Remove all styles for non-highlight elements
                el.removeAttribute("style");
              }
            }

            // Remove class attributes that might contain styling
            el.removeAttribute("class");

            // Remove other styling-related attributes
            el.removeAttribute("bgcolor");
            el.removeAttribute("background");
            el.removeAttribute("color");
          });

          // Insert the HTML content as a document fragment
          const fragment = document.createDocumentFragment();
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }

          range.insertNode(fragment);

          // Move cursor to end of pasted content
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Plain text paste
          const textNode = document.createTextNode(pasteContent);
          range.insertNode(textNode);

          // Move cursor to end of pasted text
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      // Note: Cell height adjustment is handled by the TableCell component's useEffect

      // CRITICAL FIX: Update the data immediately after paste to prevent content from disappearing
      // Use setTimeout to ensure DOM has fully updated before capturing content
      // This prevents race conditions where a re-render might reset the cell content
      setTimeout(() => {
        const fakeEvent = {
          target: e.target,
        };
        handleCellChange(rowIndex, colIndex, fakeEvent);
      }, 0);
    },
    [handleCellChange]
  );

  // Add row
  const addRow = (position = "end") => {
    markUserModification(); // Prevent state reset during this operation

    const newRow = new Array(tableData[0]?.length || 1).fill("");
    const newTableData = [...tableData];

    if (position === "end") {
      newTableData.push(newRow);
    } else {
      newTableData.splice(position, 0, newRow);
    }

    // Update local state immediately
    setTableData(newTableData);

    // Debounce the save to prevent immediate auto-save during user interaction
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      saveTable(newTableData);
    }, 500); // Shorter delay for structural changes
  };

  // Remove row
  const removeRow = (rowIndex) => {
    if (tableData.length <= 1) return;

    markUserModification(); // Prevent state reset during this operation

    const newTableData = tableData.filter((_, index) => index !== rowIndex);
    setTableData(newTableData);
    saveTable(newTableData);
  };

  // Add column
  const addColumn = (position = "end") => {
    markUserModification(); // Prevent state reset during this operation

    const newTableData = tableData.map((row) => {
      const newRow = [...row];
      if (position === "end") {
        newRow.push("");
      } else {
        newRow.splice(position, 0, "");
      }
      return newRow;
    });

    // Create new column headers array with next available number for new column
    const newColumnHeaders = [...columnHeaders];
    const nextHeaderNumber = columnCounter + 1;

    if (position === "end") {
      newColumnHeaders.push(nextHeaderNumber);
    } else {
      newColumnHeaders.splice(position, 0, nextHeaderNumber);
    }

    const newColumnCounter = columnCounter + 1;

    // Update local state immediately
    setTableData(newTableData);
    setColumnHeaders(newColumnHeaders);
    setColumnCounter(newColumnCounter);

    // Debounce the save to prevent immediate auto-save during user interaction
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      saveTable(newTableData, hasHeader, newColumnHeaders, newColumnCounter);
    }, 500); // Shorter delay for structural changes
  };

  // Remove column
  const removeColumn = (colIndex) => {
    if (tableData[0]?.length <= 1) return;

    markUserModification(); // Prevent state reset during this operation

    const newTableData = tableData.map((row) =>
      row.filter((_, index) => index !== colIndex)
    );

    // Remove the corresponding header number (don't renumber existing ones)
    const newColumnHeaders = columnHeaders.filter(
      (_, index) => index !== colIndex
    );

    setTableData(newTableData);
    setColumnHeaders(newColumnHeaders);
    saveTable(newTableData, hasHeader, newColumnHeaders, columnCounter);
  };

  // Toggle header
  const toggleHeader = () => {
    const newHasHeader = !hasHeader;
    setHasHeader(newHasHeader);
    saveTable(tableData, newHasHeader);
  };

  const isCaretAtStart = useCallback((element) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !element.contains(range.startContainer)) {
      return false;
    }

    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);

    const precedingText = preRange.toString().replace(/\u200B/g, "");
    return precedingText.length === 0;
  }, []);

  const isCaretAtStartOfLine = useCallback(
    (element) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      if (!range.collapsed || !element.contains(range.startContainer)) {
        return false;
      }

      // Get the current position
      const currentOffset = range.startOffset;
      const currentNode = range.startContainer;

      // If we're at the beginning of the entire element, return true
      if (isCaretAtStart(element)) {
        return true;
      }

      // Create a range to get text before the cursor up to the start of the current line
      const preRange = range.cloneRange();
      preRange.selectNodeContents(element);
      preRange.setEnd(currentNode, currentOffset);

      const textBeforeCursor = preRange.toString();

      // Find the last newline character before the cursor
      const lastNewlineIndex = textBeforeCursor.lastIndexOf("\n");

      // If there's no newline, we're on the first line, check if at start of element
      if (lastNewlineIndex === -1) {
        return isCaretAtStart(element);
      }

      // Check if cursor is immediately after the last newline (start of current line)
      const textAfterLastNewline = textBeforeCursor.substring(
        lastNewlineIndex + 1
      );
      return textAfterLastNewline.length === 0;
    },
    [isCaretAtStart]
  );

  const getCurrentLinePosition = useCallback((element) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !element.contains(range.startContainer)) {
      return 0;
    }

    // Get text before cursor
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);

    const textBeforeCursor = preRange.toString();

    // Find the last newline character before the cursor
    const lastNewlineIndex = textBeforeCursor.lastIndexOf("\n");

    // Return position within current line
    if (lastNewlineIndex === -1) {
      return textBeforeCursor.length; // First line
    } else {
      return textBeforeCursor.length - lastNewlineIndex - 1; // Position after last newline
    }
  }, []);

  const setCursorAtLinePosition = useCallback((element, position) => {
    if (!element) return;

    try {
      const selection = window.getSelection();
      if (!selection) return;

      const textContent = element.textContent || "";

      // If position is 0, set at start
      if (position === 0) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }

      // Try to set cursor at the specified position within the first line
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let currentOffset = 0;
      let targetNode = null;
      let targetOffset = 0;

      let node;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= position) {
          targetNode = node;
          targetOffset = position - currentOffset;
          break;
        }
        currentOffset += nodeLength;
      }

      if (targetNode) {
        const range = document.createRange();
        range.setStart(
          targetNode,
          Math.min(targetOffset, targetNode.textContent.length)
        );
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Fallback: set at end
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (error) {
      // Fallback: just focus the element
      element.focus();
    }
  }, []);

  const isCaretAtEnd = useCallback((element) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed || !element.contains(range.endContainer)) {
      return false;
    }

    const postRange = range.cloneRange();
    postRange.selectNodeContents(element);
    postRange.setStart(range.endContainer, range.endOffset);

    const trailingText = postRange.toString().replace(/\u200B/g, "");
    return trailingText.length === 0;
  }, []);

  const isCaretAtEndOfLine = useCallback(
    (element) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      if (!range.collapsed || !element.contains(range.endContainer)) {
        return false;
      }

      // Get the current position
      const currentOffset = range.endOffset;
      const currentNode = range.endContainer;

      // If we're at the end of the entire element, return true
      if (isCaretAtEnd(element)) {
        return true;
      }

      // Create a range to get text after the cursor
      const postRange = range.cloneRange();
      postRange.selectNodeContents(element);
      postRange.setStart(currentNode, currentOffset);

      const textAfterCursor = postRange.toString();

      // Find the next newline character after the cursor
      const nextNewlineIndex = textAfterCursor.indexOf("\n");

      // If there's no newline after cursor, we're on the last line, check if at end of element
      if (nextNewlineIndex === -1) {
        return isCaretAtEnd(element);
      }

      // Check if cursor is immediately before the next newline (end of current line)
      const textBeforeNextNewline = textAfterCursor.substring(
        0,
        nextNewlineIndex
      );
      return textBeforeNextNewline.length === 0;
    },
    [isCaretAtEnd]
  );

  // Handle keyboard navigation in table
  const selectEntireTable = useCallback(() => {
    const tableElement = tableElementRef.current;
    if (!tableElement) return;

    const selection = window.getSelection();
    if (selection) {
      try {
        const range = document.createRange();
        range.selectNodeContents(tableElement);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) {
        console.warn("Failed to select entire table:", error);
      }
    }

    const focusTarget =
      tableWrapperRef.current || tableBlockContainerRef.current;
    setSelectedCell(null);
    setIsTableSelected(true);

    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
  }, [setSelectedCell]);

  const handleKeyDown = useCallback(
    (e, rowIndex, colIndex) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        e.stopPropagation();
        selectEntireTable();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        // Insert a tab character at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const tabNode = document.createTextNode("\t");
          range.insertNode(tabNode);
          range.setStartAfter(tabNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          // Trigger cell change to save the tab
          setTimeout(() => {
            if (e.target) {
              handleInput({ target: e.target });
            }
          }, 0);
        }
      } else if (e.key === "Enter") {
        // Both Enter and Shift+Enter should add line breaks within the cell
        // This is handled in handleKeyDownEvent, so we don't need to do anything here
      } else if (
        e.key === "ArrowUp" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const element = e.target;

          if (
            !element.textContent ||
            element.textContent.replace(/\u200B/g, "").trim().length === 0
          ) {
            e.preventDefault();
            const nextRow = rowIndex - 1;
            if (nextRow >= 0) {
              const cellKey = `${nextRow}-${colIndex}`;
              const targetCell = cellRefs.current[cellKey];
              if (targetCell) {
                targetCell.focus();
                setTimeout(() => {
                  const targetSelection = window.getSelection();
                  if (targetSelection) {
                    const nextRange = document.createRange();
                    nextRange.selectNodeContents(targetCell);
                    nextRange.collapse(false);
                    targetSelection.removeAllRanges();
                    targetSelection.addRange(nextRange);
                  }
                }, 0);
              }
            }
            return;
          }

          const beforeRect = range.getBoundingClientRect();
          const beforeOffset = range.startOffset;

          setTimeout(() => {
            const newSelection = window.getSelection();
            if (newSelection && newSelection.rangeCount > 0) {
              const newRange = newSelection.getRangeAt(0);
              const afterRect = newRange.getBoundingClientRect();
              const afterOffset = newRange.startOffset;

              const didNotMove =
                Math.abs(beforeRect.top - afterRect.top) < 2 &&
                Math.abs(beforeRect.left - afterRect.left) < 2 &&
                beforeOffset === afterOffset;

              if (didNotMove && isCaretAtStart(element)) {
                const nextRow = rowIndex - 1;
                if (nextRow >= 0) {
                  const cellKey = `${nextRow}-${colIndex}`;
                  const targetCell = cellRefs.current[cellKey];
                  if (targetCell) {
                    targetCell.focus();
                    setTimeout(() => {
                      const targetSelection = window.getSelection();
                      if (targetSelection) {
                        const nextRange = document.createRange();
                        nextRange.selectNodeContents(targetCell);
                        nextRange.collapse(false);
                        targetSelection.removeAllRanges();
                        targetSelection.addRange(nextRange);
                      }
                    }, 0);
                  }
                }
              }
            }
          }, 0);
        }
      } else if (
        e.key === "ArrowDown" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const element = e.target;

          if (
            !element.textContent ||
            element.textContent.replace(/\u200B/g, "").trim().length === 0
          ) {
            e.preventDefault();
            const nextRow = rowIndex + 1;
            if (nextRow < tableData.length) {
              const cellKey = `${nextRow}-${colIndex}`;
              const targetCell = cellRefs.current[cellKey];
              if (targetCell) {
                targetCell.focus();
                setTimeout(() => {
                  const targetSelection = window.getSelection();
                  if (targetSelection) {
                    const nextRange = document.createRange();
                    nextRange.selectNodeContents(targetCell);
                    nextRange.collapse(true);
                    targetSelection.removeAllRanges();
                    targetSelection.addRange(nextRange);
                  }
                }, 0);
              }
            }
            return;
          }

          const beforeRect = range.getBoundingClientRect();
          const beforeOffset = range.startOffset;

          setTimeout(() => {
            const newSelection = window.getSelection();
            if (newSelection && newSelection.rangeCount > 0) {
              const newRange = newSelection.getRangeAt(0);
              const afterRect = newRange.getBoundingClientRect();
              const afterOffset = newRange.startOffset;

              const didNotMove =
                Math.abs(beforeRect.top - afterRect.top) < 2 &&
                Math.abs(beforeRect.left - afterRect.left) < 2 &&
                beforeOffset === afterOffset;

              if (didNotMove && isCaretAtEnd(element)) {
                const nextRow = rowIndex + 1;
                if (nextRow < tableData.length) {
                  const cellKey = `${nextRow}-${colIndex}`;
                  const targetCell = cellRefs.current[cellKey];
                  if (targetCell) {
                    targetCell.focus();
                    setTimeout(() => {
                      const targetSelection = window.getSelection();
                      if (targetSelection) {
                        const nextRange = document.createRange();
                        nextRange.selectNodeContents(targetCell);
                        nextRange.collapse(true);
                        targetSelection.removeAllRanges();
                        targetSelection.addRange(nextRange);
                      }
                    }, 0);
                  }
                }
              }
            }
          }, 0);
        }
      } else if (e.key === "ArrowLeft" && !e.ctrlKey && !e.metaKey) {
        // Move to previous cell only if cursor is at start of current line
        const element = e.target;
        if (isCaretAtStartOfLine(element)) {
          e.preventDefault();
          let prevCol = colIndex - 1;
          let prevRow = rowIndex;
          if (prevCol < 0 && prevRow > 0) {
            prevRow = rowIndex - 1;
            prevCol = tableData[prevRow].length - 1;
          }
          if (prevCol >= 0 && prevRow >= 0) {
            const cellKey = `${prevRow}-${prevCol}`;
            const targetCell = cellRefs.current[cellKey];
            if (targetCell) {
              // Focus the target cell first
              targetCell.focus();

              // Set cursor position with better timing
              requestAnimationFrame(() => {
                try {
                  const range = document.createRange();
                  const selection = window.getSelection();

                  if (targetCell.childNodes.length > 0) {
                    // Find the last text node or go to the end
                    let lastNode = targetCell;
                    let offset = 0;

                    // Walk through all child nodes to find the last text position
                    const walker = document.createTreeWalker(
                      targetCell,
                      NodeFilter.SHOW_TEXT,
                      null,
                      false
                    );

                    let node;
                    while ((node = walker.nextNode())) {
                      lastNode = node;
                      offset = node.textContent.length;
                    }

                    if (lastNode === targetCell) {
                      // No text nodes, set range on the element itself
                      range.selectNodeContents(targetCell);
                      range.collapse(false);
                    } else {
                      // Set range at the end of the last text node
                      range.setStart(lastNode, offset);
                      range.collapse(true);
                    }
                  } else {
                    // Empty cell
                    range.selectNodeContents(targetCell);
                    range.collapse(false);
                  }

                  if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                } catch (error) {
                  // Fallback: just ensure focus
                  targetCell.focus();
                }
              });
            }
          }
        }
      } else if (e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey) {
        // Move to next cell only if cursor is at end of current line
        const element = e.target;
        if (isCaretAtEndOfLine(element)) {
          e.preventDefault();
          let nextCol = colIndex + 1;
          let nextRow = rowIndex;
          if (
            nextCol >= tableData[rowIndex].length &&
            nextRow < tableData.length - 1
          ) {
            nextRow = rowIndex + 1;
            nextCol = 0;
          }
          if (nextCol < tableData[nextRow].length) {
            const cellKey = `${nextRow}-${nextCol}`;
            const targetCell = cellRefs.current[cellKey];
            if (targetCell) {
              // Focus the target cell first
              targetCell.focus();

              // Set cursor position with better timing
              requestAnimationFrame(() => {
                try {
                  const range = document.createRange();
                  const selection = window.getSelection();

                  if (targetCell.childNodes.length > 0) {
                    // Find the first text node or go to the start
                    let firstNode = targetCell;
                    let offset = 0;

                    // Walk through all child nodes to find the first text position
                    const walker = document.createTreeWalker(
                      targetCell,
                      NodeFilter.SHOW_TEXT,
                      null,
                      false
                    );

                    const firstTextNode = walker.nextNode();
                    if (firstTextNode) {
                      firstNode = firstTextNode;
                      offset = 0;
                    }

                    if (firstNode === targetCell) {
                      // No text nodes, set range on the element itself
                      range.selectNodeContents(targetCell);
                      range.collapse(true);
                    } else {
                      // Set range at the start of the first text node
                      range.setStart(firstNode, offset);
                      range.collapse(true);
                    }
                  } else {
                    // Empty cell
                    range.selectNodeContents(targetCell);
                    range.collapse(true);
                  }

                  if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                } catch (error) {
                  // Fallback: just ensure focus
                  targetCell.focus();
                }
              });
            }
          }
        }
      } else if (e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Left: Move to previous cell
        e.preventDefault();
        let prevCol = colIndex - 1;
        let prevRow = rowIndex;
        if (prevCol < 0 && prevRow > 0) {
          prevRow = rowIndex - 1;
          prevCol = tableData[prevRow].length - 1;
        }
        if (prevCol >= 0 && prevRow >= 0) {
          const cellKey = `${prevRow}-${prevCol}`;
          cellRefs.current[cellKey]?.focus();
        }
      } else if (e.key === "ArrowRight" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Right: Move to next cell
        e.preventDefault();
        let nextCol = colIndex + 1;
        let nextRow = rowIndex;
        if (
          nextCol >= tableData[rowIndex].length &&
          nextRow < tableData.length - 1
        ) {
          nextRow = rowIndex + 1;
          nextCol = 0;
        }
        if (nextCol < tableData[nextRow].length) {
          const cellKey = `${nextRow}-${nextCol}`;
          cellRefs.current[cellKey]?.focus();
        }
      }
    },
    [
      tableData,
      addRow,
      isCaretAtEnd,
      isCaretAtStart,
      isCaretAtStartOfLine,
      isCaretAtEndOfLine,
      getCurrentLinePosition,
      setCursorAtLinePosition,
      selectEntireTable,
    ]
  );

  // Handle scroll to hide buttons during scrolling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set timeout to show buttons again after scrolling stops
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150); // Show buttons 150ms after scrolling stops
    };

    const wrapper = tableWrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener("scroll", handleScroll);
      return () => {
        wrapper.removeEventListener("scroll", handleScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, []);

  // Handle Cmd+S / Ctrl+S save functionality
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        selectEntireTable();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault(); // Prevent browser save dialog
        // Save table data immediately
        saveTable(tableData, hasHeader, columnHeaders, columnCounter);

        // Trigger the notes app's global save after ensuring table save completes
        setTimeout(() => {
          const syntheticEvent = new KeyboardEvent("keydown", {
            key: "s",
            code: "KeyS",
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            bubbles: true,
            cancelable: true,
          });

          // Dispatch on document to reach the ModernNoteEditor's global handler
          document.dispatchEvent(syntheticEvent);
        }, 10); // Small delay to ensure table save completes first
      }
    };

    // Add event listener to the table wrapper
    const wrapper = tableWrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener("keydown", handleKeyDown);
      return () => {
        wrapper.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [
    tableData,
    hasHeader,
    columnHeaders,
    columnCounter,
    saveTable,
    selectEntireTable,
  ]);

  useEffect(() => {
    if (!isTableSelected) return undefined;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const targetElement = tableElementRef.current;

      if (!selection || selection.rangeCount === 0 || !targetElement) {
        setIsTableSelected(false);
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;

      if (
        targetElement.contains(anchorNode) &&
        targetElement.contains(focusNode)
      ) {
        return;
      }

      try {
        if (!selection.containsNode(targetElement, true)) {
          setIsTableSelected(false);
        }
      } catch (error) {
        setIsTableSelected(false);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [isTableSelected]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (cellRefs.current.saveTimeout) {
        clearTimeout(cellRefs.current.saveTimeout);
      }
      if (userModifyTimeoutRef.current) {
        clearTimeout(userModifyTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const [isHeaderButtonVisible, setIsHeaderButtonVisible] = useState(false);

  return (
    <div
      ref={tableBlockContainerRef}
      className="table-block-container group"
      onFocus={(e) => e.stopPropagation()}
      onInput={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (
          (e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          e.key &&
          e.key.toLowerCase() === "a"
        ) {
          e.preventDefault();
          selectEntireTable();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault(); // Prevent browser save dialog
          // Save table data immediately
          saveTable(tableData, hasHeader, columnHeaders, columnCounter);

          // Trigger the notes app's global save after ensuring table save completes
          setTimeout(() => {
            const syntheticEvent = new KeyboardEvent("keydown", {
              key: "s",
              code: "KeyS",
              metaKey: e.metaKey,
              ctrlKey: e.ctrlKey,
              bubbles: true,
              cancelable: true,
            });

            // Dispatch on document to reach the ModernNoteEditor's global handler
            document.dispatchEvent(syntheticEvent);
          }, 10); // Small delay to ensure table save completes first
        }
      }}
      {...commonProps}
    >
      {/* Header Toggle - with hover behavior like divider */}
      <div
        className={`transition-all duration-200 overflow-hidden flex justify-start items-center w-full px-2 ${
          isHeaderButtonVisible
            ? "opacity-100 max-h-12 py-2"
            : "opacity-0 max-h-0 py-0 group-hover:opacity-100 group-hover:max-h-12 group-hover:py-2"
        }`}
        onMouseEnter={() => setIsHeaderButtonVisible(true)}
        onMouseLeave={() => setIsHeaderButtonVisible(false)}
      >
        <button
          onClick={toggleHeader}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors select-none ${
            hasHeader
              ? "bg-blue-500 dark:bg-blue-600 midnight:bg-indigo-600 text-white"
              : "bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300"
          }`}
        >
          Header
        </button>
      </div>

      {/* Table Container with Hover Zones */}
      <div className="table-wrapper relative">
        <div
          ref={tableWrapperRef}
          className="table-scroll-container"
          tabIndex={0}
        >
          <div
            ref={tableContainerRef}
            className={`table-container relative ${
              isTableSelected ? "table-selected-overlay" : ""
            }`}
          >
            {isTableSelected && (
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-blue-500/25 dark:bg-blue-400/20 midnight:bg-indigo-500/25 backdrop-blur-[1px] z-40"></div>
            )}
            <table
              ref={tableElementRef}
              className="border-separate border-spacing-0 rounded-xl overflow-hidden relative z-30"
              style={{
                tableLayout: "fixed",
                width: `${getColumnWidth * (tableData[0]?.length || 1)}px`,
                minWidth: `${120 * (tableData[0]?.length || 1)}px`,
              }}
            >
              <tbody>
                {tableData.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    ref={(el) => (rowRefs.current[rowIndex] = el)}
                    className="group"
                    onMouseEnter={() => setHoveredRow(rowIndex)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {row.map((cell, colIndex) => {
                      const cellKey = `${rowIndex}-${colIndex}`;
                      const isHeader = hasHeader && rowIndex === 0;

                      return (
                        <td
                          key={colIndex}
                          ref={(el) => (colRefs.current[colIndex] = el)}
                          className={`p-0 relative ${
                            isHeader
                              ? "bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900"
                              : "bg-white dark:bg-gray-900 midnight:bg-gray-950"
                          }`}
                          style={{
                            width: `${getColumnWidth}px`,
                            minWidth: "120px",
                            maxWidth: "250px",
                            cursor: "text",
                          }}
                          onMouseEnter={() => setHoveredCol(colIndex)}
                          onMouseLeave={() => setHoveredCol(null)}
                        >
                          <TableCell
                            key={cellKey} // Use stable key to maintain focus during typing
                            cellKey={cellKey}
                            cell={cell}
                            isHeader={isHeader}
                            rowIndex={rowIndex}
                            colIndex={colIndex}
                            onCellChange={handleCellChange}
                            onCellPaste={handleCellPaste}
                            onKeyDown={handleKeyDown}
                            onCellFocus={handleCellFocus}
                            cellRefs={cellRefs}
                            columnWidth={getColumnWidth}
                            headerNumber={columnHeaders[colIndex]}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Remove Column Buttons (Top) */}
        {tableData[0]?.map((_, colIndex) => {
          const colElement = colRefs.current[colIndex];
          const colRect = colElement?.getBoundingClientRect();
          const scrollContainer = tableWrapperRef.current;
          const wrapperRect = scrollContainer?.getBoundingClientRect();

          let leftOffset = 0;
          if (colRect && wrapperRect) {
            leftOffset =
              colRect.left - wrapperRect.left + colRect.width / 2 - 16 + 40; // -16 for half button width, +40 for wrapper padding
          }

          const isVisible = isElementVisible(colRect, wrapperRect);

          return (
            <div
              key={`remove-col-${colIndex}`}
              className="absolute w-8 h-8 flex items-center justify-center z-50"
              style={{
                left: `${leftOffset}px`,
                top: `15px`,
              }}
              onMouseEnter={() => setHoveredCol(colIndex)}
              onMouseLeave={() => setHoveredCol(null)}
            >
              {hoveredCol === colIndex &&
                tableData[0]?.length > 1 &&
                !isScrolling &&
                isVisible && (
                  <button
                    onClick={() => removeColumn(colIndex)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 shadow-lg transition-all duration-200 opacity-0 animate-[fadeIn_100ms_ease-out_forwards]"
                    title="Delete this column"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
            </div>
          );
        })}

        {/* Remove Row Buttons (Left Side) */}
        {tableData.map((_, rowIndex) => {
          const rowElement = rowRefs.current[rowIndex];
          const rowRect = rowElement?.getBoundingClientRect();
          const scrollContainer = tableWrapperRef.current;
          const wrapperRect = scrollContainer?.getBoundingClientRect();

          // Check if first column is visible for remove row button visibility
          const firstColElement = colRefs.current[0];
          const firstColRect = firstColElement?.getBoundingClientRect();
          const isFirstColumnVisible =
            firstColRect &&
            wrapperRect &&
            firstColRect.left >= wrapperRect.left - 10; // Small tolerance

          let topOffset = 0;
          if (rowRect && wrapperRect) {
            topOffset =
              rowRect.top - wrapperRect.top + rowRect.height / 2 - 16 + 32; // -16 for half button height, +32 for wrapper padding
          }

          return (
            <div
              key={`remove-row-${rowIndex}`}
              className="absolute w-8 h-8 flex items-center justify-center z-50"
              style={{
                left: `25px`,
                top: `${topOffset}px`,
              }}
              onMouseEnter={() => setHoveredRow(rowIndex)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {hoveredRow === rowIndex &&
                tableData.length > 1 &&
                !isScrolling &&
                isFirstColumnVisible && (
                  <button
                    onClick={() => removeRow(rowIndex)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 shadow-lg transition-all duration-200 opacity-0 animate-[fadeIn_100ms_ease-out_forwards]"
                    title="Delete this row"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
            </div>
          );
        })}

        {/* Add Row Buttons (Right Side) */}
        {tableData.map((_, rowIndex) => {
          const rowElement = rowRefs.current[rowIndex];
          const rowRect = rowElement?.getBoundingClientRect();
          const scrollContainer = tableWrapperRef.current;
          const wrapperRect = scrollContainer?.getBoundingClientRect();

          // Position at the last column's right edge (always show when row is visible)
          const lastColIndex = tableData[0]?.length - 1 || 0;
          const lastColElement = colRefs.current[lastColIndex];
          const lastColRect = lastColElement?.getBoundingClientRect();

          let leftOffset = 0;
          let topOffset = 0;

          if (rowRect && wrapperRect) {
            topOffset =
              rowRect.top - wrapperRect.top + rowRect.height / 2 - 16 + 32; // -16 for half button height, +32 for wrapper padding
          }

          if (lastColRect && wrapperRect) {
            // Position button just outside the right edge of the last column
            leftOffset = lastColRect.right - wrapperRect.left + 25; // 25px gap from last column's right edge
          } else {
            // If we can't get proper column positioning, don't show the button
            return null;
          }

          // For add row buttons, check if row is vertically visible AND button position is horizontally within bounds
          const isRowVisible =
            rowRect &&
            wrapperRect &&
            rowRect.bottom > wrapperRect.top &&
            rowRect.top < wrapperRect.bottom;

          // Check if the last column is actually visible in the viewport
          const isLastColumnVisible =
            lastColRect.right > wrapperRect.left &&
            lastColRect.left < wrapperRect.right;

          // Check if the button position would be within reasonable bounds of the viewport
          const buttonAbsoluteLeft = lastColRect.right + 25;
          const isButtonInViewport =
            buttonAbsoluteLeft < wrapperRect.right + 50; // Small tolerance

          // Only render if everything is properly positioned and visible
          if (!isRowVisible || !isLastColumnVisible || !isButtonInViewport) {
            return null;
          }

          return (
            <div
              key={`add-row-${rowIndex}`}
              className="absolute w-8 h-8 flex items-center justify-center z-50"
              style={{
                left: `${leftOffset}px`,
                top: `${topOffset}px`,
              }}
              onMouseEnter={() => setHoveredAddRow(rowIndex)}
              onMouseLeave={() => setHoveredAddRow(null)}
            >
              {hoveredAddRow === rowIndex && !isScrolling && (
                <button
                  onClick={() => addRow(rowIndex + 1)}
                  className="w-5 h-5 flex items-center justify-center text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/20 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 shadow-sm transition-all duration-200 opacity-0 animate-[fadeIn_100ms_ease-out_forwards]"
                  title="Add row"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Column Buttons (Bottom) */}
        {tableData[0]?.map((_, colIndex) => {
          const colElement = colRefs.current[colIndex];
          const colRect = colElement?.getBoundingClientRect();
          const scrollContainer = tableWrapperRef.current;
          const wrapperRect = scrollContainer?.getBoundingClientRect();

          // Position at the last row's bottom edge (always show when column is visible)
          const lastRowIndex = tableData.length - 1;
          const lastRowElement = rowRefs.current[lastRowIndex];
          const lastRowRect = lastRowElement?.getBoundingClientRect();

          let leftOffset = 0;
          let topOffset = 0;

          if (colRect && wrapperRect) {
            leftOffset =
              colRect.left - wrapperRect.left + colRect.width / 2 - 16 + 40; // -16 for half button width, +40 for wrapper padding
          }

          if (lastRowRect && wrapperRect) {
            // Position button at the bottom edge of the last row (overlay)
            topOffset = lastRowRect.bottom - wrapperRect.top + 16; // -8px to position inside the table
          } else {
            // Fallback: use fixed bottom position
            topOffset = 48; // Default bottom position
          }

          // For add column buttons, check if column is sufficiently visible (not just any overlap)
          const isColVisible = isElementVisible(colRect, wrapperRect);

          return (
            <div
              key={`add-col-${colIndex}`}
              className="absolute w-8 h-8 flex items-center justify-center z-50"
              style={{
                left: `${leftOffset}px`,
                top: `${topOffset}px`,
              }}
              onMouseEnter={() => setHoveredAddCol(colIndex)}
              onMouseLeave={() => setHoveredAddCol(null)}
            >
              {hoveredAddCol === colIndex && !isScrolling && isColVisible && (
                <button
                  onClick={() => addColumn(colIndex + 1)}
                  className="w-5 h-5 flex items-center justify-center text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-900/20 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-600 midnight:border-gray-700 shadow-sm transition-all duration-200 opacity-0 animate-[fadeIn_100ms_ease-out_forwards]"
                  title="Add column"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .table-block-container {
          width: 100%;
          margin: 0.5rem 0;
          position: relative;
          isolation: isolate;
        }
        
        .table-wrapper {
          position: relative;
          padding-left: 2.5rem;
          padding-right: 2.5rem;
          padding-top: 2rem;
          padding-bottom: 3.5rem;
          overflow: visible;
          max-width: 100%;
        }

        .table-scroll-container {
          overflow-x: auto;
          overflow-y: visible;
          width: 100%;
          padding-bottom: 40px;
          margin-bottom: -40px;
        }

        /* Custom scrollbar styling - ultra thin and subtle */
        .table-scroll-container::-webkit-scrollbar {
          height: 2px;
        }

        .table-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }

        /* Only show scrollbar when hovering over the table area */
        .table-scroll-container::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 1px;
        }

        .table-scroll-container:hover::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.15);
        }

        .dark .table-scroll-container:hover::-webkit-scrollbar-thumb {
          background: rgba(107, 114, 128, 0.15);
        }

        .midnight .table-scroll-container:hover::-webkit-scrollbar-thumb {
          background: rgba(165, 180, 252, 0.15);
        }

        /* Firefox scrollbar styling - ultra thin and subtle */
        .table-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }

        .table-scroll-container:hover {
          scrollbar-color: rgba(156, 163, 175, 0.15) transparent;
        }

        .dark .table-scroll-container:hover {
          scrollbar-color: rgba(107, 114, 128, 0.15) transparent;
        }

        .midnight .table-scroll-container:hover {
          scrollbar-color: rgba(165, 180, 252, 0.15) transparent;
        }
        
        .table-container {
          display: inline-block;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          background: white;
          width: fit-content;
          min-width: max-content;
        }

        .dark .table-container {
          background: rgb(17 24 39);
        }

        .midnight .table-container {
          background: rgb(15 23 42);
        }
        
        .table-block-container table {
          width: 100%;
          font-size: 14px;
          position: relative;
          border: 2px solid rgb(209 213 219);
          background: transparent;
        }

        .dark .table-block-container table {
          border-color: rgb(75 85 99);
        }

        .midnight .table-block-container table {
          border-color: rgb(55 65 81);
        }

        .table-block-container td {
          border-right: 1px solid rgb(229 231 235);
          border-bottom: 1px solid rgb(229 231 235);
          padding: 0;
          margin: 0;
          vertical-align: top;
          position: relative;
          cursor: text;
          min-height: 2.5rem;
          height: auto;
        }

        .table-block-container td {
          position: relative;
          min-height: 2.5rem;
          height: auto;
          vertical-align: top;
        }

        .dark .table-block-container td {
          border-color: rgb(55 65 81);
        }

        .midnight .table-block-container td {
          border-color: rgb(75 85 99);
        }

        .table-block-container tbody tr td:last-child {
          border-right: none;
        }

        .table-block-container tbody tr:last-child td {
          border-bottom: none;
        }

        .table-block-container tbody tr:first-child td:first-child {
          border-top-left-radius: 10px;
        }

        .table-block-container tbody tr:first-child td:last-child {
          border-top-right-radius: 10px;
        }

        .table-block-container tbody tr:last-child td:first-child {
          border-bottom-left-radius: 10px;
        }

        .table-block-container tbody tr:last-child td:last-child {
          border-bottom-right-radius: 10px;
        }

        .table-block-container tbody tr:first-child td:first-child [contenteditable] {
          border-top-left-radius: 8px;
        }

        .table-block-container tbody tr:first-child td:last-child [contenteditable] {
          border-top-right-radius: 8px;
        }

        .table-block-container tbody tr:last-child td:first-child [contenteditable] {
          border-bottom-left-radius: 8px;
        }

        .table-block-container tbody tr:last-child td:last-child [contenteditable] {
          border-bottom-right-radius: 8px;
        }

        .table-block-container tbody tr:first-child td:first-child [contenteditable]:focus {
          border-top-left-radius: 8px;
        }

        .table-block-container tbody tr:first-child td:last-child [contenteditable]:focus {
          border-top-right-radius: 8px;
        }

        .table-block-container tbody tr:last-child td:first-child [contenteditable]:focus {
          border-bottom-left-radius: 8px;
        }

        .table-block-container tbody tr:last-child td:last-child [contenteditable]:focus {
          border-bottom-right-radius: 8px;
        }
        
        .table-block-container [contenteditable] {
          line-height: 1.4;
          word-wrap: break-word;
          word-break: break-word;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          min-height: 2.5rem;
          z-index: 1;
          display: block;
          cursor: text;
          padding: 0.5rem 0.75rem;
          margin: 0;
          border: none;
          box-sizing: border-box;
          resize: none;
        }

        .table-block-container .text-center[contenteditable] {
          text-align: center !important;
          display: block;
          min-height: 2.5rem;
        }

        .table-block-container [contenteditable]:focus {
          outline: none;
          box-shadow: inset 0 0 0 2px rgb(59, 130, 246);
          position: relative;
          z-index: 2;
          border-radius: inherit;
        }
        
        .table-block-container [contenteditable]:empty:before {
          content: attr(placeholder);
          color: #9ca3af;
          pointer-events: none;
          font-style: italic;
          position: absolute;
          left: 0;
          top: 0;
          display: block;
        }

        .table-block-container .font-semibold[contenteditable]:empty:before {
          left: 0;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          text-align: center;
          width: 100%;
          padding: 0 0.75rem;
          box-sizing: border-box;
        }
        
        .dark .table-block-container [contenteditable]:empty:before {
          color: #6b7280;
        }
        
        .midnight .table-block-container [contenteditable]:empty:before {
          color: #a5b4fc;
        }

        /* Ensure BR tags work properly and don't show as text */
        .table-block-container [contenteditable] br {
          display: block;
          content: "";
          margin: 0;
          padding: 0;
          line-height: normal;
        }

        /* Hide any stray BR text nodes */
        .table-block-container [contenteditable]:after {
          content: "";
          white-space: pre;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
});

export default TableBlock;
