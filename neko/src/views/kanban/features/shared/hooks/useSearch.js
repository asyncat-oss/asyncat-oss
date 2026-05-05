import { useState, useEffect, useCallback } from "react";
import { useColumnContext } from "../../../../context/viewContexts";

export const useSearch = () => {
  const { columns } = useColumnContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [selectedColumnId, setSelectedColumnId] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Extract all searchable content from cards and columns
  const getAllContent = useCallback(() => {
    const content = {
      titles: new Set(),
      descriptions: new Set(),
      tags: new Set(),
      priorities: new Set(),
      columns: new Map(),
      columnTitles: new Set(),
      cardMap: new Map(),
      titleToCardMap: new Map(),
      tagToCardMap: new Map(),
      priorityToCardMap: new Map(),
      columnTitleToColumnMap: new Map(),
    };

    if (!Array.isArray(columns)) return content;

    columns.forEach((column) => {
      // Add column information
      content.columns.set(column.id, column.title);
      content.columnTitles.add(column.title.toLowerCase());
      content.columnTitleToColumnMap.set(column.title.toLowerCase(), column);

      if (!column?.Cards) return;

      column.Cards.forEach((card) => {
        // Store card reference mapped by ID
        content.cardMap.set(card.id, {
          ...card,
          columnId: column.id,
          columnTitle: column.title,
        });

        // Add searchable content
        if (card.title) {
          const titleLower = card.title.toLowerCase();
          content.titles.add(titleLower);
          content.titleToCardMap.set(titleLower, card);
        }

        if (card.description)
          content.descriptions.add(card.description.toLowerCase());

        if (card.priority) {
          const priorityLower = card.priority.toLowerCase();
          content.priorities.add(priorityLower);
          content.priorityToCardMap.set(priorityLower, card);
        }

        if (Array.isArray(card.tags)) {
          card.tags.forEach((tag) => {
            const tagLower = tag.toLowerCase();
            content.tags.add(tagLower);
            content.tagToCardMap.set(tagLower, card);
          });
        }
      });
    });

    return content;
  }, [columns]);

  // Search function
  const performSearch = useCallback(
    (term) => {
      if (!term.trim()) {
        setSearchResults([]);
        setSuggestions([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      const normalizedTerm = term.toLowerCase();
      const content = getAllContent();
      const results = [];

      // Generate suggestions based on titles, tags, priorities, column titles, etc.
      const suggestionSet = new Set();
      const suggestionToEntityMap = new Map();

      // Add title suggestions
      content.titles.forEach((title) => {
        if (title.includes(normalizedTerm)) {
          suggestionSet.add(title);
          suggestionToEntityMap.set(title, {
            type: "card",
            entity: content.titleToCardMap.get(title),
          });
        }
      });

      // Add tag suggestions
      content.tags.forEach((tag) => {
        if (tag.includes(normalizedTerm)) {
          const suggestionText = `#${tag}`;
          suggestionSet.add(suggestionText);
          suggestionToEntityMap.set(suggestionText, {
            type: "card",
            entity: content.tagToCardMap.get(tag),
          });
        }
      });

      // Add priority suggestions
      content.priorities.forEach((priority) => {
        if (priority.includes(normalizedTerm)) {
          const suggestionText = `priority:${priority}`;
          suggestionSet.add(suggestionText);
          suggestionToEntityMap.set(suggestionText, {
            type: "card",
            entity: content.priorityToCardMap.get(priority),
          });
        }
      });

      // Add column suggestions
      content.columnTitles.forEach((columnTitle) => {
        if (columnTitle.includes(normalizedTerm)) {
          const suggestionText = `column:${columnTitle}`;
          suggestionSet.add(suggestionText);
          suggestionToEntityMap.set(suggestionText, {
            type: "column",
            entity: content.columnTitleToColumnMap.get(columnTitle),
          });
        }
      });

      // Search through the columns
      columns.forEach((column) => {
        if (column.title.toLowerCase().includes(normalizedTerm)) {
          results.push({
            type: "column",
            column,
            matches: ["title"],
            score: 15, // Higher score for column matches
          });
        }
      });

      // Search through the cards
      content.cardMap.forEach((card) => {
        let matches = [];
        let score = 0;

        // Check title match (highest score)
        if (card.title && card.title.toLowerCase().includes(normalizedTerm)) {
          matches.push("title");
          score += 10;
        }

        // Check description match
        if (
          card.description &&
          card.description.toLowerCase().includes(normalizedTerm)
        ) {
          matches.push("description");
          score += 5;
        }

        // Check tags match
        if (Array.isArray(card.tags)) {
          const tagMatches = card.tags.filter((tag) =>
            tag.toLowerCase().includes(normalizedTerm)
          );
          if (tagMatches.length > 0) {
            matches.push("tags");
            score += tagMatches.length * 3;
          }
        }

        // Check priority match
        if (
          card.priority &&
          card.priority.toLowerCase().includes(normalizedTerm)
        ) {
          matches.push("priority");
          score += 2;
        }

        // Check if the search term matches the column title this card belongs to
        if (
          card.columnTitle &&
          card.columnTitle.toLowerCase().includes(normalizedTerm)
        ) {
          matches.push("column");
          score += 2;
        }

        // If any matches found, add to results
        if (matches.length > 0) {
          results.push({
            type: "card",
            card,
            matches,
            score,
          });
        }
      });

      // Sort results by score (highest first)
      results.sort((a, b) => b.score - a.score);

      // Process suggestions
      const suggestions = Array.from(suggestionSet)
        .slice(0, 5)
        .map((text) => ({
          text,
          ...suggestionToEntityMap.get(text),
        }));

      setSearchResults(results);
      setSuggestions(suggestions);
      setIsSearching(false);
    },
    [columns, getAllContent]
  );

  // Update search when term changes
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchTerm);
    }, 200); // Debounce search for better performance

    return () => clearTimeout(timer);
  }, [searchTerm, performSearch]);

  // Scroll card into view
  const scrollToCard = useCallback((cardId) => {
    if (!cardId) return;

    const cardElement = document.getElementById(`card-${cardId}`);
    if (cardElement) {
      cardElement.scrollIntoView({ behavior: "smooth", block: "center" });

      // Highlight the card temporarily
      cardElement.classList.add("search-highlight");
      setTimeout(() => {
        cardElement.classList.remove("search-highlight");
      }, 2000);

      setSelectedCardId(cardId);
    }
  }, []);

  // Scroll column into view
  const scrollToColumn = useCallback((columnId) => {
    if (!columnId) return;

    const columnElement = document.getElementById(`column-${columnId}`);
    if (columnElement) {
      columnElement.scrollIntoView({ behavior: "smooth", block: "center" });

      // Highlight the column temporarily
      columnElement.classList.add("search-highlight");
      setTimeout(() => {
        columnElement.classList.remove("search-highlight");
      }, 2000);

      setSelectedColumnId(columnId);
    }
  }, []);

  // Navigate to a search result (either card or column)
  const navigateToResult = useCallback(
    (result) => {
      if (!result) return;

      if (result.type === "card") {
        const card = result.card || result.entity;
        if (card && card.id) {
          scrollToCard(card.id);
          // We no longer set the selected card to avoid showing the detail modal
        }
      } else if (result.type === "column") {
        const column = result.column || result.entity;
        if (column && column.id) {
          scrollToColumn(column.id);
        }
      }
    },
    [scrollToCard, scrollToColumn]
  );

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (suggestion) => {
      setSearchTerm(suggestion.text);

      // If suggestion has entity info, navigate to it
      if (suggestion.type && suggestion.entity) {
        navigateToResult(suggestion);
      }
    },
    [navigateToResult]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setSearchResults([]);
    setSuggestions([]);
    setSelectedCardId(null);
    setSelectedColumnId(null);
    setIsSearching(false);
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    searchResults,
    suggestions,
    selectedCardId,
    selectedColumnId,
    isSearching,
    performSearch,
    scrollToCard,
    scrollToColumn,
    navigateToResult,
    handleSuggestionClick,
    clearSearch,
  };
};

export default useSearch;
