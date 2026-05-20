// cardController.js
import cardService from "../services/cardService.js";

const getCards = async (req, res) => {
  try {
    const cards = await cardService.getCards(req.params.columnId, req.db);
    res.status(200).json(cards);
  } catch (error) {
    res.status(error.message === "Invalid column ID format" ? 400 : 500).json({ error: error.message });
  }
};

const getCard = async (req, res) => {
  try {
    const card = await cardService.getCardById(req.params.id, req.db);
    res.status(200).json(card);
  } catch (error) {
    res.status(error.message === "Card not found" ? 404 : 500).json({ error: error.message });
  }
};

const createCard = async (req, res) => {
  try {
    let cardData;
    let files = [];

    if (req.files && req.files.length > 0) {
      try {
        cardData = req.body.cardData ? JSON.parse(req.body.cardData) : null;
        if (!cardData) return res.status(400).json({ error: "cardData field is required when uploading files" });
      } catch {
        return res.status(400).json({ error: "Invalid cardData format" });
      }
      files = req.files.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      }));
    } else {
      cardData = req.body;
    }

    cardData.createdBy = req.user.id;
    const newCard = await cardService.createCard(cardData, req.db, files);
    res.status(201).json({ ...newCard, success: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const updateCard = async (req, res) => {
  try {
    const updatedCard = await cardService.updateCard(req.params.id, req.body, req.db);
    res.status(200).json(updatedCard);
  } catch (error) {
    res.status(error.message === "Card not found" ? 404 : 500).json({ error: error.message });
  }
};

const deleteCard = async (req, res) => {
  try {
    await cardService.deleteCard(req.params.id, req.db);
    res.status(200).json({ message: "Card deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const moveCard = async (req, res) => {
  try {
    const { sourceColumnId, destinationColumnId, newOrder } = req.body;
    const result = await cardService.moveCard(req.params.id, sourceColumnId, destinationColumnId, newOrder, req.db);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateChecklist = async (req, res) => {
  try {
    const updatedCard = await cardService.updateChecklist(req.params.id, req.body.checklist, req.db);
    res.status(200).json({ ...updatedCard, success: true });
  } catch (error) {
    res.status(error.message === "Card not found" ? 404 : 500).json({ error: error.message });
  }
};

const addAttachment = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files provided" });
    const files = req.files.map((f) => ({ originalname: f.originalname, mimetype: f.mimetype, buffer: f.buffer, size: f.size }));
    const updatedCard = await cardService.addAttachments(req.params.id, files, req.db);
    res.status(200).json(updatedCard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const removeAttachment = async (req, res) => {
  try {
    const updatedCard = await cardService.removeAttachment(req.params.id, decodeURIComponent(req.params.attachmentId), req.db);
    res.status(200).json(updatedCard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default {
  getCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  moveCard,
  updateChecklist,
  addAttachment,
  addMultipleAttachments: addAttachment,
  removeAttachment,
};
