import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

const DividerBlock = ({ block, onChange }) => {
  const [style, setStyle] = useState(block.properties?.style || "line");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const dropdownRef = useRef(null);
  const dropdownContentRef = useRef(null);

  const dividerOptions = [
    { value: "line", label: "—", description: "Line" },
    { value: "thick", label: "━", description: "Thick" },
    { value: "dashed", label: "┅", description: "Dashed" },
    { value: "dots", label: "•••", description: "Dots" },
    { value: "wave", label: "~~~", description: "Wave" },
  ];

  const currentOption =
    dividerOptions.find((option) => option.value === style) ||
    dividerOptions[0];

  // Function to calculate and update dropdown position
  const updateDropdownPosition = () => {
    if (dropdownRef.current) {
      const buttonRect = dropdownRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: buttonRect.bottom + 2,
        left: buttonRect.left,
        width: buttonRect.width,
      });
    }
  };

  // Update dropdown position on scroll or resize
  useEffect(() => {
    if (isDropdownOpen) {
      const handleScroll = () => updateDropdownPosition();
      const handleResize = () => updateDropdownPosition();

      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [isDropdownOpen]);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isDropdownOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        dropdownContentRef.current &&
        !dropdownContentRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
        setDropdownPosition(null);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleStyleChange = (newStyle) => {
    setStyle(newStyle);
    onChange(block.id, {
      properties: {
        ...block.properties,
        style: newStyle,
      },
    });
    setIsDropdownOpen(false);
  };

  const renderOptionPreview = (variant, widthClass = "w-16") => {
    const previewFillClasses =
      "bg-gray-500 dark:bg-gray-300 midnight:bg-gray-400";
    const previewBorderClasses =
      "border-gray-500 dark:border-gray-300 midnight:border-gray-400";
    const previewTextClasses =
      "text-gray-600 dark:text-gray-300 midnight:text-gray-400";

    switch (variant) {
      case "line":
        return (
          <span
            className={`${widthClass} h-[2px] rounded-full ${previewFillClasses} block`}
            aria-hidden="true"
          />
        );
      case "thick":
        return (
          <span
            className={`${widthClass} h-[4px] ${previewFillClasses} block`}
            aria-hidden="true"
          />
        );
      case "dashed":
        return (
          <span
            className={`${widthClass} border-t-2 border-dashed ${previewBorderClasses} block`}
            aria-hidden="true"
          />
        );
      case "dots":
        return (
          <span
            className={`inline-flex justify-center ${widthClass} ${previewTextClasses} text-sm tracking-[0.35em] font-semibold`}
            aria-hidden="true"
          >
            •••
          </span>
        );
      case "wave":
        return (
          <span
            className={`inline-flex justify-center ${widthClass} ${previewTextClasses} text-sm tracking-[0.3em] font-semibold`}
            aria-hidden="true"
          >
            ~~~
          </span>
        );
      default:
        return null;
    }
  };

  const renderDivider = () => {
    switch (style) {
      case "dots":
        return (
          <div className="flex justify-center items-center py-4">
            <div className="text-gray-600 dark:text-gray-400 midnight:text-gray-300 text-xl tracking-wider font-bold">
              • • •
            </div>
          </div>
        );

      case "wave":
        return (
          <div className="flex justify-center items-center py-4">
            <div className="text-gray-600 dark:text-gray-400 midnight:text-gray-300 text-xl tracking-wider font-bold">
              ~~~
            </div>
          </div>
        );

      case "thick":
        return (
          <div className="py-4">
            <hr className="border-0 h-[5px] bg-gray-600 dark:bg-gray-400 midnight:bg-gray-300" />
          </div>
        );

      case "dashed":
        return (
          <div className="py-4">
            <hr className="border-t-4 border-dashed border-gray-600 dark:border-gray-400 midnight:border-gray-300" />
          </div>
        );

      default: // line
        return (
          <div className="py-4">
            <hr className="border-t-2 border-gray-600 dark:border-gray-400 midnight:border-gray-300" />
          </div>
        );
    }
  };

  return (
    <div
      className="divider-block group relative"
      onMouseLeave={(e) => {
        const relatedTarget = e.relatedTarget;
        if (
          relatedTarget &&
          (dropdownRef.current?.contains(relatedTarget) ||
            dropdownContentRef.current?.contains(relatedTarget))
        ) {
          return;
        }
        setIsDropdownOpen(false);
        setDropdownPosition(null);
      }}
    >
      <div
        className={`transition-all duration-200 overflow-hidden flex justify-start items-center w-full px-2  ${
          isDropdownOpen
            ? "opacity-100 max-h-12 py-2"
            : "opacity-0 max-h-0 py-0 group-hover:opacity-100 group-hover:max-h-12 group-hover:py-2"
        }`}
      >
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (isDropdownOpen) {
                setIsDropdownOpen(false);
                setDropdownPosition(null);
              } else {
                // Calculate position when opening
                updateDropdownPosition();
                setIsDropdownOpen(true);
              }
            }}
            className="text-xs bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-400 midnight:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-indigo-500 flex items-center justify-between gap-2 min-w-[140px] shadow-sm"
          >
            <span className="flex items-center gap-2">
              {renderOptionPreview(currentOption.value, "w-14")}
              <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
                {currentOption.description}
              </span>
            </span>
            <ChevronDown
              className={`w-3 h-3 flex-shrink-0 transition-transform ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Divider */}
      {renderDivider()}

      {/* Portal dropdown */}
      {isDropdownOpen &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownContentRef}
            className="fixed bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded shadow-lg z-[10]"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              animation: "fadeIn 0.1s ease-out",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => {
              setIsDropdownOpen(false);
              setDropdownPosition(null);
            }}
          >
            {dividerOptions.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleStyleChange(option.value);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 flex items-center gap-3 ${
                  option.value === style
                    ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/30 text-blue-700 dark:text-blue-300 midnight:text-blue-400"
                    : "text-gray-600 dark:text-gray-400 midnight:text-gray-500"
                }`}
              >
                {renderOptionPreview(option.value)}
                <span className="text-xs font-medium opacity-80">
                  {option.description}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

export default DividerBlock;
