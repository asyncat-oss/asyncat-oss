import * as noteService from "../service/noteService.js";

const blocksToHtml = (blocks) => {
  if (!blocks || !Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      const content = block.content || "";

      switch (block.type) {
        case "heading1": return `<h1>${content}</h1>`;
        case "heading2": return `<h2>${content}</h2>`;
        case "heading3": return `<h3>${content}</h3>`;
        case "bullet_list":
        case "bulletList": return `<ul><li>${content}</li></ul>`;
        case "numbered_list":
        case "numberedList": return `<ol><li>${content}</li></ol>`;
        case "todo": {
          const checked = block.properties?.checked ? "checked" : "";
          return `<p><input type="checkbox" ${checked} disabled> ${content}</p>`;
        }
        case "quote": return `<blockquote>${content}</blockquote>`;
        case "code": return `<pre><code>${content}</code></pre>`;

        case "image": {
          const { url, alt, caption, width, height } = block.properties || {};
          const imgAlt = alt || caption || "Image";
          let imgTag = `<img src="${url || ""}" alt="${imgAlt}"`;
          if (width) imgTag += ` width="${width}"`;
          if (height) imgTag += ` height="${height}"`;
          imgTag += ' style="max-width: 100%; height: auto;" />';
          return caption
            ? `<figure>${imgTag}<figcaption>${caption}</figcaption></figure>`
            : imgTag;
        }

        case "audio": {
          const { url, filename } = block.properties || {};
          if (!url) return "<div>Audio (no file)</div>";
          return `<div style="margin: 12px 0;">
            <audio controls style="width: 100%; max-width: 600px;">
              <source src="${url}">
            </audio>
            ${filename ? `<p style="margin: 4px 0; font-size: 14px; color: #666;">${filename}</p>` : ""}
          </div>`;
        }

        case "table": {
          const tableData = block.properties?.tableData || [[""]];
          const hasHeader = block.properties?.hasHeader || false;
          if (!tableData.length) return "<div>Empty table</div>";

          let tableHtml = '<table border="1" style="border-collapse: collapse; width: 100%;">';
          tableData.forEach((row, rowIndex) => {
            const tag = hasHeader && rowIndex === 0 ? "th" : "td";
            tableHtml += "<tr>";
            row.forEach((cell) => {
              tableHtml += `<${tag} style="padding: 8px; border: 1px solid #ccc;">${cell || ""}</${tag}>`;
            });
            tableHtml += "</tr>";
          });
          tableHtml += "</table>";
          return tableHtml;
        }

        case "linkPreview": {
          const { title, description, domain, url } = block.properties || {};
          if (!url) return "<div>Link preview (no URL)</div>";
          return `<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0;">
            <h4 style="margin: 0 0 8px 0;">${title || domain || "Link Preview"}</h4>
            ${description ? `<p style="margin: 0 0 8px 0; color: #666;">${description}</p>` : ""}
            <a href="${url}" target="_blank" style="color: #0066cc; text-decoration: none;">🔗 ${domain || url}</a>
          </div>`;
        }

        case "file": {
          const { url, filename, size, type } = block.properties || {};
          const fileIcon = type?.startsWith("image/") ? "🖼️"
            : type?.startsWith("video/") ? "🎥"
            : type?.startsWith("audio/") ? "🎵"
            : "📎";
          const sizeText = size ? ` (${(size / 1024 / 1024).toFixed(2)}MB)` : "";
          return `<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0;">
            <p style="margin: 0;">
              ${fileIcon} <a href="${url || "#"}" target="_blank" style="color: #0066cc; text-decoration: none;">
                ${filename || "Attached File"}
              </a>${sizeText}
            </p>
          </div>`;
        }

        case "pieChart":
        case "barChart":
        case "lineChart": {
          const chartData = block.properties?.data;
          const chartConfig = block.properties?.config;
          const chartType = block.type.replace("Chart", " Chart");
          if (!chartData?.labels || !chartData?.datasets) return `<div>[${chartType} - No data]</div>`;

          const title = chartConfig?.title || chartType;
          const labels = chartData.labels || [];
          const data = chartData.datasets?.[0]?.data || [];

          let chartHtml = `<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 8px 0;">`;
          chartHtml += `<h4 style="margin: 0 0 12px 0;">📊 ${title}</h4>`;
          if (labels.length && data.length) {
            chartHtml += '<ul style="margin: 0; padding-left: 20px;">';
            labels.forEach((label, i) => {
              chartHtml += `<li>${label}: ${data[i] || 0}</li>`;
            });
            chartHtml += "</ul>";
          } else {
            chartHtml += '<p style="margin: 0; color: #666;">No data available</p>';
          }
          chartHtml += "</div>";
          return chartHtml;
        }

        case "divider":
          return '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 16px 0;" />';
        case "callout":
          return `<div style="border-left: 4px solid #0066cc; background: #f0f8ff; padding: 12px; margin: 8px 0;">${content}</div>`;
        case "math":
          return `<div style="font-family: monospace; background: #f5f5f5; padding: 8px; border-radius: 4px;">${content}</div>`;
        case "embed": {
          const embedUrl = block.properties?.url;
          return embedUrl
            ? `<p>📎 Embedded content: <a href="${embedUrl}" target="_blank">${embedUrl}</a></p>`
            : "<p>📎 Embedded content</p>";
        }
        case "text":
        default:
          return content ? `<p>${content}</p>` : "<p><br></p>";
      }
    })
    .join("\n");
};

