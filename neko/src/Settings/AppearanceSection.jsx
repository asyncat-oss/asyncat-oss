import {
  BrainCircuit,
  Bell,
  Cpu,
  Layout,
  Moon,
  PanelLeft,
  Palette,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Wrench,
  KanbanSquare,
  GraduationCap,
  Workflow,
} from "lucide-react";
import KeyboardShortcutsSection from "./KeyboardShortcutsSection.jsx";
import AppIconSection from "./AppIconSection.jsx";
import PetSection from "./PetSection.jsx";
import PropTypes from "prop-types";
import { useUiPreferences } from "../contexts/UiPreferencesContext.jsx";

const cardClasses =
  "overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950";
const insetClasses =
  "p-4";
const textClasses = "text-gray-700 dark:text-gray-200 midnight:text-gray-200";

const PreferenceCard = ({ icon: Icon, title, description, children }) => (
  <section className={cardClasses}>
    <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 midnight:border-slate-800">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
          {title}
        </h3>
      </div>
      {description ? <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{description}</p> : null}
    </div>
    <div className={insetClasses}>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  </section>
);

const RadioRow = ({ name, checked, onChange, icon: Icon, label }) => (
  <label className="flex items-center justify-between gap-4 p-3 rounded-lg border border-transparent hover:border-gray-300/70 dark:hover:border-gray-600/70 midnight:hover:border-gray-600/70 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 midnight:hover:bg-gray-700/70 cursor-pointer transition-colors">
    <span className="flex min-w-0 items-center gap-3">
      {Icon ? (
        <Icon className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400 midnight:text-gray-400" />
      ) : null}
      <span className={`${textClasses} truncate`}>{label}</span>
    </span>
    <input
      type="radio"
      name={name}
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400 midnight:text-blue-400 midnight:focus:ring-blue-400"
    />
  </label>
);

const CheckboxRow = ({ checked, onChange, icon: Icon, label, locked }) => (
  <label
    className={`flex items-center justify-between gap-4 p-3 rounded-lg border border-transparent transition-colors ${locked ? "opacity-50 cursor-not-allowed" : "hover:border-gray-300/70 dark:hover:border-gray-600/70 midnight:hover:border-gray-600/70 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 midnight:hover:bg-gray-700/70 cursor-pointer"}`}
  >
    <span className="flex min-w-0 items-center gap-3">
      {Icon ? (
        <Icon className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400 midnight:text-gray-400" />
      ) : null}
      <span className={`${textClasses} truncate`}>{label}</span>
      {locked && (
        <span className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 ml-1">
          (always shown)
        </span>
      )}
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={locked}
      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400 midnight:text-blue-400 midnight:focus:ring-blue-400 rounded"
    />
  </label>
);

const AppearanceSection = ({ theme, setThemeMode }) => {
  const {
    sidebarState,
    setSidebarState,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    navItemsVisibility,
    toggleNavItem,
  } = useUiPreferences();

  return (
    <div className="space-y-5">
      <PreferenceCard
        icon={Palette}
        title="Theme"
        description="Use a fixed theme or follow your operating system preference."
      >
        <RadioRow
          name="theme"
          icon={Sun}
          label="Light Mode"
          checked={theme === "light"}
          onChange={() => setThemeMode("light")}
        />
        <RadioRow
          name="theme"
          icon={Moon}
          label="Dark Mode"
          checked={theme === "dark"}
          onChange={() => setThemeMode("dark")}
        />
        <RadioRow
          name="theme"
          icon={Star}
          label="Midnight"
          checked={theme === "midnight"}
          onChange={() => setThemeMode("midnight")}
        />
        <RadioRow
          name="theme"
          icon={Sun}
          label="System Preference"
          checked={theme === "system"}
          onChange={() => setThemeMode("system")}
        />
      </PreferenceCard>

      <PreferenceCard
        icon={Layout}
        title="Navigation"
        description="Choose whether the sidebar shows labels, then keep only the destinations you use. Command Center and Settings are always available."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioRow
            name="sidebarState"
            icon={PanelLeft}
            label="Show labels"
            checked={sidebarState === "expanded"}
            onChange={() => setSidebarState("expanded")}
          />
          <RadioRow
            name="sidebarState"
            label="Compact icons"
            checked={sidebarState === "collapsed"}
            onChange={() => setSidebarState("collapsed")}
          />
        </div>
        <div className="mt-1 border-t border-gray-100 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-gray-800 dark:text-gray-600 midnight:border-slate-800 midnight:text-slate-600">
          Visible destinations
        </div>
        <CheckboxRow
          icon={KanbanSquare}
          label="Tasks"
          checked={navItemsVisibility.projects}
          onChange={() => toggleNavItem("projects")}
        />
        <CheckboxRow
          icon={Workflow}
          label="Workflows"
          checked={navItemsVisibility.workflows}
          onChange={() => toggleNavItem("workflows")}
        />
        <CheckboxRow
          icon={Bell}
          label="Activity"
          checked={navItemsVisibility.activity}
          onChange={() => toggleNavItem("activity")}
        />
        <CheckboxRow
          icon={Cpu}
          label="Models"
          checked={navItemsVisibility.models}
          onChange={() => toggleNavItem("models")}
        />
        <CheckboxRow
          icon={Wrench}
          label="Tools & Skills"
          checked={navItemsVisibility.tools}
          onChange={() => toggleNavItem("tools")}
        />
        <CheckboxRow
          icon={BrainCircuit}
          label="Automation"
          checked={navItemsVisibility.agent}
          onChange={() => toggleNavItem("agent")}
        />
        <CheckboxRow
          icon={GraduationCap}
          label="Training"
          checked={navItemsVisibility.training}
          onChange={() => toggleNavItem("training")}
        />
        <CheckboxRow
          icon={Trash2}
          label="Trash"
          checked={navItemsVisibility.trash}
          onChange={() => toggleNavItem("trash")}
        />
      </PreferenceCard>

      <PreferenceCard
        icon={Sparkles}
        title="Page Motion"
        description="Add a light fade when moving between main sections."
      >
        <RadioRow
          name="pageTransitions"
          label="Subtle Transitions"
          checked={pageTransitionsEnabled}
          onChange={() => setPageTransitionsEnabled(true)}
        />
        <RadioRow
          name="pageTransitions"
          label="No Page Motion"
          checked={!pageTransitionsEnabled}
          onChange={() => setPageTransitionsEnabled(false)}
        />
      </PreferenceCard>

      <AppIconSection />

      <PetSection />

      <KeyboardShortcutsSection />
    </div>
  );
};

PreferenceCard.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
};

RadioRow.propTypes = {
  name: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
};

CheckboxRow.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
  locked: PropTypes.bool,
};

AppearanceSection.propTypes = {
  theme: PropTypes.oneOf(["light", "dark", "midnight", "system"]).isRequired,
  setThemeMode: PropTypes.func.isRequired,
};

export default AppearanceSection;
