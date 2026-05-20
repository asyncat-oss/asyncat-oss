// cardService.js — single-user SQLite kanban card service
import { randomUUID } from "crypto";
import storageService from "./storageService.js";

const isValidUUID = (uuid) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const normalizeChecklistItem = (item) => ({
  id: item.id,
  text: item.text || item.title || "",
  completed: Boolean(item.completed),
});

const normalizeChecklist = (checklist = []) => {
  if (!Array.isArray(checklist)) return [];
  return checklist.map(normalizeChecklistItem);
};

function computeProgress(checklist = []) {
  if (!checklist.length) return { progress: 0, completed: 0, total: 0 };
  const completed = checklist.filter((t) => t.completed).length;
  return {
    progress: Math.round((completed / checklist.length) * 100),
    completed,
    total: checklist.length,
  };
}

const getCards = async (columnId, db) => {
  if (!isValidUUID(columnId)) throw new Error("Invalid column ID format");
  const { data: cards, error } = await db
    .schema("kanban")
    .from("Cards")
    .select("*")
    .eq("columnId", columnId)
    .order('"order"', { ascending: true });
  if (error) throw error;
  return (cards || []).map(enrichCard);
};

const getCardById = async (id, db) => {
  if (!isValidUUID(id)) throw new Error("Invalid card ID format");
  const { data: card, error } = await db
    .schema("kanban")
    .from("Cards")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") throw new Error("Card not found");
    throw error;
  }
  if (!card) throw new Error("Card not found");
  return enrichCard(card);
};

