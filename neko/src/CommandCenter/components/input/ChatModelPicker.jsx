// ChatModelPicker.jsx — the composer's model button and menu: the model this
// chat runs on, and the others it can switch to. Picking one changes this chat
// only, and new chats start with it (see utils/chatModel.js).
import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ChevronDown, Cloud, Cpu, Loader2, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../../components/ui/Menu.jsx";
import { modelStatusText, sameModel } from "../../utils/chatModel.js";

function OptionLabel({ label, detail }) {
  return (
    <span className="flex min-w-0 flex-col py-0.5">
      <span className="truncate text-fg">{label}</span>
      {detail ? <span className="truncate text-[11px] leading-4 text-fg-subtle">{detail}</span> : null}
    </span>
  );
}

OptionLabel.propTypes = { label: PropTypes.string.isRequired, detail: PropTypes.string };

export default function ChatModelPicker({ model, options = [], agentModel = null, loading = null, busy = false, disabled = false, temporary = false, openRequest = 0, onChange, onOpen, onManage }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  // Opened from elsewhere: each new `openRequest` (a model error's "Pick
  // another model") opens the menu once.
  const handledRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === handledRequest.current) return;
    handledRequest.current = openRequest;
    if (disabled) return;
    onOpen?.();
    setOpen(true);
  }, [disabled, onOpen, openRequest]);
  // An agent with a model of its own answers with it, whatever the chat's is.
  const answering = agentModel || model;
  const working = Boolean(loading) || busy;
  const label = modelStatusText({ name: answering?.name, loading });
  const Icon = working ? Loader2 : model?.missing && !agentModel ? TriangleAlert : answering?.isLocal ? Cpu : Cloud;
  const title = loading?.waitingFor
    ? `Another chat is using ${loading.waitingFor}. ${loading.name || answering?.name || "This chat's model"} loads when it's done.`
    : agentModel
      ? `${agentModel.agentName} answers with its own model, ${agentModel.name}`
      : model?.missing
        ? `${model.name} isn't one of your models any more. Pick another.`
        : model?.name
          ? `${model.followsDefault ? "Default model" : "This chat's model"}: ${model.name}`
          : "Choose a model";
  const saved = options.filter((item) => item.group === "saved");
  const local = options.filter((item) => item.group === "local");

  const toggle = () => {
    if (!open) onOpen?.();
    setOpen((isOpen) => !isOpen);
  };

  const item = (option) => (
    <MenuItem
      key={option.key}
      label={<OptionLabel label={option.label} detail={option.detail} />}
      checked={sameModel(option.ref, model?.ref)}
      onSelect={() => onChange?.(option)}
    />
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-chat-model={answering?.name || ""}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={`inline-flex min-w-0 max-w-[15rem] items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed ${
          model?.missing && !agentModel ? "text-amber-600 dark:text-amber-400" : "text-fg-muted"
        }`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${working ? "animate-spin" : ""}`} />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>
      <Menu anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} placement="top-start" width={296} label="Model for this chat">
        {agentModel ? (
          <p className="px-2.5 pb-1.5 pt-1 text-[12px] leading-4 text-fg-muted">
            {agentModel.agentName} answers with its own model, {agentModel.name}. Without {agentModel.agentName}, this chat uses the one checked below.
          </p>
        ) : null}
        {saved.length ? (
          <>
            <MenuLabel>Providers</MenuLabel>
            {saved.map(item)}
          </>
        ) : null}
        {local.length ? (
          <>
            {saved.length ? <MenuSeparator /> : null}
            <MenuLabel>Downloaded models</MenuLabel>
            {local.map(item)}
          </>
        ) : null}
        {!options.length ? (
          <div className="px-2.5 py-2">
            <p className="text-[13px] text-fg">No models yet</p>
            <p className="mt-0.5 text-[12px] leading-4 text-fg-subtle">Connect a provider or download a model on the Models page.</p>
          </div>
        ) : null}
        <MenuSeparator />
        <MenuItem icon={SlidersHorizontal} label="Manage models" onSelect={onManage} />
        {options.length ? (
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-4 text-fg-subtle">
            {temporary ? "For this temporary chat only." : "Changes this chat only. New chats start with the model you pick."}
          </p>
        ) : null}
      </Menu>
    </>
  );
}

ChatModelPicker.propTypes = {
  model: PropTypes.shape({
    ref: PropTypes.object,
    name: PropTypes.string,
    isLocal: PropTypes.bool,
    followsDefault: PropTypes.bool,
    missing: PropTypes.bool,
  }),
  options: PropTypes.arrayOf(PropTypes.object),
  agentModel: PropTypes.shape({ agentName: PropTypes.string, name: PropTypes.string, isLocal: PropTypes.bool }),
  loading: PropTypes.shape({ name: PropTypes.string, waitingFor: PropTypes.string }),
  busy: PropTypes.bool,
  disabled: PropTypes.bool,
  temporary: PropTypes.bool,
  openRequest: PropTypes.number,
  onChange: PropTypes.func,
  onOpen: PropTypes.func,
  onManage: PropTypes.func,
};
