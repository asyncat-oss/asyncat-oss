import { useState, useRef, useEffect } from "react";
import { ExternalLink, RefreshCw, Globe, Copy, Check, Edit3 } from "lucide-react";
import authService from "../../../services/authService";

const LinkPreviewBlock = ({
  block,
  onChange,
  contentRef,
  commonProps,
  readOnly = false,
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

      // Use authenticated fetch like other API calls
      const response = await authService.authenticatedFetch(
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

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div
        data-block-selection-disabled="true"
        className="link-preview-block border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-1">
              URL
            </label>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUrlSubmit}
              disabled={!url || !isValidUrl(url) || isLoading}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-700 midnight:bg-indigo-600 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 midnight:hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isLoading ? "Fetching..." : "Create Preview"}
            </button>

            {block.properties?.url && (
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-300"
              >
                Cancel
              </button>
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
        <div className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
          Link Preview
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={readOnly ? undefined : () => setIsEditing(true)}
            disabled={readOnly}
            className={`flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 rounded ${
              readOnly
                ? "cursor-default"
                : "hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
            }`}
          >
            <Edit3 className="w-3 h-3" />
            Edit URL
          </button>

          <button
            onClick={handleCopyUrl}
            disabled={!previewData.url && !url}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 rounded hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy URL"
          >
            {copied ? (
              <Check className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {copied ? "Copied!" : "Copy URL"}
          </button>
        </div>
      </div>

      {/* Link preview */}
      {isLoading ? (
        // Loading state
        <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              Loading link preview...
            </span>
          </div>
        </div>
      ) : (
        <a
          href={readOnly ? undefined : previewData.url || url}
          target={readOnly ? undefined : "_blank"}
          rel={readOnly ? undefined : "noopener noreferrer"}
          className={`block border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 transition-colors ${
            readOnly
              ? "cursor-default"
              : "hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-900/50 group-hover:shadow-md cursor-pointer"
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
                  className="w-20 h-20 object-cover rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900"
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
                    className={`font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200 line-clamp-2 ${
                      !readOnly &&
                      "group-hover:text-blue-600 dark:group-hover:text-blue-400 midnight:group-hover:text-blue-300"
                    }`}
                  >
                    {previewData.title || previewData.url}
                  </h3>

                  {/* Description */}
                  {previewData.description && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500 line-clamp-2">
                      {previewData.description}
                    </p>
                  )}

                  {/* Domain */}
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
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
                  <ExternalLink
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 ${
                      !readOnly && "group-hover:text-blue-500 transition-colors"
                    }`}
                  />
                  {!readOnly && (
                    <span className="text-xs text-gray-400 group-hover:text-blue-500 hidden group-hover:inline">
                      Click to open
                    </span>
                  )}
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