const createCard = async (cardData, db, files = []) => {
  const {
    title,
    description,
    priority = "Medium",
    columnId,
    order,
    checklist = [],
    createdBy,
    attachments = [],
  } = cardData;

  if (!isValidUUID(columnId)) throw new Error("Invalid column ID format");
  if (!isValidUUID(createdBy)) throw new Error("Invalid user ID format");

  const processedChecklist = normalizeChecklist(checklist);
  const { progress, completed, total } = computeProgress(processedChecklist);

  let uploadedAttachments = [];
  if (files && files.length > 0) {
    const tempCardId = `temp-${Date.now()}`;
    try {
      uploadedAttachments = await Promise.all(
        files.map((file) => storageService.uploadFile(file, tempCardId))
      );
    } catch (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }
  }

  const allAttachments = [
    ...(Array.isArray(attachments) ? attachments : []),
    ...uploadedAttachments,
  ];

  const cardToCreate = {
    id: randomUUID(),
    title,
    description,
    priority,
    columnId,
    order: order || 0,
    checklist: processedChecklist,
    createdBy,
    attachments: allAttachments,
    progress,
    tasks: { completed, total },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { data: card, error } = await db
    .schema("kanban")
    .from("Cards")
    .insert([cardToCreate])
    .select()
    .single();
  if (error) throw error;
  return enrichCard(card);
};

const updateCard = async (id, cardData, db) => {
  if (!isValidUUID(id)) throw new Error("Invalid card ID format");

  const updateData = { ...cardData };
  // Strip team-only fields
  delete updateData.assignees;
  delete updateData.administrator_id;
  delete updateData.startDate;
  delete updateData.dueDate;
  delete updateData.predictedMinutes;

  if (updateData.checklist) {
    updateData.checklist = normalizeChecklist(updateData.checklist);
    const { progress, completed, total } = computeProgress(updateData.checklist);
    updateData.progress = progress;
    updateData.tasks = { completed, total };
  }

  updateData.updatedAt = new Date().toISOString();

  const { data: updatedCard, error } = await db
    .schema("kanban")
    .from("Cards")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return enrichCard(updatedCard);
};

const deleteCard = async (id, db) => {
  if (!isValidUUID(id)) throw new Error("Invalid card ID format");

  const card = await getCardById(id, db);
  if (card.attachments && Array.isArray(card.attachments) && card.attachments.length > 0) {
    await Promise.all(
      card.attachments.map((att) =>
        att.blobName
          ? storageService.deleteFile(att.blobName).catch(() => {})
          : Promise.resolve()
      )
    );
  }

  const { error } = await db.schema("kanban").from("Cards").delete().eq("id", id);
  if (error) throw error;
  return { message: "Card deleted successfully" };
};

const moveCard = async (cardId, sourceColumnId, destinationColumnId, newOrder, db) => {
  if (!isValidUUID(cardId) || !isValidUUID(sourceColumnId) || !isValidUUID(destinationColumnId)) {
    throw new Error("Invalid ID format");
  }

  const card = await getCardById(cardId, db);

  const { data: sourceColumn, error: sourceError } = await db
    .schema("kanban").from("Columns").select("*").eq("id", sourceColumnId).single();
  if (sourceError) throw sourceError;

  const { data: destColumn, error: destError } = await db
    .schema("kanban").from("Columns").select("*").eq("id", destinationColumnId).single();
  if (destError) throw destError;

  if (!sourceColumn || !destColumn) throw new Error("Source or destination column not found");

  const cardUpdates = {
    columnId: destinationColumnId,
    order: newOrder,
    updatedAt: new Date().toISOString(),
  };

  const oldOrder = card.order;

  if (sourceColumnId === destinationColumnId) {
    if (newOrder < oldOrder) {
      const { data: toUpdate } = await db.schema("kanban").from("Cards").select("id, order")
        .eq("columnId", sourceColumnId).gte("order", newOrder).lt("order", oldOrder);
      for (const c of toUpdate || []) {
        await db.schema("kanban").from("Cards").update({ order: c.order + 1, updatedAt: new Date().toISOString() }).eq("id", c.id);
      }
    } else if (newOrder > oldOrder) {
      const { data: toUpdate } = await db.schema("kanban").from("Cards").select("id, order")
        .eq("columnId", sourceColumnId).gt("order", oldOrder).lte("order", newOrder);
      for (const c of toUpdate || []) {
        await db.schema("kanban").from("Cards").update({ order: c.order - 1, updatedAt: new Date().toISOString() }).eq("id", c.id);
      }
    }
  } else {
    const { data: srcToUpdate } = await db.schema("kanban").from("Cards").select("id, order")
      .eq("columnId", sourceColumnId).gt("order", oldOrder);
    for (const c of srcToUpdate || []) {
      await db.schema("kanban").from("Cards").update({ order: c.order - 1, updatedAt: new Date().toISOString() }).eq("id", c.id);
    }
    const { data: dstToUpdate } = await db.schema("kanban").from("Cards").select("id, order")
      .eq("columnId", destinationColumnId).gte("order", newOrder);
    for (const c of dstToUpdate || []) {
      await db.schema("kanban").from("Cards").update({ order: c.order + 1, updatedAt: new Date().toISOString() }).eq("id", c.id);
    }
  }

  const { data: updatedCard, error: updateError } = await db
    .schema("kanban").from("Cards").update(cardUpdates).eq("id", cardId).select().single();
  if (updateError) throw updateError;

  const { data: updSrc } = await db.schema("kanban").from("Columns").select("*").eq("id", sourceColumnId).single();
  const { data: srcCards } = await db.schema("kanban").from("Cards").select("*").eq("columnId", sourceColumnId).order('"order"', { ascending: true });
  updSrc.Cards = srcCards || [];

  let updDst = updSrc;
  if (sourceColumnId !== destinationColumnId) {
    const { data: dstCol } = await db.schema("kanban").from("Columns").select("*").eq("id", destinationColumnId).single();
    const { data: dstCards } = await db.schema("kanban").from("Cards").select("*").eq("columnId", destinationColumnId).order('"order"', { ascending: true });
    dstCol.Cards = dstCards || [];
    updDst = dstCol;
  }

  return { sourceColumn: updSrc, destinationColumn: updDst, card: enrichCard(updatedCard) };
};

const updateChecklist = async (id, checklist, db) => {
  if (!isValidUUID(id)) throw new Error("Invalid card ID format");

  const processedChecklist = normalizeChecklist(checklist);
  const { progress, completed, total } = computeProgress(processedChecklist);

  const { data: updatedCard, error } = await db
    .schema("kanban")
    .from("Cards")
    .update({
      checklist: processedChecklist,
      progress,
      tasks: { completed, total },
      updatedAt: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return enrichCard(updatedCard);
};

const addAttachments = async (cardId, files, db) => {
  if (!isValidUUID(cardId)) throw new Error("Invalid card ID format");
  const card = await getCardById(cardId, db);
  const uploadedAttachments = await Promise.all(
    files.map((file) => storageService.uploadFile(file, cardId))
  );
  const allAttachments = [...(Array.isArray(card.attachments) ? card.attachments : []), ...uploadedAttachments];
  const { data: updatedCard, error } = await db.schema("kanban").from("Cards")
    .update({ attachments: allAttachments, updatedAt: new Date().toISOString() })
    .eq("id", cardId).select().single();
  if (error) throw error;
  return enrichCard(updatedCard);
};

const removeAttachment = async (cardId, blobName, db) => {
  if (!isValidUUID(cardId)) throw new Error("Invalid card ID format");
  const card = await getCardById(cardId, db);
  const att = card.attachments?.find((a) => a.blobName === blobName);
  if (!att) throw new Error("Attachment not found");
  await storageService.deleteFile(blobName);
  const updatedAttachments = (card.attachments || []).filter((a) => a.blobName !== blobName);
  const { data: updatedCard, error } = await db.schema("kanban").from("Cards")
    .update({ attachments: updatedAttachments, updatedAt: new Date().toISOString() })
    .eq("id", cardId).select().single();
  if (error) throw error;
  return enrichCard(updatedCard);
};

// Enrich a card row: normalise checklist, strip dead fields
function enrichCard(card) {
  if (!card) return card;
  const checklist = normalizeChecklist(
    Array.isArray(card.checklist) ? card.checklist : parseJsonSafe(card.checklist, [])
  );
  const { progress, completed, total } = computeProgress(checklist);
  return {
    ...card,
    checklist,
    progress: card.progress ?? progress,
    tasks: card.tasks ?? { completed, total },
  };
}

function parseJsonSafe(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export default {
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  moveCard,
  updateChecklist,
  addAttachments,
  removeAttachment,
};
