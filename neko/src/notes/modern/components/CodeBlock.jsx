import { useState, useRef, useEffect } from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import PropTypes from "prop-types";

// Syntax highlighting patterns for different languages
const syntaxPatterns = {
  javascript: [
    {
      pattern:
        /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|async|await|class|extends|import|export|from|default)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  typescript: [
    {
      pattern:
        /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|async|await|class|extends|import|export|from|default|interface|type|enum|public|private|protected|readonly|static)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\b(string|number|boolean|any|void|never|unknown|object)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  python: [
    {
      pattern:
        /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|break|continue|pass|lambda|and|or|not|in|is|True|False|None)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|"""[\s\S]*?"""|'''[\s\S]*?'''/g,
      className: "text-green-600 dark:text-green-400",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /\b(int|str|float|bool|list|dict|tuple|set)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
  ],
  java: [
    {
      pattern:
        /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|import|package|if|else|for|while|do|try|catch|finally|throw|throws|return|break|continue|switch|case|default|new|this|super)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(int|double|float|long|short|byte|char|boolean|String|void)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|null)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?[fFdDlL]?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  html: [
    { pattern: /&[a-zA-Z0-9]+;/g, className: "text-red-600 dark:text-red-400" },
    {
      pattern: /<\/?[a-zA-Z][^>]*>/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\s[a-zA-Z-]+=/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /<!--[\s\S]*?-->/g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
  ],
  css: [
    {
      pattern: /[.#]?[a-zA-Z][a-zA-Z0-9-]*(?=\s*{)/g,
      className: "text-yellow-600 dark:text-yellow-400",
    },
    {
      pattern: /[a-zA-Z-]+(?=\s*:)/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /#[0-9a-fA-F]{3,6}\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /\b\d+(?:px|em|rem|%|vh|vw|pt|pc|in|cm|mm)\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  cpp: [
    {
      pattern:
        /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|class|namespace|template|typename|public|private|protected|virtual|override|final)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(std|cout|cin|endl|vector|string|map|set|list|queue|stack|pair)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|nullptr|NULL)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?[fFdDlL]?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    { pattern: /#\w+/g, className: "text-purple-600 dark:text-purple-400" },
  ],
  c: [
    {
      pattern:
        /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(printf|scanf|malloc|free|sizeof|strlen|strcpy|strcmp|memcpy|memset)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(TRUE|FALSE|NULL)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?[fFdDlL]?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    { pattern: /#\w+/g, className: "text-purple-600 dark:text-purple-400" },
  ],
  csharp: [
    {
      pattern:
        /\b(abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(Console|String|Int32|Boolean|DateTime|List|Dictionary|Array)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|null)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|@"([^"]|"")*"/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?[fFdDmM]?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  php: [
    {
      pattern:
        /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|namespace|new|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\$[a-zA-Z_][a-zA-Z0-9_]*/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /\b(true|false|null|TRUE|FALSE|NULL)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  ruby: [
    {
      pattern:
        /\b(alias|and|begin|break|case|class|def|defined|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield|require|include|extend|attr_reader|attr_writer|attr_accessor)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(Array|Hash|String|Integer|Float|Symbol|Proc|Class|Module)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|nil)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /:[a-zA-Z_][a-zA-Z0-9_]*[?!]?/g,
      className: "text-red-600 dark:text-red-400",
    },
  ],
  go: [
    {
      pattern:
        /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|iota|nil)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  rust: [
    {
      pattern:
        /\b(as|break|const|continue|crate|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while|async|await|dyn)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(true|false|None|Some|Ok|Err)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|r#"([^"\\]|\\.)*"#/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\/\/.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?[fF]?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    { pattern: /#\[.*?\]/g, className: "text-purple-600 dark:text-purple-400" },
  ],
  sql: [
    {
      pattern:
        /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|ON|GROUP|BY|ORDER|HAVING|UNION|ALL|DISTINCT|AS|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|EXISTS|CASE|WHEN|THEN|ELSE|END)\b/gi,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern:
        /\b(VARCHAR|INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|FLOAT|REAL|DATE|TIME|TIMESTAMP|BOOLEAN|TEXT|BLOB|CLOB)\b/gi,
      className: "text-cyan-600 dark:text-cyan-400",
    },
    {
      pattern: /\b(TRUE|FALSE|NULL)\b/gi,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /--.*$/gm,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\/\*[\s\S]*?\*\//g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  json: [
    {
      pattern: /"([^"\\]|\\.)*"(?=\s*:)/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"(?!\s*:)/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\b(true|false|null)\b/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  xml: [
    {
      pattern: /<\?xml.*?\?>/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /<\/?[a-zA-Z][^>]*>/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\s[a-zA-Z-]+=/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      pattern: /<!--[\s\S]*?-->/g,
      className: "text-gray-500 dark:text-gray-400 italic",
    },
    { pattern: /&[a-zA-Z0-9]+;/g, className: "text-red-600 dark:text-red-400" },
  ],
  yaml: [
    {
      pattern: /^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*:)/gm,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /:\s*[|>][-+]?\d*$/gm,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    {
      pattern: /\b(true|false|null|yes|no|on|off)\b/gi,
      className: "text-orange-600 dark:text-orange-400",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /^---$|^\.\.\.$/gm,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  markdown: [
    {
      pattern: /^#{1,6}\s+.+$/gm,
      className: "text-blue-600 dark:text-blue-400 font-bold",
    },
    {
      pattern: /\*\*([^*]+)\*\*|__([^_]+)__/g,
      className: "text-gray-900 dark:text-gray-100 font-bold",
    },
    {
      pattern: /\*([^*]+)\*|_([^_]+)_/g,
      className: "text-gray-900 dark:text-gray-100 italic",
    },
    {
      pattern: /`([^`]+)`/g,
      className: "text-red-600 dark:text-red-400 bg-gray-100 dark:bg-gray-800",
    },
    {
      pattern: /\[([^\]]+)\]\(([^)]+)\)/g,
      className: "text-blue-600 dark:text-blue-400 underline",
    },
    {
      pattern: /^[-*+]\s+/gm,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /^\d+\.\s+/gm,
      className: "text-purple-600 dark:text-purple-400",
    },
  ],
  bash: [
    {
      pattern:
        /\b(if|then|else|elif|fi|case|esac|for|while|until|do|done|function|select|time|coproc|in|return|exit|break|continue|source|alias|unalias|export|readonly|local|declare|typeset|shift|set|unset|getopts|eval|exec|cd|pwd|echo|printf|read|test)\b/g,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\$\{?[a-zA-Z_][a-zA-Z0-9_]*\}?|\$[0-9@#$?*!-]/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    { pattern: /\b\d+\b/g, className: "text-purple-600 dark:text-purple-400" },
    {
      pattern:
        /\b(ls|cd|pwd|mkdir|rmdir|rm|cp|mv|find|grep|awk|sed|sort|uniq|cut|head|tail|cat|less|more|wc|ps|top|kill|jobs|bg|fg|nohup|screen|tmux|ssh|scp|rsync|curl|wget|git|docker|npm|pip)\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
  ],
  powershell: [
    {
      pattern:
        /\b(if|else|elseif|switch|for|foreach|while|do|until|break|continue|function|filter|workflow|configuration|class|enum|param|begin|process|end|try|catch|finally|throw|return|exit)\b/gi,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      pattern: /\$[a-zA-Z_][a-zA-Z0-9_]*|\$\{[^}]+\}/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      className: "text-green-600 dark:text-green-400",
    },
    { pattern: /#.*$/gm, className: "text-gray-500 dark:text-gray-400 italic" },
    {
      pattern: /\b\d+(\.\d+)?\b/g,
      className: "text-purple-600 dark:text-purple-400",
    },
    {
      pattern:
        /\b(Get-|Set-|New-|Remove-|Add-|Clear-|Copy-|Move-|Rename-|Test-|Start-|Stop-|Restart-|Enable-|Disable-|Import-|Export-|Select-|Where-|Sort-|Group-|Measure-|Compare-|ForEach-|Write-|Read-)[a-zA-Z]+\b/g,
      className: "text-cyan-600 dark:text-cyan-400",
    },
  ],
  text: [],
};

// Language detection patterns
const languageDetection = {
  javascript: [
    /\b(function|const|let|var|=>\s*{|console\.log|require\(|module\.exports)\b/,
    /\b(async|await|Promise|setTimeout|setInterval)\b/,
  ],
  typescript: [
    /\b(interface|type\s+\w+\s*=|public|private|protected|readonly)\b/,
    /:\s*(string|number|boolean|any|void|never)/,
  ],
  python: [
    /\b(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import|if\s+__name__\s*==\s*['"]+__main__['"]+)\b/,
    /\b(print\(|range\(|len\(|str\(|int\(|float\()\b/,
  ],
  java: [
    /\b(public\s+class|public\s+static\s+void\s+main|System\.out\.print|import\s+java\.)\b/,
    /\b(public|private|protected)\s+(static\s+)?(final\s+)?\w+\s+\w+\s*\(/,
  ],
  html: [
    /<(!DOCTYPE\s+html|html|head|body|div|span|p|a|img|script|style)/i,
    /<\w+[^>]*>[\s\S]*?<\/\w+>/,
  ],
  css: [
    /[.#]?\w+\s*{[\s\S]*?}/,
    /\w+\s*:\s*[\w\s-]+;/,
    /@(media|import|keyframes|font-face)/,
  ],
  cpp: [
    /\b(std::|#include|using namespace|template|class|public:|private:|protected:)\b/,
    /\b(cout|cin|vector|string|endl)\b/,
  ],
  c: [
    /\b(#include|printf|scanf|malloc|free|sizeof)\b/,
    /\b(int main\(|void\s+\w+\()\b/,
  ],
  csharp: [
    /\b(using System|public class|Console\.|string\[\]|void Main)\b/,
    /\b(public|private|protected|static)\s+(class|void|int|string)\b/,
  ],
  php: [
    /\$[a-zA-Z_][a-zA-Z0-9_]*/,
    /\b(<?php|echo|print|function|class|public|private|protected)\b/,
  ],
  ruby: [
    /\b(def\s+\w+|class\s+\w+|puts|print|require|include|attr_accessor)\b/,
    /\b(end|do\s*\||\.each|\.map|\.select)\b/,
  ],
  go: [
    /\b(package\s+main|func\s+main\(|import\s*\(|fmt\.Print)\b/,
    /\b(go\s+func|defer|chan|range)\b/,
  ],
  rust: [
    /\b(fn\s+main\(|let\s+mut|pub\s+fn|use\s+std::)\b/,
    /\b(println!|match|impl|trait|Vec<)\b/,
  ],
  sql: [
    /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i,
    /\b(JOIN|GROUP BY|ORDER BY|HAVING)\b/i,
  ],
  json: [/^\s*{[\s\S]*}$/, /"\w+":\s*["{\[]/],
  xml: [/<\?xml\s+version/, /<\/?\w+[^>]*>/],
  yaml: [/^[\w-]+:\s*$/m, /^---$/m],
  markdown: [/^#{1,6}\s+/m, /\*\*[^*]+\*\*|\*[^*]+\*/],
  bash: [/\b(if\s*\[|echo|export|chmod|bash|sh)\b/, /\$\{?\w+\}?|\$[0-9@#$?*]/],
  powershell: [
    /\b(Get-|Set-|New-|Remove-)\w+/,
    /\$\w+|Write-Host|Import-Module/,
  ],
};

// Syntax highlighting function
const applySyntaxHighlighting = (code, lang) => {
  if (!code || !syntaxPatterns[lang]) return code;

  let highlightedCode = code;
  const patterns = syntaxPatterns[lang];

  // Create a list of all matches with their positions
  const matches = [];
  patterns.forEach((rule, ruleIndex) => {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(code)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        className: rule.className,
        text: match[0],
        ruleIndex,
      });
      if (!rule.pattern.global) break;
    }
  });

  // Sort matches by position (earliest first)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Remove overlapping matches (keep the first one)
  const validMatches = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      validMatches.push(match);
      lastEnd = match.end;
    }
  }

  // Apply highlighting from end to start to preserve indices
  validMatches.reverse().forEach((match) => {
    const before = highlightedCode.slice(0, match.start);
    const highlighted = `<span class="${match.className}">${match.text}</span>`;
    const after = highlightedCode.slice(match.end);
    highlightedCode = before + highlighted + after;
  });

  return highlightedCode;
};

// Auto-detect language based on code content
const detectLanguage = (code) => {
  if (!code || code.trim().length < 10) return null;

  const scores = {};

  Object.entries(languageDetection).forEach(([lang, patterns]) => {
    scores[lang] = 0;
    patterns.forEach((pattern) => {
      const matches = code.match(pattern);
      if (matches) {
        scores[lang] += matches.length;
      }
    });
  });

  // Find language with highest score
  const bestMatch = Object.entries(scores).reduce(
    (best, [lang, score]) => {
      return score > best.score ? { lang, score } : best;
    },
    { lang: null, score: 0 }
  );

  return bestMatch.score > 0 ? bestMatch.lang : null;
};

// Handle special keys for better editing experience
const handleKeyDown = (e, contentRef, updateHighlighting) => {
  const element = contentRef.current;
  if (!element) return;

  // Handle Tab key for indentation
  if (e.key === "Tab") {
    e.preventDefault();
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    // Insert two spaces
    const textNode = document.createTextNode("  ");
    range.insertNode(textNode);

    // Move cursor after the inserted spaces
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Update highlighting
    requestAnimationFrame(updateHighlighting);
  }

  // Handle Enter key for auto-indentation
  if (e.key === "Enter") {
    e.preventDefault();
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    // Get current line for indentation
    const textContent = element.textContent || '';
    const cursorPos = range.startOffset;
    const beforeCursor = textContent.substring(0, cursorPos);
    const currentLine = beforeCursor.split('\n').pop();
    const indentMatch = currentLine.match(/^(\s*)/);
    const currentIndent = indentMatch ? indentMatch[1] : '';

    // Add extra indent for opening braces
    const extraIndent = /[{[(]\s*$/.test(currentLine.trim()) ? '  ' : '';

    // Insert line break and indentation
    const newText = '\n' + currentIndent + extraIndent;
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Update highlighting
    requestAnimationFrame(updateHighlighting);
  }
};

const CodeBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [language, setLanguage] = useState(
    block.properties?.language || "javascript"
  );
  const [showLineNumbers, setShowLineNumbers] = useState(
    block.properties?.showLineNumbers || false
  );
  const [copied, setCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const preRef = useRef(null);
  const dropdownRef = useRef(null);
  const highlightRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const languages = [
    "javascript",
    "typescript",
    "python",
    "java",
    "cpp",
    "c",
    "csharp",
    "php",
    "ruby",
    "go",
    "rust",
    "sql",
    "html",
    "css",
    "json",
    "xml",
    "yaml",
    "markdown",
    "bash",
    "powershell",
    "text",
  ];

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    setIsDropdownOpen(false);
    setAutoDetected(true); // Prevent auto-detection from overriding manual selection
    onChange(block.id, {
      properties: {
        ...block.properties,
        language: newLanguage,
      },
    });
  };

  // Auto-detect language when content changes
  useEffect(() => {
    if (block.content && block.content.trim().length > 10) {
      const detected = detectLanguage(block.content);
      if (detected && detected !== language && !autoDetected) {
        setLanguage(detected);
        setAutoDetected(true);
        onChange(block.id, {
          properties: {
            ...block.properties,
            language: detected,
          },
        });
      }
    }
  }, [block.content]);

  // Update syntax highlighting when content or language changes
  useEffect(() => {
    if (highlightRef.current && contentRef.current) {
      const content = contentRef.current.textContent || "";
      const highlighted = applySyntaxHighlighting(content, language);
      highlightRef.current.innerHTML = highlighted;
    }
  }, [block.content, language]);

  // Real-time syntax highlighting update
  const updateHighlighting = () => {
    if (highlightRef.current && contentRef.current) {
      const content = contentRef.current.textContent || "";
      const highlighted = applySyntaxHighlighting(content, language);
      highlightRef.current.innerHTML = highlighted;
    }
  };


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleLineNumbers = () => {
    const newValue = !showLineNumbers;
    setShowLineNumbers(newValue);
    onChange(block.id, {
      properties: {
        ...block.properties,
        showLineNumbers: newValue,
      },
    });
  };

  const copyCode = async () => {
    const code = preRef.current?.textContent || block.content || "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div
      className="code-block-wrapper border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg"
      style={{ overflow: "visible" }}
    >
      {/* Code block header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-600">
        <div className="flex items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between gap-1 text-xs bg-transparent border-none text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-200 focus:outline-none cursor-pointer px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors w-28"
            >
              <span className="flex items-center gap-1">
                {language}
                {autoDetected && (
                  <span className="text-xs text-green-500">•</span>
                )}
              </span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isDropdownOpen && (
              <div
                className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-600 midnight:border-gray-600 rounded-md shadow-lg w-28 max-h-60 overflow-y-auto"
                style={{ zIndex: 99999 }}
              >
                {languages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors ${
                      language === lang
                        ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-600 dark:text-blue-400 midnight:text-blue-400"
                        : "text-gray-700 dark:text-gray-300 midnight:text-gray-300"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleLineNumbers}
            className="text-xs text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
          >
            {showLineNumbers ? "Hide" : "Show"} lines
          </button>
        </div>

        <button
          onClick={copyCode}
          className="flex items-center gap-1 text-xs text-gray-500 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
        >
          {copied ? (
            <Check className="w-3 h-3" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Code content */}
      <div className="relative overflow-hidden">
        <pre
          ref={preRef}
          className={`${
            showLineNumbers ? "pl-12" : "pl-4"
          } pr-4 py-3 bg-gray-50 dark:bg-gray-900 midnight:bg-gray-950 text-sm font-mono overflow-x-auto relative`}
        >
          {/* Syntax highlighted background */}
          <code
            ref={highlightRef}
            className={`absolute inset-0 pointer-events-none whitespace-pre-wrap transition-opacity duration-200 ${
              isTyping ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
              padding: showLineNumbers ? "12px 16px 12px 48px" : "12px 16px",
              minHeight: "1.5rem",
              lineHeight: "1.5",
              wordWrap: "break-word",
            }}
            aria-hidden="true"
          />

          {/* Editable content */}
          <code
            ref={contentRef}
            contentEditable
            className="relative bg-transparent outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 caret-gray-900 dark:caret-gray-100 midnight:caret-gray-100 selection:bg-blue-200 dark:selection:bg-blue-800"
            style={{
              minHeight: "1.5rem",
              lineHeight: "1.5",
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
              display: "block",
            }}
            placeholder={`Type your ${language} code here...`}
            spellCheck={false}
            onKeyDown={(e) => handleKeyDown(e, contentRef, updateHighlighting)}
            onInput={(e) => {
              // Update block content without interfering with cursor
              const newContent = e.target.textContent || '';

              // Show typing state - hide syntax highlighting
              setIsTyping(true);

              // Clear previous timeout
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }

              // Set timeout to stop typing state and show highlighting
              typingTimeoutRef.current = setTimeout(() => {
                setIsTyping(false);
                updateHighlighting();
              }, 300);

              if (commonProps.onInput) {
                commonProps.onInput({ target: { textContent: newContent } });
              }
            }}
            {...commonProps}
          />
        </pre>

        {/* Line numbers */}
        {showLineNumbers && (
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-600 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 text-right py-3 pr-2 font-mono select-none">
            {(block.content || "").split("\n").map((_, index) => (
              <div key={index} className="leading-6">
                {index + 1}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

CodeBlock.propTypes = {
  block: PropTypes.shape({
    id: PropTypes.string.isRequired,
    content: PropTypes.string,
    properties: PropTypes.shape({
      language: PropTypes.string,
      showLineNumbers: PropTypes.bool,
    }),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  contentRef: PropTypes.object.isRequired,
  commonProps: PropTypes.object.isRequired,
};

export default CodeBlock;