const convertDeltaToUpdate = (changeset, existingBlocks = [], existingMetadata = null) => {
  let title, content, metadata = existingMetadata;
  if (!changeset?.operations) return { title, content, metadata };

  const blockUpdates = new Map();
  let blockOrder = [];

  if (Array.isArray(existingBlocks) && existingBlocks.length) {
    existingBlocks.forEach((b) => {
      if (b?.id) {
        blockUpdates.set(b.id, {
          id: b.id,
          content: b.content || "",
          type: b.type || "text",
          properties: b.properties || {},
        });
        blockOrder.push(b.id);
      }
    });
  }

  const ensureBlock = (blockId) => {
    if (!blockUpdates.has(blockId)) {
      blockUpdates.set(blockId, { id: blockId, content: "", type: "text", properties: {} });
      if (!blockOrder.includes(blockId)) blockOrder.push(blockId);
    }
    return blockUpdates.get(blockId);
  };

  const insertBlockAt = (block, position) => {
    if (!block?.id) return;
    blockUpdates.set(block.id, {
      id: block.id,
      content: block.content || "",
      type: block.type || "text",
      properties: block.properties || {},
    });
    blockOrder = blockOrder.filter((id) => id !== block.id);
    if (typeof position === "number" && position >= 0 && position <= blockOrder.length) {
      blockOrder.splice(position, 0, block.id);
    } else {
      blockOrder.push(block.id);
    }
  };

  for (const op of changeset.operations) {
    const data = op.data || {};
    switch (op.type) {
      case "update_title":
        if (data.to !== undefined) title = data.to;
        break;
      case "insert_block":
        insertBlockAt(data.block, data.position);
        break;
      case "delete_block":
        if (data.blockId) {
          blockUpdates.delete(data.blockId);
          blockOrder = blockOrder.filter((id) => id !== data.blockId);
        }
        break;
      case "move_block":
        if (data.blockId && typeof data.toPosition === "number") {
          const idx = blockOrder.indexOf(data.blockId);
          if (idx !== -1) {
            blockOrder.splice(idx, 1);
            const toPos = Math.min(Math.max(data.toPosition, 0), blockOrder.length);
            blockOrder.splice(toPos, 0, data.blockId);
          }
        }
        break;
      case "update_block_content":
        if (data.blockId && data.to !== undefined) ensureBlock(data.blockId).content = data.to;
        break;
      case "update_block_type":
        if (data.blockId && data.to) ensureBlock(data.blockId).type = data.to;
        break;
      case "update_block_properties":
        if (data.blockId && data.to) {
          const blk = ensureBlock(data.blockId);
          blk.properties = { ...(blk.properties || {}), ...data.to };
        }
        break;
      case "update_content":
        if (data.content !== undefined) content = data.content;
        break;
      case "update_metadata":
        if (data.metadata) metadata = { ...metadata, ...data.metadata };
        break;
      case "batch":
        if (data.blocks) {
          blockOrder = [];
          blockUpdates.clear();
          data.blocks.forEach((b, i) => insertBlockAt(b, i));
        }
        break;
    }
  }

  if (blockUpdates.size > 0) {
    blockUpdates.forEach((_v, id) => {
      if (!blockOrder.includes(id)) blockOrder.push(id);
    });
    const blocks = blockOrder.map((id) => blockUpdates.get(id)).filter(Boolean);
    content = blocksToHtml(blocks);
    metadata = {
      ...(metadata || {}),
      blocks,
      version: 2,
      lastDeltaUpdate: new Date().toISOString(),
    };
  }

  return { title, content, metadata };
};

