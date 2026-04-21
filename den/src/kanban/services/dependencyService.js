// dependencyService.js - Updated to use Supabase

// UUID validation helper
const isValidUUID = (uuid) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
};

// Get dependencies for a card using the TaskDependencies table
const getCardDependencies = async (cardId, db) => {
  try {
    if (!isValidUUID(cardId)) {
      throw new Error("Invalid card ID format");
    }

    const { data: dependencies, error } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('*')
      .eq('sourceCardId', cardId);

    if (error) throw error;

    return dependencies || [];
  } catch (error) {
    console.error("Error getting card dependencies:", error);
    throw error;
  }
};

// Get cards that depend on this card
const getDependentCards = async (cardId, db) => {
  try {
    if (!isValidUUID(cardId)) {
      throw new Error("Invalid card ID format");
    }

    const { data: dependentCards, error } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('*')
      .eq('targetCardId', cardId);

    if (error) throw error;

    return dependentCards || [];
  } catch (error) {
    console.error("Error getting dependent cards:", error);
    throw error;
  }
};

// Check for circular dependencies
const hasCircularDependency = async (sourceCardId, targetCardId, db, visited = new Set()) => {
  if (visited.has(sourceCardId)) {
    return true; // Circular dependency detected
  }

  if (sourceCardId === targetCardId) {
    return true; // Self-reference
  }

  visited.add(sourceCardId);

  try {
    // Find all cards that this source card depends on
    const { data: dependencies, error } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('targetCardId')
      .eq('sourceCardId', sourceCardId);

    if (error) throw error;

    if (dependencies && dependencies.length > 0) {
      for (const dep of dependencies) {
        if (await hasCircularDependency(dep.targetCardId, targetCardId, db, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking circular dependency:", error);
    return false;
  }
};

// Create a new dependency relationship
const createDependency = async (sourceCardId, targetCardId, type = "FS", lag = 0, db) => {
  try {
    if (!isValidUUID(sourceCardId) || !isValidUUID(targetCardId)) {
      throw new Error("Invalid card ID format");
    }

    // Validate both cards exist
    const { data: sourceCard, error: sourceError } = await db
      .schema('kanban')
      .from('Cards')
      .select('id')
      .eq('id', sourceCardId)
      .single();

    if (sourceError) {
      if (sourceError.code === 'PGRST116') {
        throw new Error("Source card not found");
      }
      throw sourceError;
    }

    const { data: targetCard, error: targetError } = await db
      .schema('kanban')
      .from('Cards')
      .select('id')
      .eq('id', targetCardId)
      .single();

    if (targetError) {
      if (targetError.code === 'PGRST116') {
        throw new Error("Target card not found");
      }
      throw targetError;
    }

    // Validate dependency type
    if (!["FS", "SS", "FF", "SF"].includes(type)) {
      throw new Error(`Invalid dependency type: ${type}`);
    }

    // Check if dependency already exists
    const { data: existingDep, error: existingError } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('*')
      .eq('sourceCardId', sourceCardId)
      .eq('targetCardId', targetCardId)
      .single();

    if (existingDep && !existingError) {
      // Update the existing dependency with new type/lag
      const { data: updatedDep, error: updateError } = await db
        .schema('kanban')
        .from('TaskDependencies')
        .update({ 
          type, 
          lag,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', existingDep.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedDep;
    }

    // Check for circular dependencies
    if (await hasCircularDependency(targetCardId, sourceCardId, db)) {
      throw new Error("Cannot create circular dependency");
    }

    // Check if there's at least one completion column in the system
    const { data: completionColumn, error: columnError } = await db
      .schema('kanban')
      .from('Columns')
      .select('id')
      .eq('isCompletionColumn', true)
      .limit(1)
      .single();

    if (columnError && columnError.code === 'PGRST116') {
      throw new Error("Cannot add dependencies: Your project requires at least one completion column to use dependencies");
    }

    if (columnError && columnError.code !== 'PGRST116') {
      throw columnError;
    }

    // Create the new dependency
    const { data: dependency, error } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .insert([{
        sourceCardId,
        targetCardId,
        type,
        lag,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    return dependency;
  } catch (error) {
    console.error("Error creating dependency:", error);
    throw error;
  }
};

// Remove a dependency
const deleteDependency = async (sourceCardId, targetCardId, db) => {
  try {
    if (!isValidUUID(sourceCardId) || !isValidUUID(targetCardId)) {
      throw new Error("Invalid card ID format");
    }

    const { data: deletedDep, error } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .delete()
      .eq('sourceCardId', sourceCardId)
      .eq('targetCardId', targetCardId)
      .select();

    if (error) throw error;

    return { deleted: deletedDep && deletedDep.length > 0 };
  } catch (error) {
    console.error("Error deleting dependency:", error);
    throw error;
  }
};

// Check if all dependencies are met for a card
const areDependenciesMet = async (cardId, db) => {
  try {
    if (!isValidUUID(cardId)) {
      throw new Error("Invalid card ID format");
    }

    // Get all dependencies for this card
    const { data: dependencies, error: depsError } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('*')
      .eq('sourceCardId', cardId);

    if (depsError) throw depsError;

    if (!dependencies || dependencies.length === 0) {
      return true; // No dependencies to meet
    }

    // Get all target cards for the dependencies
    const targetCardIds = dependencies.map(dep => dep.targetCardId);
    
    if (targetCardIds.length === 0) {
      return true; // No dependencies to meet
    }
    
    const { data: targetCards, error: cardsError } = await db
      .schema('kanban')
      .from('Cards')
      .select('*')
      .in('id', targetCardIds);

    if (cardsError) throw cardsError;

    // Get columns for target cards
    const columnIds = [...new Set((targetCards || []).map(card => card.columnId))];
    const { data: columns, error: columnsError } = await db
      .schema('kanban')
      .from('Columns')
      .select('*')
      .in('id', columnIds);

    if (columnsError) throw columnsError;

    // Create lookup maps
    const targetCardMap = new Map((targetCards || []).map(card => [card.id, card]));
    const columnMap = new Map((columns || []).map(col => [col.id, col]));

    for (const dependency of dependencies) {
      const depCard = targetCardMap.get(dependency.targetCardId);
      const depType = dependency.type;

      if (!depCard) {
        console.warn(`Target card ${dependency.targetCardId} not found for dependency`);
        continue;
      }

      const depColumn = columnMap.get(depCard.columnId);

      switch (depType) {
        case "FS":
          // For FS, the dependency card must be completed
          if (!depCard.completedAt && !depColumn?.isCompletionColumn) {
            return false;
          }
          break;

        case "SS":
          // For SS, the dependency card must be started
          if (!depCard.startedAt) {
            return false;
          }
          break;

        case "FF":
          // For FF, the dependency card must be completed
          if (!depCard.completedAt && !depColumn?.isCompletionColumn) {
            return false;
          }
          break;

        case "SF":
          // For SF, the dependency card must be started
          if (!depCard.startedAt) {
            return false;
          }
          break;
      }

      // Check lag time if applicable
      if (dependency.lag > 0) {
        let referenceDate;

        if (depType === "FS" || depType === "FF") {
          referenceDate = depCard.completedAt;
        } else {
          referenceDate = depCard.startedAt;
        }

        if (referenceDate) {
          const now = new Date();
          const lagMs = dependency.lag * 60 * 60 * 1000; // Convert hours to milliseconds
          const requiredDate = new Date(new Date(referenceDate).getTime() + lagMs);

          if (now < requiredDate) {
            return false; // Lag time not satisfied yet
          }
        }
      }
    }

    return true; // All dependencies are met
  } catch (error) {
    console.error("Error checking dependencies:", error);
    throw error;
  }
};

// Get cards that would be unblocked if a dependency card is completed
const getUnlockedCardsByDependency = async (cardId, db) => {
  try {
    if (!isValidUUID(cardId)) {
      throw new Error("Invalid card ID format");
    }

    // Get all cards that depend on this card
    const { data: dependentCards, error: depsError } = await db
      .schema('kanban')
      .from('TaskDependencies')
      .select('*')
      .eq('targetCardId', cardId);

    if (depsError) throw depsError;

    if (!dependentCards || dependentCards.length === 0) {
      return [];
    }

    // Get the source cards
    const sourceCardIds = dependentCards.map(dep => dep.sourceCardId);
    
    const { data: sourceCards, error: cardsError } = await db
      .schema('kanban')
      .from('Cards')
      .select('*')
      .in('id', sourceCardIds);

    if (cardsError) throw cardsError;

    // Get columns for source cards
    const columnIds = [...new Set((sourceCards || []).map(card => card.columnId))];
    const { data: columns, error: columnsError } = await db
      .schema('kanban')
      .from('Columns')
      .select('*')
      .in('id', columnIds);

    if (columnsError) throw columnsError;

    // Create lookup maps
    const sourceCardMap = new Map((sourceCards || []).map(card => [card.id, card]));
    const columnMap = new Map((columns || []).map(col => [col.id, col]));

    // Filter dependent cards to only those that would be unblocked
    const unlockedCards = [];

    for (const dep of dependentCards) {
      const sourceCard = sourceCardMap.get(dep.sourceCardId);

      if (!sourceCard) {
        console.warn(`Source card ${dep.sourceCardId} not found for dependency`);
        continue;
      }

      const sourceColumn = columnMap.get(sourceCard.columnId);

      // Skip cards that are already completed
      if (sourceCard.completedAt || sourceColumn?.isCompletionColumn) {
        continue;
      }

      // For FS and FF types, this card's completion would unblock the dependent card
      if (dep.type === "FS" || dep.type === "FF") {
        // But we need to check if all other dependencies are also met
        const allDependenciesMet = await areDependenciesMet(sourceCard.id, db);

        // If this is the last dependency to be met, the card is unblocked
        if (allDependenciesMet) {
          // Add column info to the source card
          sourceCard.Column = sourceColumn;
          unlockedCards.push(sourceCard);
        }
      }
    }

    return unlockedCards;
  } catch (error) {
    console.error("Error getting unblocked cards:", error);
    throw error;
  }
};

// Alias functions for controller compatibility
const checkDependenciesStatus = areDependenciesMet;
const getUnlockedCards = getUnlockedCardsByDependency;

export default {
  getCardDependencies,
  getDependentCards,
  createDependency,
  deleteDependency,
  areDependenciesMet,
  getUnlockedCardsByDependency,
  hasCircularDependency,
  // Controller-compatible aliases
  checkDependenciesStatus,
  getUnlockedCards,
};