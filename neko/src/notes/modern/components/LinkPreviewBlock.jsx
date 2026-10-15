// A link preview block: a card with the page's title, description and site
// that opens the link. Without a link it asks for one.

import { useState, useRef } from "react";
import { ExternalLink, Loader2, Globe, Copy, Check, Pencil } from "lucide-react";
import apiClient from "../../../services/apiClient";
import Button from "../../../components/ui/Button.jsx";
import { Field, Input } from "../../../components/ui/Field.jsx";
import { useLinkFieldFocus } from "./linkFieldFocus.js";

const LinkPreviewBlock = ({
  block,
  onChange,
  readOnly = false,
  active = false,
}) => {
  const [url, setUrl] = useState(block.properties?.url || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(
    !block.properties?.url && !readOnly
  );
  const [previewData, setPreviewData] = useState({
    title: block.properties?.title || "",
    description: block.properties?.description || "",
    image: block.properties?.image || "",
    domain: block.properties?.domain || "",
  });
  const [faviconError, setFaviconError] = useState(false);
  const [copied, setCopied] = useState(false);

  const getFaviconUrl = (url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === "https:") {
        return `${urlObj.origin}/favicon.ico`;
      }
    } catch (error) {
      console.error("Invalid URL for favicon:", error);
    }
    return null;
  };
  const inputRef = useRef(null);

  const handleCopyUrl = async () => {
    const text = previewData.url || url;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (fallbackErr) {
        console.error("Failed to copy URL:", fallbackErr);
      }
    }
  };

  const fetchPreviewData = async (url) => {
    setIsLoading(true);
    // Clear old preview data immediately to avoid showing stale data
    setPreviewData({
      title: "",
      description: "",
      image: "",
      domain: "",
    });

    try {
      // Get the correct backend URL from environment variables
      const API_URL = import.meta.env.VITE_NOTES_URL;

      // Use the shared local API client.
      const response = await apiClient.request(
        `${API_URL}/api/notes/link-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const previewData = result.data;
        setPreviewData(previewData);

        onChange(block.id, {
          properties: {
            ...block.properties,
            ...previewData,
          },
        });
      } else {
        throw new Error(result.error || "Failed to fetch preview data");
      }
    } catch (error) {
      console.error("Failed to fetch preview data:", error);
      // Fallback preview data
      const domain = (() => {
        try {
          return new URL(url).hostname.replace("www.", "");
        } catch {
          return "Unknown";
        }
      })();

      const fallbackData = {
        title: url,
        description: "Preview Data is Unavailable",
        image: "",
        domain: domain,
        url: url,
      };

      setPreviewData(fallbackData);

      onChange(block.id, {
        properties: {
          ...block.properties,
          ...fallbackData,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (url && isValidUrl(url)) {
      setFaviconError(false); // Reset favicon error state for new URL
      fetchPreviewData(url);
      setIsEditing(false);
    }
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleUrlSubmit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      if (!block.properties?.url) {
        setUrl("");
      }
    }
  };

  useLinkFieldFocus(inputRef, isEditing, active);

  if (isEditing) {
    return (
      <div
        data-block-selection-disabled="true"
        className="link-preview-block rounded-xl border border-line p-4"
      >
        <div className="space-y-3">
          <Field label="Link" htmlFor={`link-preview-url-${block.id}`}>
            <Input
              ref={inputRef}
              id={`link-preview-url-${block.id}`}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
            />
          </Field>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleUrlSubmit}
              disabled={!url || !isValidUrl(url)}
              loading={isLoading}
            >
              {isLoading ? "Fetching…" : "Create preview"}
            </Button>

            {block.properties?.url && (
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="link-preview-block group">
      {/* Controls - shown on hover */}
      <div
        className={`transition-opacity duration-200 flex justify-between items-center mb-2 pr-2 ${
          readOnly ? "opacity-40" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <div className="text-[12px] text-fg-subtle">
          Link preview
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil}
            onClick={readOnly ? undefined : () => setIsEditing(true)}
            disabled={readOnly}
          >
            Edit link
          </Button>

          <Button
            variant="ghost"
            size="xs"
            icon={copied ? Check : Copy}
            onClick={handleCopyUrl}
            disabled={!previewData.url && !url}
            title="Copy the link"
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>

      {/* Link preview */}
      {isLoading ? (
        // Loading state
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
            <span className="text-[13px] text-fg-muted">
              Loading the preview…
            </span>
          </div>
        </div>
      ) : (
        <a
          href={readOnly ? undefined : previewData.url || url}
          target={readOnly ? undefined : "_blank"}
          rel={readOnly ? undefined : "noopener noreferrer"}
          className={`block rounded-xl border border-line p-4 transition-colors ${
            readOnly ? "cursor-default" : "cursor-pointer hover:bg-hover"
          }`}
          onClick={(e) => {
            // Prevent navigation in read-only mode or if URL is invalid
            if (readOnly || (!previewData.url && !url)) {
              e.preventDefault();
            }
          }}
        >
          <div className="flex gap-4">
            {/* Preview image */}
            {previewData.image && (
              <div className="flex-shrink-0">
                <img
                  src={previewData.image}
                  alt={previewData.title}
                  className="h-20 w-20 rounded-lg bg-hover object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Preview content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3
                    className="line-clamp-2 text-[14px] font-medium text-fg"
                  >
                    {previewData.title || previewData.url}
                  </h3>

                  {/* Description */}
                  {previewData.description && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-fg-muted">
                      {previewData.description}
                    </p>
                  )}

                  {/* Domain */}
                  <div className="mt-2 flex items-center gap-1 text-[12px] text-fg-subtle">
                    {getFaviconUrl(previewData.url || url) && !faviconError ? (
                      <img
                        src={getFaviconUrl(previewData.url || url)}
                        alt="Site favicon"
                        className="w-3 h-3"
                        onError={() => {
                          setFaviconError(true);
                        }}
                      />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    <span>{previewData.domain || "External link"}</span>
                  </div>
                </div>

                {/* External link icon */}
                <div
                  className={`flex items-center gap-2 ${
                    readOnly ? "opacity-40" : ""
                  }`}
                >
                  <ExternalLink className="h-4 w-4 flex-shrink-0 text-fg-subtle" />
                </div>
              </div>
            </div>
          </div>
        </a>
      )}
    </div>
  );
};

export default LinkPreviewBlock;
