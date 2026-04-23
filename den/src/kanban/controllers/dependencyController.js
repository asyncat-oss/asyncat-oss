// dependencyController.js - Updated to use Supabase
import dependencyService from "../services/dependencyService.js";

// Get all dependencies for a card
const getCardDependencies = async (req, res) => {
  try {
    const { cardId } = req.params;
    const dependencies = await dependencyService.getCardDependencies(cardId, req.db);
    res.status(200).json(dependencies);
  } catch (error) {
    console.error("Error getting dependencies:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all cards that depend on this card
const getDependentCards = async (req, res) => {
  try {
    const { cardId } = req.params;
    const dependentCards = await dependencyService.getDependentCards(cardId, req.db);
    res.status(200).json(dependentCards);
  } catch (error) {
    console.error("Error getting dependent cards:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create a new dependency
const createDependency = async (req, res) => {
  try {
    const { cardId } = req.params;
    const { targetCardId, type, lag } = req.body;

    if (!targetCardId) {
      return res.status(400).json({ error: "Target card ID is required" });
    }

    // Create the dependency
    const dependency = await dependencyService.createDependency(
      cardId,
      targetCardId,
      type || "FS",
      lag || 0,
      req.db
    );

    res.status(201).json(dependency);
  } catch (error) {
    console.error("Error creating dependency:", error);
    const statusCode = error.message.includes("not found") ? 404 : 
                      error.message.includes("circular") ? 400 : 500;
    res.status(statusCode).json({ error: error.message });
  }
};

// Delete a dependency
const deleteDependency = async (req, res) => {
  try {
    const { cardId, targetCardId } = req.params;

    const result = await dependencyService.deleteDependency(
      cardId,
      targetCardId,
      req.db
    );

    res.status(200).json({ message: "Dependency deleted successfully" });
  } catch (error) {
    console.error("Error deleting dependency:", error);
    res.status(500).json({ error: error.message });
  }
};

// Check dependencies status for a card
const checkDependenciesStatus = async (req, res) => {
  try {
    const { cardId } = req.params;
    const areMet = await dependencyService.areDependenciesMet(cardId, req.db);
    
    res.status(200).json({
      areDependenciesMet: areMet,
      cardId,
    });
  } catch (error) {
    console.error("Error checking dependencies status:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get unlocked cards that can be started
const getUnlockedCards = async (req, res) => {
  try {
    const { cardId } = req.params;
    const unlockedCards = await dependencyService.getUnlockedCardsByDependency(cardId, req.db);
    res.status(200).json(unlockedCards);
  } catch (error) {
    console.error("Error getting unlocked cards:", error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  getCardDependencies,
  getDependentCards,
  createDependency,
  deleteDependency,
  checkDependenciesStatus,
  getUnlockedCards,
};