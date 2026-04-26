import { useState } from "react";
import { Calculator, Eye, EyeOff } from "lucide-react";

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
        className={`math-preview bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded p-2 font-serif ${
          isInline ? "inline-block" : "block text-center"
        }`}
      >
        <span className="text-blue-800 dark:text-blue-200 midnight:text-blue-200">
          {isInline ? `$${content}$` : `$$${content}$$`}
        </span>
      </div>
    );
  };

  return (
    <div className="math-block group">
      {/* Controls - shown on hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-between items-center mb-2 pr-7 mt-1">
        <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
          LaTeX Math
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleInlineToggle}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
              isInline
                ? "bg-blue-100 dark:bg-blue-900 midnight:bg-blue-900 text-blue-700 dark:text-blue-300 midnight:text-blue-300 border-blue-300 dark:border-blue-700 midnight:border-blue-700"
                : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-400 midnight:text-gray-400 border-gray-300 dark:border-gray-600 midnight:border-gray-600"
            }`}
          >
            <Calculator className="w-3 h-3" />
            {isInline ? "Inline" : "Block"}
          </button>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-400 midnight:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
          >
            {showPreview ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
            {showPreview ? "Hide" : "Show"} Preview
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {/* Math input */}
        <div
          className={`border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg ${
            isInline ? "inline-block" : "block"
          }`}
        >
          <div className="p-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-600 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
            LaTeX Input
          </div>
        <div
          ref={contentRef}
          contentEditable
          className="p-3 outline-none font-mono text-sm bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-gray-100 midnight:text-gray-100 min-h-[2.5rem] rounded-b-lg"
          placeholder={`Enter LaTeX math notation (e.g., ${randomExample})`}
          onInput={handleContentChange}
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
          {...commonProps}
        />
        </div>

        {/* Math preview */}
        {showPreview && mathContent && (
          <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-600 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
              Preview
            </div>
            <div className="p-3">{renderMathPreview(mathContent)}</div>
          </div>
        )}

        {/* Help text */}
        {!mathContent && (
          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 space-y-1">
            <p>
              <strong>LaTeX Examples:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 font-mono text-xs">
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
