import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal component to render children outside the parent DOM hierarchy
 * This is useful for modals, tooltips, and other overlays to avoid z-index issues
 */
const Portal = ({ children, containerId = 'modal-root' }) => {
  const [container, setContainer] = useState(null);

  useEffect(() => {
    // Get or create the portal container
    let portalContainer = document.getElementById(containerId);
    
    if (!portalContainer) {
      portalContainer = document.createElement('div');
      portalContainer.id = containerId;
      document.body.appendChild(portalContainer);
    }

    setContainer(portalContainer);

    // Cleanup: remove the container if it's empty when component unmounts
    return () => {
      if (portalContainer && portalContainer.childNodes.length === 0) {
        portalContainer.remove();
      }
    };
  }, [containerId]);

  // Render nothing until the container is ready
  if (!container) return null;

  // Render children into the portal container
  return createPortal(children, container);
};

export default Portal;
