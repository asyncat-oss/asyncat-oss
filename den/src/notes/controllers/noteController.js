// noteController.js - Updated with attachment support and authenticated Supabase client
import * as noteService from "../service/noteService.js";
// import * as versionService from "../service/versionService.js";

// Helper function to convert blocks to HTML content
const blocksToHtml = (blocks) => {
  if (!blocks || !Array.isArray(blocks)) {
    return "";
  }

  return blocks
    .map((block) => {
      const content = block.content || "";

      switch (block.type) {
        case "heading1":
          return `<h1>${content}</h1>`;
        case "heading2":
          return `<h2>${content}</h2>`;
        case "heading3":
          return `<h3>${content}</h3>`;
        case "bullet_list":
        case "bulletList":
          return `<ul><li>${content}</li></ul>`;
        case "numbered_list":
        case "numberedList":
          return `<ol><li>${content}</li></ol>`;
        case "todo": {
          const checked = block.properties?.checked ? "checked" : "";
          return `<p><input type="checkbox" ${checked} disabled> ${content}</p>`;
        }
        case "quote":
          return `<blockquote>${content}</blockquote>`;
        case "code":
          return `<pre><code>${content}</code></pre>`;

        // Image block with attachment support
        case "image": {
          const { url, alt, caption, width, height } = block.properties || {};
          const imgAlt = alt || caption || "Image";
          let imgTag = `<img src="${url || ""}" alt="${imgAlt}"`;
          if (width) imgTag += ` width="${width}"`;
          if (height) imgTag += ` height="${height}"`;
          imgTag += ' style="max-width: 100%; height: auto;" />';

          if (caption) {
            return `<figure>${imgTag}<figcaption>${caption}</figcaption></figure>`;
          }
          return imgTag;
        }

        // Audio block with attachment support
        case "audio": {
          const { url, filename, duration } = block.properties || {};
          if (!url) return "<div>Audio (no file)</div>";

          return `
          <div style="margin: 12px 0;">
            <audio controls style="width: 100%; max-width: 600px;">
              <source src="${url}">
              Your browser does not support the audio element.
            </audio>
            ${filename ? `<p style="margin: 4px 0; font-size: 14px; color: #666;">${filename}</p>` : ""}
          </div>
        `;
        }

        // Advanced blocks that store data in properties
        case "table": {
          const tableData = block.properties?.tableData || [[""]];
          const hasHeader = block.properties?.hasHeader || false;

          if (!tableData.length) return "<div>Empty table</div>";

          let tableHtml =
            '<table border="1" style="border-collapse: collapse; width: 100%;">';

          tableData.forEach((row, rowIndex) => {
            const isHeaderRow = hasHeader && rowIndex === 0;
            const tag = isHeaderRow ? "th" : "td";

            tableHtml += "<tr>";
            row.forEach((cell) => {
              tableHtml += `<${tag} style="padding: 8px; border: 1px solid #ccc;">${
                cell || ""
              }</${tag}>`;
            });
            tableHtml += "</tr>";
          });

          tableHtml += "</table>";
          return tableHtml;
        }

        case "linkPreview": {
          const { title, description, domain, url } = block.properties || {};
          if (!url) return "<div>Link preview (no URL)</div>";

          return `
          <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0;">
            <h4 style="margin: 0 0 8px 0;">${
              title || domain || "Link Preview"
            }</h4>
            ${
              description
                ? `<p style="margin: 0 0 8px 0; color: #666;">${description}</p>`
                : ""
            }
            <a href="${url}" target="_blank" style="color: #0066cc; text-decoration: none;">🔗 ${
            domain || url
          }</a>
          </div>
        `;
        }

        // File attachment block
        case "file": {
          const { url, filename, size, type } = block.properties || {};
          const fileIcon = type?.startsWith("image/")
            ? "🖼️"
            : type?.startsWith("video/")
            ? "🎥"
            : type?.startsWith("audio/")
            ? "🎵"
            : "📎";
          const sizeText = size
            ? ` (${(size / 1024 / 1024).toFixed(2)}MB)`
            : "";

          return `
          <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0;">
            <p style="margin: 0;">
              ${fileIcon} <a href="${
            url || "#"
          }" target="_blank" style="color: #0066cc; text-decoration: none;">
                ${filename || "Attached File"}
              </a>${sizeText}
            </p>
          </div>
        `;
        }

        // Chart blocks - render as simple text representation
        case "pieChart":
        case "barChart":
        case "lineChart": {
          const chartData = block.properties?.data;
          const chartConfig = block.properties?.config;
          const chartType = block.type.replace("Chart", " Chart");

          if (!chartData || !chartData.labels || !chartData.datasets) {
            return `<div>[${chartType} - No data]</div>`;
          }

          const title = chartConfig?.title || chartType;
          const labels = chartData.labels || [];
          const dataset = chartData.datasets?.[0];
          const data = dataset?.data || [];

          let chartHtml = `<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin: 8px 0;">`;
          chartHtml += `<h4 style="margin: 0 0 12px 0;">📊 ${title}</h4>`;

          if (labels.length && data.length) {
            chartHtml += '<ul style="margin: 0; padding-left: 20px;">';
            labels.forEach((label, index) => {
              const value = data[index] || 0;
              chartHtml += `<li>${label}: ${value}</li>`;
            });
            chartHtml += "</ul>";
          } else {
            chartHtml +=
              '<p style="margin: 0; color: #666;">No data available</p>';
          }

          chartHtml += "</div>";
          return chartHtml;
        }

        // Other advanced blocks - fallback representations
        case "divider":
          return '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 16px 0;" />';

        case "callout":
          return `<div style="border-left: 4px solid #0066cc; background: #f0f8ff; padding: 12px; margin: 8px 0;">${content}</div>`;

        case "math":
          return `<div style="font-family: monospace; background: #f5f5f5; padding: 8px; border-radius: 4px;">${content}</div>`;

        case "embed":
          const embedUrl = block.properties?.url;
          return embedUrl
            ? `<p>📎 Embedded content: <a href="${embedUrl}" target="_blank">${embedUrl}</a></p>`
            : "<p>📎 Embedded content</p>";

        case "text":
        default:
          return content ? `<p>${content}</p>` : "<p><br></p>";
      }
    })
    .join("\n");
};

