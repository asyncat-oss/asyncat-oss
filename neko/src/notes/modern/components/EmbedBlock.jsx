// An embed block: a link to a video, pen or design, shown as a card that
// opens it. Without a link it asks for one.

import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLinkFieldFocus } from './linkFieldFocus.js';
import { Link, Youtube, ExternalLink, Pencil } from 'lucide-react';
import Select from '../../../components/ui/Select.jsx';
import Button from '../../../components/ui/Button.jsx';
import { Field, Input } from '../../../components/ui/Field.jsx';

// The placeholder for an embed we don't play inline: one icon and two lines.
function EmbedTile({ icon: Icon, title, detail }) {
  return (
    <div className="flex aspect-video items-center justify-center rounded-xl border border-line bg-surface">
      <div className="text-center">
        <Icon className="mx-auto mb-2 h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {detail ? <p className="text-[12px] text-fg-subtle">{detail}</p> : null}
      </div>
    </div>
  );
}

EmbedTile.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.node.isRequired,
  detail: PropTypes.node,
};

const EmbedBlock = ({ block, onChange, active = false }) => {
  const [url, setUrl] = useState(block.properties?.url || '');
  const [embedType, setEmbedType] = useState(block.properties?.type || 'generic');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(!block.properties?.url);
  const inputRef = useRef(null);
  useLinkFieldFocus(inputRef, isEditing, active);

  const embedTypes = [
    { type: 'youtube', label: 'YouTube', icon: Youtube, pattern: /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/ },
    { type: 'vimeo', label: 'Vimeo', icon: ExternalLink, pattern: /vimeo\.com\/(?:.*#|.*\/)?(\d+)/ },
    { type: 'codepen', label: 'CodePen', icon: ExternalLink, pattern: /codepen\.io\/.*\/pen\/(.*)/ },
    { type: 'figma', label: 'Figma', icon: ExternalLink, pattern: /figma\.com\/(file|proto)\/([a-zA-Z0-9]{22,128})/ },
    { type: 'generic', label: 'Generic', icon: Link, pattern: null }
  ];

  const detectEmbedType = (url) => {
    for (const type of embedTypes) {
      if (type.pattern && type.pattern.test(url)) {
        return type.type;
      }
    }
    return 'generic';
  };

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    const detectedType = detectEmbedType(newUrl);
    setEmbedType(detectedType);
  };

  const handleSaveUrl = () => {
    setIsLoading(true);
    
    // Simulate loading and URL validation
    setTimeout(() => {
      onChange(block.id, {
        properties: {
          ...block.properties,
          url: url,
          type: embedType,
          title: getUrlTitle(url)
        }
      });
      setIsEditing(false);
      setIsLoading(false);
    }, 1000);
  };

  const getUrlTitle = (url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `${domain.charAt(0).toUpperCase() + domain.slice(1)} embed`;
    } catch {
      return 'Embedded content';
    }
  };

  const renderEmbed = () => {
    if (!url) return null;

    switch (embedType) {
      case 'youtube': {
        const youtubeId = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/)?.[1];
        return <EmbedTile icon={Youtube} title="YouTube video" detail={youtubeId} />;
      }

      case 'vimeo':
        return <EmbedTile icon={ExternalLink} title="Vimeo video" detail="Click to view" />;

      case 'codepen':
        return <EmbedTile icon={ExternalLink} title="CodePen" detail="Interactive code demo" />;

      case 'figma':
        return <EmbedTile icon={ExternalLink} title="Figma design" detail="Design prototype" />;

      default:
        return (
          <div className="rounded-xl border border-line p-4 transition-colors hover:bg-hover">
            <div className="flex items-center gap-3">
              <Link className="h-6 w-6 flex-shrink-0 text-fg-subtle" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-fg">
                  {getUrlTitle(url)}
                </p>
                <p className="truncate text-[12px] text-fg-subtle">
                  {url}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 flex-shrink-0 text-fg-subtle" />
            </div>
          </div>
        );
    }
  };

  if (isEditing) {
    return (
      <div className="embed-block rounded-xl border border-line p-4">
        <div className="space-y-3">
          <Field label="Link to embed" htmlFor={`embed-url-${block.id}`}>
            <Input
              ref={inputRef}
              id={`embed-url-${block.id}`}
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="A YouTube, Vimeo, CodePen or Figma link"
            />
          </Field>

          {url && (
            <Field label="Detected type" htmlFor={`embed-type-${block.id}`}>
              <Select
                id={`embed-type-${block.id}`}
                fullWidth={false}
                className="max-w-full"
                value={embedType}
                onChange={setEmbedType}
                options={embedTypes.map((type) => ({ value: type.type, label: type.label }))}
              />
            </Field>
          )}

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleSaveUrl}
              disabled={!url}
              loading={isLoading}
            >
              Embed
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
    <div className="embed-block group">
      {/* Controls - shown on hover */}
      <div className="mb-2 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
        <div className="text-[12px] text-fg-subtle">
          {embedTypes.find(t => t.type === embedType)?.label} embed
        </div>

        <Button variant="ghost" size="xs" icon={Pencil} onClick={() => setIsEditing(true)}>
          Edit link
        </Button>
      </div>

      {/* Embed content */}
      <div className="cursor-pointer" onClick={() => window.open(url, '_blank')}>
        {renderEmbed()}
      </div>
    </div>
  );
};

export default EmbedBlock;