export const applyDeltaChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const { changeset } = req.body;

    if (!changeset?.operations || !Array.isArray(changeset.operations)) {
      return res.status(400).json({ success: false, error: "Invalid changeset format" });
    }

    if (changeset.operations.length === 0) {
      return res.json({
        success: true,
        data: await noteService.getNoteById(id, req.user.id, req.db),
        operationsApplied: 0,
        operationsRejected: [],
        conflicts: false,
      });
    }

    let baselineBlocks = [];
    let existingMetadata = null;
    try {
      const existing = await noteService.getNoteById(id, req.user.id, req.db);
      if (existing?.metadata) {
        const meta = typeof existing.metadata === "string"
          ? JSON.parse(existing.metadata)
          : existing.metadata;
        existingMetadata = meta;
        if (Array.isArray(meta?.blocks)) baselineBlocks = meta.blocks;
      }
    } catch (e) {
      // continue with empty baseline
    }

    const { title, content, metadata } = convertDeltaToUpdate(changeset, baselineBlocks, existingMetadata);

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (metadata !== undefined) updates.metadata = metadata;

    const updatedNote = await noteService.updateNoteDelta(id, updates, req.user.id, req.blobServiceClient, req.db);

    res.json({
      success: true,
      data: updatedNote,
      operationsApplied: changeset.operations.length,
      operationsRejected: [],
      conflicts: false,
      metadata: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Delta changes error:", error);
    const statusCode = error.message === "Note not found" ? 404
      : error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to apply delta changes" });
  }
};

export const getNotes = async (req, res) => {
  try {
    const { projectId, excludeContent } = req.query;
    const notes = await noteService.getNotes(
      req.user.id,
      projectId,
      excludeContent === "true",
      req.db
    );
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error("Notes fetch error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to fetch notes" });
  }
};

export const getNoteById = async (req, res) => {
  try {
    const note = await noteService.getNoteById(req.params.id, req.user.id, req.db);
    res.json({ success: true, data: note });
  } catch (error) {
    console.error("Note fetch error:", error);
    const statusCode = error.message === "Note not found" ? 404
      : error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to fetch note" });
  }
};

export const createNote = async (req, res) => {
  try {
    const newNote = await noteService.createNote(req.body, req.user.id, req.db);
    res.status(201).json({ success: true, data: newNote });
  } catch (error) {
    console.error("Note creation error:", error);
    const statusCode = error.message.includes("permission") ? 403
      : error.message.includes("Invalid") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to create note" });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const deletedNote = await noteService.deleteNote(req.params.id, req.user.id, req.blobServiceClient, req.db);
    res.json({ success: true, data: deletedNote });
  } catch (error) {
    console.error("Note deletion error:", error);
    const statusCode = error.message === "Note not found" ? 404
      : error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to delete note" });
  }
};

export const getNotesByProject = async (req, res) => {
  try {
    const notes = await noteService.getNotes(req.user.id, req.params.projectId, false, req.db);
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error("Project notes fetch error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to fetch project notes" });
  }
};

export const getLinkPreview = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    let validUrl;
    try {
      validUrl = new URL(url);
      if (!["http:", "https:"].includes(validUrl.protocol)) throw new Error("Invalid protocol");
    } catch {
      return res.status(400).json({ success: false, error: "Invalid URL format" });
    }

    if (validUrl.protocol === "http:") {
      const domain = validUrl.hostname.replace("www.", "");
      return res.json({
        success: true,
        data: {
          title: `Preview of ${domain}`,
          description: "Only HTTPS URLs are fetched for real previews.",
          image: `https://api.dicebear.com/7.x/shapes/svg?seed=${domain}`,
          domain,
          url,
        },
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)" },
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        return res.status(408).json({ success: false, error: "Request timeout" });
      }
      return res.status(500).json({ success: false, error: "Failed to fetch URL" });
    }

    if (!response.ok) {
      return res.status(400).json({ success: false, error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    const domain = validUrl.hostname.replace("www.", "");

    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)?.[1]?.trim() ||
      domain;

    const description =
      html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1]?.trim() ||
      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1]?.trim() ||
      "";

    let image =
      html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i)?.[1]?.trim() ||
      html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"[^>]*>/i)?.[1]?.trim() ||
      "";

    if (image && !image.startsWith("http")) {
      image = image.startsWith("//") ? validUrl.protocol + image
        : image.startsWith("/") ? validUrl.origin + image
        : validUrl.origin + "/" + image;
    }

    res.json({ success: true, data: { title, description, image, domain, url } });
  } catch (error) {
    console.error("Link preview error:", error);
    res.status(500).json({ success: false, error: "Failed to generate link preview" });
  }
};