// Helper function to convert delta operations to simple update
const convertDeltaToUpdate = (
  changeset,
  existingBlocks = [],
  existingMetadata = null
) => {
  let title,
    content,
    metadata = existingMetadata;
  if (!changeset || !changeset.operations) return { title, content, metadata };

  console.log("Converting delta operations:", {
    operationCount: changeset.operations.length,
    firstFew: changeset.operations.slice(0, 3),
    baselineVersion: changeset.baselineVersion,
  });

  // Start with baseline blocks so untouched blocks are preserved
  const blockUpdates = new Map();
  let blockOrder = [];
  if (Array.isArray(existingBlocks) && existingBlocks.length) {
    existingBlocks.forEach((b, idx) => {
      if (b && b.id) {
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

  const ensureBlockExists = (blockId) => {
    if (!blockUpdates.has(blockId)) {
      blockUpdates.set(blockId, {
        id: blockId,
        content: "",
        type: "text",
        properties: {},
      });
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
    if (
      typeof position === "number" &&
      position >= 0 &&
      position <= blockOrder.length
    ) {
      blockOrder.splice(position, 0, block.id);
    } else {
      blockOrder.push(block.id);
    }
  };

  // Process operations to build final state
  for (const operation of changeset.operations) {
    console.log("Processing operation:", operation.type, operation.data);
    const data = operation.data || {};

    switch (operation.type) {
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
            const toPos = Math.min(
              Math.max(data.toPosition, 0),
              blockOrder.length
            );
            blockOrder.splice(toPos, 0, data.blockId);
          }
        }
        break;
      case "update_block_content":
        if (data.blockId && data.to !== undefined) {
          const blk = ensureBlockExists(data.blockId);
          blk.content = data.to;
        }
        break;
      case "update_block_type":
        if (data.blockId && data.to) {
          const blk = ensureBlockExists(data.blockId);
          blk.type = data.to;
        }
        break;
      case "update_block_properties":
        if (data.blockId && data.to) {
          const blk = ensureBlockExists(data.blockId);
          blk.properties = { ...(blk.properties || {}), ...data.to };
        }
        break;
      case "update_content":
        if (data.content !== undefined) content = data.content;
        break;
      case "update_metadata":
        if (data.metadata) {
          metadata = { ...metadata, ...data.metadata };
        }
        break;
      case "batch":
        if (data.blocks) {
          blockOrder = [];
          blockUpdates.clear();
          data.blocks.forEach((b, i) => insertBlockAt(b, i));
        }
        break;
      default:
        break;
    }
  }

  // Always generate content and metadata from blocks if we have any block updates
  if (blockUpdates.size > 0) {
    blockUpdates.forEach((_v, id) => {
      if (!blockOrder.includes(id)) blockOrder.push(id);
    });
    const blocks = blockOrder.map((id) => blockUpdates.get(id)).filter(Boolean);
    content = blocksToHtml(blocks);

    // Preserve existing metadata while updating blocks
    const newMetadata = {
      ...(metadata || {}), // Keep existing metadata (banners, etc.)
      blocks,
      version: 2,
      lastDeltaUpdate: new Date().toISOString(),
    };
    metadata = newMetadata;
  }

  const result = { title, content, metadata };
  console.log("Conversion result:", {
    title: title !== undefined,
    hasContent: content !== undefined,
    hasMetadata: metadata !== undefined,
    contentLength: content?.length,
  });
  return result;
};

// ============================
// CONTROLLERS (with attachment support and authenticated Supabase client)
// ============================

export const applyDeltaChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const { changeset, timestamp } = req.body;

    console.log("=== DELTA CONTROLLER - ENTRY ===");
    console.log(
      "DeltaController - Full request body:",
      JSON.stringify(req.body, null, 2)
    );

    // Fetch existing note for baseline
    let baselineBlocks = [];
    let existingMetadata = null;
    try {
      const existing = await noteService.getNoteById(
        id,
        req.user.id,
        req.db
      );
      if (existing?.metadata) {
        const meta =
          typeof existing.metadata === "string"
            ? JSON.parse(existing.metadata)
            : existing.metadata;
        existingMetadata = meta;
        if (Array.isArray(meta?.blocks)) baselineBlocks = meta.blocks;
      }
    } catch (e) {
      console.warn(
        "Baseline fetch failed (will continue with empty baseline):",
        e.message
      );
    }
    console.log("Baseline blocks count:", baselineBlocks.length);

    // Validate changeset
    if (
      !changeset ||
      !changeset.operations ||
      !Array.isArray(changeset.operations)
    ) {
      console.log("DeltaController - Invalid changeset format");
      return res
        .status(400)
        .json({ success: false, error: "Invalid changeset format" });
    }

    if (changeset.operations.length === 0) {
      console.log("DeltaController - No operations to apply");
      return res.json({
        success: true,
        data: await noteService.getNoteById(id, req.user.id, req.db),
        operationsApplied: [],
        operationsRejected: [],
        conflicts: false,
        message: "No operations to apply",
      });
    }

    console.log("DeltaController - Processing operations...");
    const { title, content, metadata } = convertDeltaToUpdate(
      changeset,
      baselineBlocks,
      existingMetadata
    );

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (metadata !== undefined) updates.metadata = metadata;

    console.log("DeltaController - Updates to apply:", {
      hasTitle: title !== undefined,
      hasContent: content !== undefined,
      hasMetadata: metadata !== undefined,
      contentPreview: updates.content
        ? updates.content.substring(0, 100) + "..."
        : "none",
    });

    const updatedNote = await noteService.updateNoteDelta(
      id,
      updates,
      req.user.id,
      req.blobServiceClient,
      req.db
    );

    // Check if we should create an automatic version
    // const shouldCreateVersion =
    //   changeset.operations.length >= 25 || // Every 25 operations
    //   (timestamp && Date.now() - timestamp > 10 * 60 * 1000); // Or if more than 10 minutes since last change
    const shouldCreateVersion = false;

    // Track operations for detailed history
    // try {
    //   await versionService.trackOperations(
    //     id,
    //     changeset.operations,
    //     req.user.id,
    //     req.db
    //   );
    // } catch (opsError) {
    //   console.warn(
    //     "Operation tracking failed but continuing:",
    //     opsError.message
    //   );
    // }

    if (shouldCreateVersion) {
      // Version history temporarily disabled
    }

    res.json({
      success: true,
      data: updatedNote,
      operationsApplied: changeset.operations.length,
      operationsRejected: [],
      conflicts: false,
      metadata: {
        timestamp: new Date().toISOString(),
        appliedAt: Date.now(),
      },
    });
  } catch (error) {
    console.error("Delta changes error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to apply delta changes",
      metadata: {
        timestamp: new Date().toISOString(),
        retryable: statusCode >= 500,
      },
    });
  }
};

