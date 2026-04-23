// CreateProjectFlow.jsx - Clean project creation flow without templates
import { useEffect, useState } from "react";
import {
  X, Check, Calendar, Target,
  KanbanSquare, List, Clock, GanttChartSquare,
  FileText, Link2,
  Loader2, ArrowRight, ArrowLeft,
  LayoutGrid, Plus
} from "lucide-react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import eventBus from "../../utils/eventBus.js";

// Import API functions
import { projectApi, projectViewsApi } from "../projectApi";

const today = new Date().toISOString().split("T")[0];

// CLEANED: Complete list of all available views - removed deprecated views
const ALL_AVAILABLE_VIEWS = [
  'kanban', 'list', 'timeline', 'gantt', 'network',
  'gallery', 'notes', 'habits'
];

const CreateProjectFlow = ({ isOpen, onClose, onProjectCreate, session }) => {
  // State management
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    name: "",
    description: "",
    due_date: "",
    members: [],
    is_archived: false,
    starred: false,
    enabled_views: ALL_AVAILABLE_VIEWS
  });
  const [enableDueDate, setEnableDueDate] = useState(false);

  const [selectedViewPreferences, setSelectedViewPreferences] = useState([...ALL_AVAILABLE_VIEWS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use workspace context
  const { currentWorkspace } = useWorkspace();

  // CLEANED: View configurations with enhanced previews - removed deprecated views
  const allViewsConfig = {
    'kanban': {
      label: 'Kanban', 
      icon: KanbanSquare, 
      description: 'Visual task management with drag & drop',
      color: 'green',
      category: 'Views'
    },
    'list': { 
      label: 'List', 
      icon: List, 
      description: 'Clean, simple task list interface',
      color: 'gray',
      category: 'Views'
    },
    'timeline': { 
      label: 'Timeline', 
      icon: Clock, 
      description: 'Time-based project scheduling',
      color: 'orange',
      category: 'Views'
    },
    'gantt': { 
      label: 'Gantt', 
      icon: GanttChartSquare, 
      description: 'Advanced scheduling with dependencies',
      color: 'purple',
      category: 'Views'
    },
    'network': { 
      label: 'Network', 
      icon: Link2, 
      description: 'Visualize task relationships and dependencies',
      color: 'cyan',
      category: 'Views'
    },
    'gallery': { 
      label: 'Gallery', 
      icon: LayoutGrid, 
      description: 'Visual card-based gallery of tasks',
      color: 'pink',
      category: 'Views'
    },
    'notes': { 
      label: 'Notes', 
      icon: FileText, 
      description: 'Rich text documentation and meeting notes',
      color: 'indigo',
      category: 'Content'
    },
    'habits': {
      label: 'Habits',
      icon: Target,
      description: 'Track team habits and build positive routines',
      color: 'yellow',
      category: 'Tools'
    }
  };


  // Enhanced Component Selector
  const ComponentCard = ({ viewKey, config, isSelected, onToggle }) => {
    const getColorClasses = (color) => {
      const colors = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/10 text-blue-600 dark:text-blue-400 midnight:text-blue-400 border-blue-200 dark:border-blue-800 midnight:border-blue-900',
        green: 'bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 text-green-600 dark:text-green-400 midnight:text-green-400 border-green-200 dark:border-green-800 midnight:border-green-900',
        purple: 'bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-900/10 text-purple-600 dark:text-purple-400 midnight:text-purple-400 border-purple-200 dark:border-purple-800 midnight:border-purple-900',
        orange: 'bg-orange-50 dark:bg-orange-900/20 midnight:bg-orange-900/10 text-orange-600 dark:text-orange-400 midnight:text-orange-400 border-orange-200 dark:border-orange-800 midnight:border-orange-900',
        red: 'bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 text-red-600 dark:text-red-400 midnight:text-red-400 border-red-200 dark:border-red-800 midnight:border-red-900',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400 border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900',
        indigo: 'bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 border-indigo-200 dark:border-indigo-800 midnight:border-indigo-900',
        pink: 'bg-pink-50 dark:bg-pink-900/20 midnight:bg-pink-900/10 text-pink-600 dark:text-pink-400 midnight:text-pink-400 border-pink-200 dark:border-pink-800 midnight:border-pink-900',
        cyan: 'bg-cyan-50 dark:bg-cyan-900/20 midnight:bg-cyan-900/10 text-cyan-600 dark:text-cyan-400 midnight:text-cyan-400 border-cyan-200 dark:border-cyan-800 midnight:border-cyan-900',
        yellow: 'bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 text-yellow-600 dark:text-yellow-400 midnight:text-yellow-400 border-yellow-200 dark:border-yellow-800 midnight:border-yellow-900',
        gray: 'bg-gray-50 dark:bg-gray-900/20 midnight:bg-gray-900/10 text-gray-600 dark:text-gray-400 midnight:text-gray-500 border-gray-200 dark:border-gray-800 midnight:border-gray-900',
        slate: 'bg-slate-50 dark:bg-slate-900/20 midnight:bg-slate-900/10 text-slate-600 dark:text-slate-400 midnight:text-slate-500 border-slate-200 dark:border-slate-800 midnight:border-slate-900',
        teal: 'bg-teal-50 dark:bg-teal-900/20 midnight:bg-teal-900/10 text-teal-600 dark:text-teal-400 midnight:text-teal-400 border-teal-200 dark:border-teal-800 midnight:border-teal-900'
      };
      return colors[color] || colors.gray;
    };

    return (
      <div
        onClick={() => onToggle(viewKey)}
        className={`group relative p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
          isSelected
            ? 'border-gray-900 dark:border-white midnight:border-gray-200 bg-white dark:bg-gray-800 midnight:bg-gray-900 shadow-md hover:shadow-lg'
            : 'border-gray-200 dark:border-gray-700 midnight:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700 hover:shadow-md'
        }`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-transform group-hover:scale-110 ${
              getColorClasses(config.color)
            }`}>
              <config.icon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100 text-sm">
                {config.label}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mt-1">
                {config.description}
              </p>
            </div>
          </div>
          {isSelected && (
            <div className="w-6 h-6 rounded-full bg-gray-900 dark:bg-white midnight:bg-gray-200 flex items-center justify-center">
              <Check className="w-4 h-4 text-white dark:text-gray-900 midnight:text-gray-800" />
            </div>
          )}
        </div>
        
        {config.category && (
          <div className="absolute top-2 right-2">
            <span className="text-xs bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 px-2 py-1 rounded-full text-gray-600 dark:text-gray-400 midnight:text-gray-500">
              {config.category}
            </span>
          </div>
        )}
      </div>
    );
  };

  // UPDATED: Teasing Message Component for minimal selection
  const TeasingMessage = () => {
    const teasingMessages = [
      {
        title: "Really? Just an overview? 🤔",
        subtitle: "That's like ordering a pizza with just crust",
        description: "I mean, technically it's a project, but you're missing out on all the good stuff! How about adding some actual tools to, you know... do work?",
        emoji: "😅"
      },
      {
        title: "The minimalist approach, eh? 👀",
        subtitle: "Going for that 'less is more' vibe",
        description: "Bold choice! Create a project workspace with literally just an overview. Your future self will definitely thank you for this... productive setup.",
        emoji: "🙃"
      },
      {
        title: "The 'I'll figure it out later' special 📦",
        subtitle: "Maximum overview, minimum tools",
        description: "Congratulations! You've successfully created the digital equivalent of a fancy dashboard with nothing to manage. Very zen. Very... unproductive.",
        emoji: "🤷‍♀️"
      },
      {
        title: "Overview-only warrior! 🏆",
        subtitle: "The ultimate spectator mode",
        description: "Why use tools when you can just... look at things? Perfect for those who prefer to admire their empty project from a distance. Inspiring!",
        emoji: "👁️"
      }
    ];

    const [currentMessage] = useState(() => 
      teasingMessages[Math.floor(Math.random() * teasingMessages.length)]
    );

    if (!hasOnlyOverview()) return null;

    return (
      <div className="mb-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 border-2 border-yellow-200 dark:border-yellow-800 midnight:border-yellow-900 rounded-xl relative overflow-hidden">
        <div className="absolute top-4 right-4 text-3xl opacity-20">
          {currentMessage.emoji}
        </div>
        
        <div className="relative">
          <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-100 midnight:text-yellow-200 mb-2">
            {currentMessage.title}
          </h3>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 midnight:text-yellow-300 mb-3">
            {currentMessage.subtitle}
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 midnight:text-yellow-400 mb-4 leading-relaxed">
            {currentMessage.description}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-yellow-600 dark:text-yellow-400 midnight:text-yellow-500">
              <span>💡 Pro tip:</span>
              <span>Pick some actual tools below to make this useful</span>
            </div>
            <button
              onClick={() => {
                // Auto-select some helpful components
                const helpfulViews = ['kanban', 'list', 'notes'];
                setSelectedViewPreferences(prev => [
                  ...prev,
                  ...helpfulViews.filter(view => !prev.includes(view))
                ]);
              }}
              className="px-3 py-1 bg-yellow-600 dark:bg-yellow-500 midnight:bg-yellow-600 text-white text-xs rounded-full hover:bg-yellow-700 dark:hover:bg-yellow-600 midnight:hover:bg-yellow-700 transition-colors"
            >
              Fix this for me 🛠️
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Project Preview
  const EnhancedProjectPreview = () => (
    <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 rounded-xl flex items-center justify-center">
            <Target className="w-6 h-6 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white midnight:text-gray-100 text-lg">
              {projectData.name || "Untitled Project"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
              Custom project
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>
              {enableDueDate && projectData.due_date ? 
                new Date(projectData.due_date).toLocaleDateString() : 
                'No deadline'
              }
            </span>
          </div>
        </div>
      </div>

      {projectData.description && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
            {projectData.description}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">Workspace</h4>
        <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg">
          <span className="text-lg">{currentWorkspace?.emoji || '👥'}</span>
          <span className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-400">
            {getWorkspaceName()}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">Active Components ({selectedViewPreferences.length})</h4>
        <div className="grid grid-cols-3 gap-2">
          {selectedViewPreferences.slice(0, 6).map(viewKey => {
            const config = allViewsConfig[viewKey];
            return (
              <div key={viewKey} className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded">
                <config.icon className="w-3 h-3 text-gray-600 dark:text-gray-400 midnight:text-gray-500" />
                <span className="text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-400 truncate">{config.label}</span>
              </div>
            );
          })}
          {selectedViewPreferences.length > 6 && (
            <div className="flex items-center justify-center p-2 bg-gray-50 dark:bg-gray-700 midnight:bg-gray-800 rounded">
              <span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500">+{selectedViewPreferences.length - 6} more</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">Ready to create</span>
          <div className="flex items-center space-x-2">
            <span className="text-green-600 dark:text-green-400 midnight:text-green-400 font-medium">All set!</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Reset state when modal closes
  const resetState = () => {
    setCurrentStep(0);
    setEnableDueDate(false);
    setProjectData({
      name: "",
      description: "",
      due_date: "",
      members: [],
      is_archived: false,
      starred: false,
      enabled_views: ALL_AVAILABLE_VIEWS
    });
    setSelectedViewPreferences([...ALL_AVAILABLE_VIEWS]);
    setError(null);
    setLoading(false);
  };

  // Effects
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);



  // Project creation
  const handleCreate = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!currentWorkspace?.id) {
        setError("No workspace selected. Please select a workspace first.");
        return;
      }

      const formattedData = {
        name: projectData.name,
        description: projectData.description,
        due_date: projectData.due_date ? new Date(projectData.due_date).toISOString() : null,
        team_id: currentWorkspace.id,
        members: [],
        is_archived: false,
        starred: false,
        enabled_views: ALL_AVAILABLE_VIEWS
      };

      const result = await projectApi.createProject(formattedData);

      if (result && result.data) {
        if (selectedViewPreferences.length > 0) {
          try {
            await projectViewsApi.updateUserViewPreferences(result.data.id, selectedViewPreferences);
          } catch (prefError) {
            console.warn('Failed to set initial view preferences:', prefError);
          }
        }

        // Ensure owner information is included for immediate access control
        const projectWithRole = {
          ...result.data,
          user_role: 'owner',
          owner_id: session?.user?.id || result.data.owner_id,
          user_view_preferences: selectedViewPreferences
        };

        // Dispatch event to update project lists across the app
        eventBus.emit('projectsUpdated');

        onProjectCreate(projectWithRole);
        onClose();
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const hasOnlyOverview = () => false;

  const getAvailableViews = () => {
    return ALL_AVAILABLE_VIEWS;
  };

  const toggleView = (viewKey) => {
    setSelectedViewPreferences(prev => {
      const isSelected = prev.includes(viewKey);
      if (isSelected) {
        // Don't allow removing the last component
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter(v => v !== viewKey);
      } else {
        return [...prev, viewKey];
      }
    });
  };

  const getWorkspaceName = () => {
    if (!currentWorkspace) return "No workspace";
    return currentWorkspace.is_personal ? "Personal Workspace" : currentWorkspace.name;
  };

  if (!isOpen) return null;



  // Define the steps
  const steps = [
    {
      id: 'basics',
      title: 'Project Details',
      content: (
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-8">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">Project Details</h2>
                <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 text-lg">
                  Creating a new project in {getWorkspaceName()}
                </p>
              </div>

              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectData.name}
                    onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                    placeholder="Give your project a name"
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none text-lg font-medium"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">
                    Description
                  </label>
                  <textarea
                    value={projectData.description}
                    onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                    placeholder="What do you want to accomplish?"
                    rows={4}
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-600 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none resize-none"
                  />
                </div>

                <div className="p-6 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100">Set a deadline</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mt-1">
                        {enableDueDate ? "Great! Your future self will thank you" : "Live dangerously without a deadline"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEnableDueDate(!enableDueDate);
                        if (!enableDueDate) {
                          setProjectData({ ...projectData, due_date: "" });
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        enableDueDate ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          enableDueDate ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {enableDueDate && (
                    <input
                      type="date"
                      min={today}
                      value={projectData.due_date}
                      onChange={(e) => setProjectData({ ...projectData, due_date: e.target.value })}
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-xl text-gray-900 dark:text-white midnight:text-gray-100 focus:border-blue-500 dark:focus:border-blue-400 midnight:focus:border-blue-400 focus:outline-none"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="lg:sticky lg:top-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">Live Preview</h3>
                  <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-6">
                    See how your project will look and feel
                  </p>
                </div>
                <EnhancedProjectPreview />
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'customize',
      title: 'Choose Components',
      content: (
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-3">Choose Your Components</h2>
            <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 text-lg">
              Select which tools you want quick access to in your navigation
            </p>
          </div>

          {/* Teasing Message for minimal selection */}
          <TeasingMessage />

          {/* Component Categories */}
          {['Core', 'Views', 'Content', 'Tools'].map(category => {
            const categoryViews = getAvailableViews().filter(viewKey => 
              allViewsConfig[viewKey].category === category
            );
            
            if (categoryViews.length === 0) return null;

            return (
              <div key={category} className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-gray-100 flex items-center space-x-2">
                  <span>{category} Components</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                    ({categoryViews.filter(viewKey => selectedViewPreferences.includes(viewKey)).length}/{categoryViews.length})
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryViews.map(viewKey => {
                    const config = allViewsConfig[viewKey];
                    const isSelected = selectedViewPreferences.includes(viewKey);
                    
                    return (
                      <ComponentCard
                        key={viewKey}
                        viewKey={viewKey}
                        config={config}
                        isSelected={isSelected}
                        onToggle={toggleView}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  
  const canProceed = () => {
    if (currentStep === 0) {
      return projectData.name.trim() && projectData.description.trim();
    }
    if (currentStep === 1) return selectedViewPreferences.length > 0;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 z-[100] overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white/80 dark:bg-gray-900/80 midnight:bg-gray-950/80 backdrop-blur-sm z-10">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center space-x-6">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-white midnight:hover:text-gray-100 transition-colors duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
            )}
            <div className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
              Step {currentStep + 1} of {steps.length}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-6">
        <div className="w-full">
          {error && (
            <div className="mb-8 max-w-md mx-auto p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-900 rounded-xl">
              <p className="text-red-600 dark:text-red-400 midnight:text-red-400 text-center">{error}</p>
            </div>
          )}

          {currentStepData?.content}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="sticky bottom-0 bg-white/80 dark:bg-gray-900/80 midnight:bg-gray-950/80 backdrop-blur-sm">
        <div className="flex justify-end p-6">
            <button
              onClick={isLastStep ? handleCreate : () => {
                if (canProceed()) {
                  setCurrentStep(currentStep + 1);
                }
              }}
              disabled={!canProceed() || loading}
              className="px-8 py-3 bg-gray-900 dark:bg-white midnight:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-800 rounded-xl hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating project...</span>
                </div>
              ) : isLastStep ? (
                <div className="flex items-center space-x-2">
                  <Plus className="w-5 h-5" />
                  <span>Create Project</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectFlow;