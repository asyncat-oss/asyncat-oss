// A maths block: LaTeX typed in a box, with a plain preview under it.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Button from "../../../components/ui/Button.jsx";
import { Segmented } from "../../../components/ui/Tabs.jsx";

const LAYOUTS = [
  { value: "block", label: "Block" },
  { value: "inline", label: "Inline" },
];

const MathBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [isInline, setIsInline] = useState(block.properties?.inline || false);
  const [showPreview, setShowPreview] = useState(true);
  const [mathContent, setMathContent] = useState(block.content || "");

  // Common mathematical examples for placeholder
  const examples = [
    "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    "\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n",
    "\\int_{a}^{b} f(x) dx",
    "E = mc^2",
    "\\lim_{x \\to \\infty} \\frac{1}{x} = 0",
  ];

  const randomExample = examples[Math.floor(Math.random() * examples.length)];

  const handleInlineToggle = () => {
    const newInline = !isInline;
    setIsInline(newInline);
    onChange(block.id, {
      properties: {
        ...block.properties,
        inline: newInline,
      },
    });
  };

  const handleContentChange = (e) => {
    const newContent = e.target.textContent || "";
    setMathContent(newContent);
    onChange(block.id, { content: newContent });
  };

  // Render LaTeX preview (mock for now - would integrate with KaTeX or MathJax)
  const renderMathPreview = (content) => {
    if (!content) return null;

    // For now, just show formatted text representation
    // In a real implementation, you'd use KaTeX or MathJax here
    return (
      <div
        className={`math-preview rounded-lg bg-hover p-2 font-serif ${
          isInline ? "inline-block" : "block text-center"
        }`}
      >
        <span className="text-fg">
          {isInline ? `$${content}$` : `$$${content}$$`}
        </span>
      </div>
    );
  };

  return (
    <div className="math-block group">
      {/* Controls - shown on hover */}
      <div className="mb-2 mt-1 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 @2xl:pr-7">
        <div className="text-[12px] text-fg-subtle">
          LaTeX
        </div>

        <div className="flex items-center gap-1">
          <Segmented
            size="sm"
            role="radiogroup"
            label="Layout"
            value={isInline ? "inline" : "block"}
            onChange={(layout) => {
              if ((layout === "inline") !== isInline) handleInlineToggle();
            }}
            items={LAYOUTS}
          />

          <Button
            variant="ghost"
            size="xs"
            icon={showPreview ? EyeOff : Eye}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide" : "Show"} preview
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {/* Math input */}
        <div
          className={`overflow-hidden rounded-xl border border-line ${
            isInline ? "inline-block" : "block"
          }`}
        >
          <div className="border-b border-line bg-hover px-3 py-1.5 text-[12px] text-fg-muted">
            LaTeX
          </div>
        <div
          ref={contentRef}
          contentEditable
          className="min-h-[2.5rem] bg-canvas p-3 font-mono text-[13px] text-fg outline-none"
          placeholder={`Enter LaTeX math notation (e.g., ${randomExample})`}
          onInput={handleContentChange}
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
          {...commonProps}
        />
        </div>

        {/* Math preview */}
        {showPreview && mathContent && (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="border-b border-line bg-hover px-3 py-1.5 text-[12px] text-fg-muted">
              Preview
            </div>
            <div className="p-3">{renderMathPreview(mathContent)}</div>
          </div>
        )}

        {/* Help text */}
        {!mathContent && (
          <div className="space-y-1 text-[12px] text-fg-subtle">
            <p className="font-medium text-fg-muted">Examples</p>
            <ul className="list-inside list-disc space-y-0.5 font-mono text-[12px]">
              <li>Fractions: \frac&#123;a&#125;&#123;b&#125;</li>
              <li>Square root: \sqrt&#123;x&#125;</li>
              <li>Superscript: x^2</li>
              <li>Subscript: x_1</li>
              <li>Sum: \sum_&#123;i=1&#125;^&#123;n&#125;</li>
              <li>Integral: \int_&#123;a&#125;^&#123;b&#125;</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default MathBlock;