export const getNotes = async (req, res) => {
  try {
    const { projectId, excludeContent } = req.query;
    const shouldExcludeContent = excludeContent === "true";

    const notes = await noteService.getNotes(
      req.user.id,
      projectId,
      shouldExcludeContent,
      req.db
    );

    res.json({ success: true, data: notes });
  } catch (error) {
    console.error("Notes fetch error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch notes",
    });
  }
};

export const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const note = await noteService.getNoteById(id, req.user.id, req.db);
    res.json({ success: true, data: note });
  } catch (error) {
    console.error("Note fetch error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to fetch note",
    });
  }
};

export const createNote = async (req, res) => {
  try {
    const noteData = req.body;
    const newNote = await noteService.createNote(
      noteData,
      req.user.id,
      req.db
    );
    res.status(201).json({ success: true, data: newNote });
  } catch (error) {
    console.error("Note creation error:", error);
    const statusCode = error.message.includes("permission")
      ? 403
      : error.message.includes("Invalid")
      ? 400
      : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to create note",
    });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedNote = await noteService.deleteNote(
      id,
      req.user.id,
      req.blobServiceClient,
      req.db
    );
    res.json({ success: true, data: deletedNote });
  } catch (error) {
    console.error("Note deletion error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to delete note",
    });
  }
};

export const getNotesByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const notes = await noteService.getNotes(
      req.user.id,
      projectId,
      false,
      req.db
    );
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error("Project notes fetch error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch project notes",
    });
  }
};

export const getLinkPreview = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "URL is required",
      });
    }

    // Validate URL format
    let validUrl;
    try {
      validUrl = new URL(url);
      if (!["http:", "https:"].includes(validUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid URL format",
      });
    }

    // For HTTP URLs, return mock data instead of fetching
    if (validUrl.protocol === "http:") {
      const domain = validUrl.hostname.replace("www.", "");
      const mockPreviewData = {
        title: `Preview of ${domain}`,
        description: `This is a mock preview for HTTP URLs. For security reasons, only HTTPS URLs are fetched for real previews.`,
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${domain}`,
        domain: domain,
        url: url,
      };

      return res.json({
        success: true,
        data: mockPreviewData,
      });
    }

    // Fetch the webpage
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        return res.status(408).json({
          success: false,
          error: "Request timeout",
        });
      }
      return res.status(500).json({
        success: false,
        error: "Failed to fetch URL",
      });
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const html = await response.text();
    const domain = validUrl.hostname.replace("www.", "");

    // Extract metadata using regex (simple fallback approach)
    const extractMeta = (html) => {
      const title =
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
        html
          .match(
            /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i
          )?.[1]
          ?.trim() ||
        domain;

      const description =
        html
          .match(
            /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i
          )?.[1]
          ?.trim() ||
        html
          .match(
            /<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i
          )?.[1]
          ?.trim() ||
        "";

      const image =
        html
          .match(
            /<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i
          )?.[1]
          ?.trim() ||
        html
          .match(
            /<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"[^>]*>/i
          )?.[1]
          ?.trim() ||
        "";

      return { title, description, image };
    };

    const metadata = extractMeta(html);

    // Ensure image URL is absolute
    let imageUrl = metadata.image;
    if (imageUrl && !imageUrl.startsWith("http")) {
      if (imageUrl.startsWith("//")) {
        imageUrl = validUrl.protocol + imageUrl;
      } else if (imageUrl.startsWith("/")) {
        imageUrl = validUrl.origin + imageUrl;
      } else {
        imageUrl = validUrl.origin + "/" + imageUrl;
      }
    }

    const previewData = {
      title: metadata.title,
      description: metadata.description,
      image: imageUrl,
      domain: domain,
      url: url,
    };

    res.json({
      success: true,
      data: previewData,
    });
  } catch (error) {
    console.error("Link preview error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate link preview",
    });
  }
};
