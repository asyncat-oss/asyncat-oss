// Recent Claude Code and Codex sessions from this computer, under the chat list.
// Opening one copies it into an Asyncat chat that continues the same session.

import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { agentApi } from "../CommandCenter/api";
import { ProviderGlyph } from "../Models/modelLogos.jsx";
import { errorDetail, useToast } from "../components/toastContext.js";
import { ENGINE_NAMES, folderName, relativeTime } from "../Agent/externalAgentFormat.js";

const OPEN_KEY = "asyncat_sidebar_coding_sessions_open";
const SHOWN = 5;
const REFRESH_MS = 60 * 1000;

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) !== "false"; } catch { return true; }
}

export default function ExternalSessionsSection({ onOpened }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(readOpen);
  const [openingId, setOpeningId] = useState(null);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const result = await agentApi.listExternalSessions({ limit: 30 });
      // Sessions already open in Asyncat are in Recents; automated and
      // temp-folder runs (scripts, Asyncat's own) would only add noise here.
      setSessions((result?.sessions || []).filter((session) => !session.automated && !session.temporary && !session.conversationId));
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => { if (Date.now() - lastLoad.current > REFRESH_MS) load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const toggle = () => setOpen((value) => {
    try { localStorage.setItem(OPEN_KEY, String(!value)); } catch { /* localStorage may be unavailable */ }
    return !value;
  });

  const openSession = async (session) => {
    setOpeningId(session.id);
    try {
      const result = await agentApi.openExternalSession(session.engine, session.id);
      if (!result?.conversationId) throw new Error(result?.error || "It couldn't be opened.");
      navigate(`/conversations/${result.conversationId}`);
      onOpened?.();
      load();
    } catch (error) {
      toast.error(`Couldn't open that ${ENGINE_NAMES[session.engine]} session`, { detail: errorDetail(error) });
    } finally {
      setOpeningId(null);
    }
  };

  if (sessions.length === 0) return null;

  return (
    <section className="mt-4" aria-label="Claude Code and Codex sessions">
      <div className="group/section flex h-7 items-center justify-between pl-2.5 pr-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1 rounded text-[11px] font-medium text-fg-subtle outline-none transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Claude Code &amp; Codex
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => navigate("/agent/profiles?tab=coding")}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle opacity-0 outline-none transition-opacity hover:bg-hover hover:text-fg-muted focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          View all
        </button>
      </div>
      {open ? (
        <div className="space-y-px">
          {sessions.slice(0, SHOWN).map((session) => (
            <button
              key={`${session.engine}:${session.id}`}
              type="button"
              onClick={() => openSession(session)}
              disabled={Boolean(openingId)}
              title={`${ENGINE_NAMES[session.engine]} · ${folderName(session.cwd) || "no folder"} · ${relativeTime(session.updatedAt)}`}
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 disabled:cursor-wait"
            >
              {openingId === session.id
                ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-subtle" />
                : <ProviderGlyph providerId={session.engine} className="h-3.5 w-3.5 shrink-0 opacity-80" />}
              <span className="min-w-0 flex-1 truncate text-[13px]">{session.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

ExternalSessionsSection.propTypes = {
  onOpened: PropTypes.func,
};
