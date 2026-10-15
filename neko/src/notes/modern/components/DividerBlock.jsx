// A divider between blocks, in one of a few styles picked on hover.

import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { ChevronDown } from "lucide-react";
import { Menu, MenuItem } from "../../../components/ui/Menu.jsx";

const DIVIDER_OPTIONS = [
  { value: "line", description: "Line" },
  { value: "thick", description: "Thick" },
  { value: "dashed", description: "Dashed" },
  { value: "dots", description: "Dots" },
  { value: "wave", description: "Wave" },
];

// A small drawing of a divider style, for the picker.
function OptionPreview({ variant, widthClass = "w-12" }) {
  switch (variant) {
    case "line":
      return <span className={`${widthClass} block h-[2px] rounded-full bg-fg-muted`} aria-hidden="true" />;
    case "thick":
      return <span className={`${widthClass} block h-[4px] rounded-full bg-fg-muted`} aria-hidden="true" />;
    case "dashed":
      return <span className={`${widthClass} block border-t-2 border-dashed border-fg-muted`} aria-hidden="true" />;
    case "dots":
      return (
        <span className={`inline-flex justify-center ${widthClass} text-[13px] font-semibold tracking-[0.3em] text-fg-muted`} aria-hidden="true">
          •••
        </span>
      );
    case "wave":
      return (
        <span className={`inline-flex justify-center ${widthClass} text-[13px] font-semibold tracking-[0.3em] text-fg-muted`} aria-hidden="true">
          ~~~
        </span>
      );
    default:
      return null;
  }
}

OptionPreview.propTypes = {
  variant: PropTypes.string.isRequired,
  widthClass: PropTypes.string,
};

const DividerBlock = ({ block, onChange }) => {
  const [style, setStyle] = useState(block.properties?.style || "line");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentOption =
    DIVIDER_OPTIONS.find((option) => option.value === style) ||
    DIVIDER_OPTIONS[0];

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

  const renderDivider = () => {
    switch (style) {
      case "dots":
        return (
          <div className="flex items-center justify-center py-4">
            <div className="text-xl font-bold tracking-wider text-fg-subtle">
              • • •
            </div>
          </div>
        );

      case "wave":
        return (
          <div className="flex items-center justify-center py-4">
            <div className="text-xl font-bold tracking-wider text-fg-subtle">
              ~~~
            </div>
          </div>
        );

      case "thick":
        return (
          <div className="py-4">
            <hr className="h-[5px] rounded-full border-0 bg-line-strong" />
          </div>
        );

      case "dashed":
        return (
          <div className="py-4">
            <hr className="border-t-4 border-dashed border-line-strong" />
          </div>
        );

      default: // line
        return (
          <div className="py-4">
            <hr className="border-t-2 border-line-strong" />
          </div>
        );
    }
  };

  return (
    <div className="divider-block group relative">
      <div
        className={`flex w-full items-center justify-start overflow-hidden px-2 transition-all duration-200 ${
          isDropdownOpen
            ? "max-h-12 py-2 opacity-100"
            : "max-h-0 py-0 opacity-0 group-hover:max-h-12 group-hover:py-2 group-hover:opacity-100"
        }`}
      >
        <button
          ref={dropdownRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDropdownOpen((open) => !open);
          }}
          aria-haspopup="menu"
          aria-expanded={isDropdownOpen}
          className="flex h-7 min-w-[140px] items-center justify-between gap-2 rounded-md border border-line-strong bg-canvas px-2 text-[12px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="flex items-center gap-2">
            <OptionPreview variant={currentOption.value} />
            {currentOption.description}
          </span>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </button>
      </div>

      {/* Divider */}
      {renderDivider()}

      <Menu
        anchorRef={dropdownRef}
        open={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        width={180}
        label="Divider style"
      >
        {DIVIDER_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            label={
              <span className="flex items-center gap-3">
                <OptionPreview variant={option.value} />
                {option.description}
              </span>
            }
            checked={option.value === style}
            onSelect={() => handleStyleChange(option.value)}
          />
        ))}
      </Menu>
    </div>
  );
};

DividerBlock.propTypes = {
  block: PropTypes.shape({
    id: PropTypes.string.isRequired,
    properties: PropTypes.object,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default DividerBlock;
