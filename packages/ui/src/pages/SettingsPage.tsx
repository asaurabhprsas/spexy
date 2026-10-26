import React, { useState } from 'react';
import { useWorkflowUiStore, type ColorMode, type EditorViewMode, type StorageTarget } from '@/store/ui';
import { POPULAR_THEMES, POPULAR_FONTS, type ThemeConfig, type FontConfig } from '@/lib/themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Palette,
  Type,
  Sliders,
  FolderGit2,
  Check,
  Sun,
  Moon,
  Laptop,
  Maximize2,
  FileCode,
  Columns,
  Eye,
  RotateCcw,
  Database,
  RefreshCw,
  Cloud,
} from 'lucide-react';

export function SettingsPage() {
  const {
    themeId,
    fontId,
    colorMode,
    compactMode,
    isInspectorFullWidth,
    editorViewMode,
    storageTarget,
    lastSyncedAt,
    setThemeId,
    setFontId,
    setColorMode,
    setCompactMode,
    setInspectorFullWidth,
    setEditorViewMode,
    setStorageTarget,
    updatePreferences,
    syncToProjectRepo,
    syncFromProjectRepo,
  } = useWorkflowUiStore();

  const [activeTab, setActiveTab] = useState<'appearance' | 'workflow' | 'workspace'>('appearance');
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const activeTheme = POPULAR_THEMES.find((t) => t.id === themeId) || POPULAR_THEMES[0];
  const activeFont = POPULAR_FONTS.find((f) => f.id === fontId) || POPULAR_FONTS[0];

  const handleSelectStorageTarget = (target: StorageTarget) => {
    if (target === storageTarget) return;
    setStorageTarget(target);
    if (target === 'repo') {
      toast({
        title: 'Storage Target: Project Repo',
        description: 'Switched to Project Repository (.spexy/config.json). Changes will sync to repo.',
      });
    } else {
      toast({
        title: 'Storage Target: Browser Local',
        description: 'Switched to Browser Local (localStorage). Changes are kept local.',
      });
    }
  };

  const handleSyncToLocal = async () => {
    setIsPulling(true);
    try {
      const res = await syncFromProjectRepo();
      if (res.success) {
        toast({
          title: 'Synced to Browser',
          description: 'Successfully pulled latest preferences from project repository (.spexy/config.json).',
        });
      } else {
        toast({
          title: 'Sync Failed',
          description: res.error || 'Failed to pull preferences from repository.',
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Sync Error',
        description: msg || 'Unexpected network error during pull.',
        variant: 'destructive',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const handleSyncToRepo = async () => {
    setIsPushing(true);
    try {
      const res = await syncToProjectRepo();
      if (res.success) {
        toast({
          title: 'Synced to Project Repo',
          description: 'Current browser preferences saved to .spexy/config.json.',
        });
      } else {
        toast({
          title: 'Sync Failed',
          description: res.error || 'Failed to push preferences to repository.',
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Sync Error',
        description: msg || 'Unexpected network error during push.',
        variant: 'destructive',
      });
    } finally {
      setIsPushing(false);
    }
  };

  const handleResetDefaults = () => {
    updatePreferences({
      themeId: 'default',
      fontId: 'default',
      colorMode: 'dark',
      compactMode: false,
      isInspectorFullWidth: false,
      editorViewMode: 'split',
      storageTarget: 'repo',
    });
    toast({
      title: 'Defaults Restored',
      description: 'Reset all appearance and workflow options to factory defaults.',
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-primary flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Sliders size={13} />
              <span>Workspace Preferences</span>
            </div>
            <span className="text-muted-foreground/60">•</span>
            {/* Visual Indicator of Active Configuration Source */}
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px] gap-1.5 py-0 px-2 h-5 tracking-normal uppercase transition-colors",
                storageTarget === 'repo'
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/30"
              )}
              data-testid="header-config-source-badge"
            >
              {storageTarget === 'repo' ? <Database size={11} className="shrink-0" /> : <Laptop size={11} className="shrink-0" />}
              <span>Config Source: {storageTarget === 'repo' ? 'Repo (.spexy/config.json)' : 'Browser (localStorage)'}</span>
            </Badge>
          </div>
          <h1 className="font-serif text-[28px] sm:text-[34px] font-semibold leading-tight tracking-[-.04em] text-foreground">
            Settings & Appearance
          </h1>
          <p className="mb-0 mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Customize developer themes, coding typography, token-saving compact modes, and workspace configuration storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs gap-1.5"
            data-testid="button-reset-settings"
          >
            <RotateCcw size={13} />
            Reset Defaults
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncToLocal}
            disabled={isPulling}
            className="text-xs gap-1.5"
            data-testid="button-sync-to-local"
            title="Pull configuration from .spexy/config.json to browser"
          >
            <RefreshCw size={13} className={isPulling ? "animate-spin" : ""} />
            {isPulling ? 'Pulling…' : 'Sync to Browser'}
          </Button>
          <Button
            size="sm"
            onClick={handleSyncToRepo}
            disabled={isPushing}
            className="text-xs gap-1.5 shadow-sm"
            data-testid="button-sync-to-repo"
            title="Push browser preferences to .spexy/config.json"
          >
            <Cloud size={13} className={isPushing ? "animate-pulse" : ""} />
            {isPushing ? 'Pushing…' : 'Sync to Project Repo'}
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'appearance' | 'workflow' | 'workspace')}
        className="space-y-6"
      >
        <TabsList className="bg-muted/80 p-1 border border-border/60">
          <TabsTrigger value="appearance" className="gap-2 text-xs">
            <Palette size={14} />
            Appearance & Themes
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-2 text-xs">
            <Sliders size={14} />
            Workflow & Editor
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-2 text-xs">
            <FolderGit2 size={14} />
            Workspace & Storage
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Appearance & Themes */}
        <TabsContent value="appearance" className="space-y-6">
          {/* Color Mode Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center justify-between">
                <span>Color Mode</span>
                <Badge variant="outline" className="text-[10px] font-mono capitalize">
                  Active: {colorMode}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Switch between high-contrast dark mode, clean daylight mode, or follow your OS setting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <Button
                  type="button"
                  variant={colorMode === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setColorMode('dark')}
                  className="flex items-center gap-2 justify-center text-xs h-10"
                  data-testid="mode-dark"
                >
                  <Moon size={14} />
                  Dark Mode
                </Button>
                <Button
                  type="button"
                  variant={colorMode === 'light' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setColorMode('light')}
                  className="flex items-center gap-2 justify-center text-xs h-10"
                  data-testid="mode-light"
                >
                  <Sun size={14} />
                  Light Mode
                </Button>
                <Button
                  type="button"
                  variant={colorMode === 'system' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setColorMode('system')}
                  className="flex items-center gap-2 justify-center text-xs h-10"
                  data-testid="mode-system"
                >
                  <Laptop size={14} />
                  System
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Theme Palette Cards */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Palette size={16} className="text-primary" />
                  Popular Theme Presets
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {activeTheme.name}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Select from carefully tuned developer themes with full light and dark contrast tokens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {POPULAR_THEMES.map((theme: ThemeConfig) => {
                  const isSelected = theme.id === themeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      data-testid={`theme-${theme.id}`}
                      className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-36 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30 bg-primary/5 shadow-sm'
                          : 'border-border/70 bg-card/60 hover:border-border hover:bg-card/90'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            {theme.name}
                          </span>
                          {isSelected && (
                            <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground text-[10px]">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {theme.description}
                        </p>
                      </div>

                      {/* Swatch Bar */}
                      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-4 rounded-full border border-black/10 shadow-2xs"
                            style={{ backgroundColor: theme.swatch.primary }}
                            title="Primary Accent"
                          />
                          <span
                            className="size-4 rounded-full border border-black/10 shadow-2xs"
                            style={{ backgroundColor: theme.swatch.background }}
                            title="Background"
                          />
                          <span
                            className="size-4 rounded-full border border-black/10 shadow-2xs"
                            style={{ backgroundColor: theme.swatch.accent }}
                            title="Secondary Accent"
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                          {theme.id}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Typography & Fonts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Type size={16} className="text-primary" />
                  Popular Typography & Fonts
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {activeFont.name}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Select your preferred reading and coding typography for specs and inspect panes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {POPULAR_FONTS.map((font: FontConfig) => {
                  const isSelected = font.id === fontId;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => setFontId(font.id)}
                      data-testid={`font-${font.id}`}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-36 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30 bg-primary/5 shadow-sm'
                          : 'border-border/70 bg-card/60 hover:border-border hover:bg-card/90'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-foreground">
                            {font.name}
                          </span>
                          {isSelected && (
                            <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground text-[10px]">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2 line-clamp-1">
                          {font.description}
                        </p>
                      </div>

                      {/* Font Preview Sample */}
                      <div
                        className="rounded-lg bg-muted/40 p-2 text-xs font-medium text-foreground truncate border border-border/40"
                        style={{ fontFamily: font.fontSans }}
                      >
                        Spexy Specification v2.4
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Workflow & Editor */}
        <TabsContent value="workflow" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif">Workflow Preferences</CardTitle>
              <CardDescription className="text-xs">
                Control inspector expansion, CLI compact output defaults, and editor layout.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Compact Mode Toggle */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/50">
                <div className="space-y-1">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <span>Token-Optimized Compact Mode</span>
                    <Badge variant="outline" className="text-[9px] font-mono text-amber-500 border-amber-500/30">
                      Token Killer
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-xl">
                    Strips markdown prose bodies and returns only essential metadata frontmatter to save up to 80% tokens for autonomous AI agents.
                  </p>
                </div>
                <Switch
                  checked={compactMode}
                  onCheckedChange={setCompactMode}
                  data-testid="switch-compact-mode"
                />
              </div>

              {/* Inspector Full-Width Default */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/50">
                <div className="space-y-1">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <Maximize2 size={13} className="text-primary" />
                    <span>Always Expand Document Inspector</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-xl">
                    Automatically expand the document inspector to edge-to-edge full screen width without requiring manual toggling.
                  </p>
                </div>
                <Switch
                  checked={isInspectorFullWidth}
                  onCheckedChange={setInspectorFullWidth}
                  data-testid="switch-inspector-fullwidth"
                />
              </div>

              {/* Default View Mode */}
              <div className="p-4 rounded-xl border border-border/70 bg-card/50 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold">Default Document Inspector View</div>
                  <p className="text-[11px] text-muted-foreground">
                    Choose how documents open by default in the Document Inspector.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2.5 max-w-md pt-1">
                  <Button
                    type="button"
                    variant={editorViewMode === 'split' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditorViewMode('split')}
                    className="gap-1.5 text-xs h-9"
                    data-testid="mode-split"
                  >
                    <Columns size={13} />
                    Split View
                  </Button>
                  <Button
                    type="button"
                    variant={editorViewMode === 'source' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditorViewMode('source')}
                    className="gap-1.5 text-xs h-9"
                    data-testid="mode-source"
                  >
                    <FileCode size={13} />
                    Source Mode
                  </Button>
                  <Button
                    type="button"
                    variant={editorViewMode === 'rendered' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditorViewMode('rendered')}
                    className="gap-1.5 text-xs h-9"
                    data-testid="mode-rendered"
                  >
                    <Eye size={13} />
                    Rendered
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Workspace & Storage */}
        <TabsContent value="workspace" className="space-y-6">
          {/* Storage Mode Selector */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <Database size={16} className="text-primary" />
                  <span>Configuration Storage Target</span>
                </CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px] gap-1.5 py-1 px-2.5 transition-colors",
                    storageTarget === 'repo'
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                  )}
                  data-testid="badge-active-storage-source"
                >
                  {storageTarget === 'repo' ? <Database size={12} className="shrink-0" /> : <Laptop size={12} className="shrink-0" />}
                  <span>
                    Config Source: {storageTarget === 'repo' ? 'Repo (.spexy/config.json)' : 'Browser (localStorage)'}
                  </span>
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Select where your workspace configuration and preferences are stored. Switch between sharing configuration across your repository or keeping it isolated to this local browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Option 1: Project Repository */}
                <button
                  type="button"
                  onClick={() => handleSelectStorageTarget('repo')}
                  data-testid="storage-target-repo"
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[140px]",
                    storageTarget === 'repo'
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-sm"
                      : "border-border/70 bg-card/60 hover:border-border hover:bg-card/90"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Database size={14} className="text-primary" />
                        Project Repository (`.spexy/config.json`)
                      </span>
                      {storageTarget === 'repo' && (
                        <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground text-[10px]">
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Persists configuration and preferences directly to <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">.spexy/config.json</code> in the project repository. Shared across sessions, CLI invocations, and team members via Git.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                    <span className="inline-block size-2 rounded-full bg-emerald-500" />
                    <span>Auto-syncs changes to /api/preferences</span>
                  </div>
                </button>

                {/* Option 2: Browser Local */}
                <button
                  type="button"
                  onClick={() => handleSelectStorageTarget('browser')}
                  data-testid="storage-target-browser"
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[140px]",
                    storageTarget === 'browser'
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-sm"
                      : "border-border/70 bg-card/60 hover:border-border hover:bg-card/90"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <Laptop size={14} className="text-amber-500" />
                        Browser Local (`localStorage`)
                      </span>
                      {storageTarget === 'browser' && (
                        <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground text-[10px]">
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Keeps all settings in this browser's <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">localStorage</code> only. Ideal for private developer customizations without modifying repository git files.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                    <span className="inline-block size-2 rounded-full bg-amber-500" />
                    <span>Isolated to this browser instance</span>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Bi-Directional Synchronization Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <RefreshCw size={16} className="text-primary" />
                  <span>Bi-Directional Sync Actions</span>
                </CardTitle>
                {lastSyncedAt && (
                  <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                    Last Synced: {new Date(lastSyncedAt).toLocaleTimeString()}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Explicitly synchronize configuration between your active browser store and the project repository.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pull from Repo */}
                <div className="p-4 rounded-xl border border-border/70 bg-card/50 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold flex items-center gap-2">
                      <RefreshCw size={14} className="text-primary" />
                      <span>Sync to Local / Browser</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Pulls the latest saved configuration from the project repository (<code className="font-mono text-[10px]">GET /api/preferences</code> or <code className="font-mono text-[10px]">/api/config</code>) and applies it to this browser.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncToLocal}
                    disabled={isPulling}
                    className="w-full text-xs gap-1.5"
                    data-testid="button-tab-sync-to-local"
                  >
                    <RefreshCw size={13} className={isPulling ? "animate-spin" : ""} />
                    {isPulling ? 'Pulling from Repo…' : 'Sync to Local / Browser'}
                  </Button>
                </div>

                {/* Push to Repo */}
                <div className="p-4 rounded-xl border border-border/70 bg-card/50 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold flex items-center gap-2">
                      <Cloud size={14} className="text-primary" />
                      <span>Sync to Project Repo</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Pushes your current browser preferences to the project repository (<code className="font-mono text-[10px]">PUT /api/preferences</code>) and writes to <code className="font-mono text-[10px]">.spexy/config.json</code>.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSyncToRepo}
                    disabled={isPushing}
                    className="w-full text-xs gap-1.5 shadow-sm"
                    data-testid="button-tab-sync-to-repo"
                  >
                    <Cloud size={13} className={isPushing ? "animate-pulse" : ""} />
                    {isPushing ? 'Pushing to Repo…' : 'Sync to Project Repo'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workspace Files Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <FolderGit2 size={16} className="text-primary" />
                <span>Workspace File Architecture</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Spexy operates with zero database dependencies. All configuration lives locally in standard text formats.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between text-muted-foreground pb-2 border-b border-border/50">
                  <span className="flex items-center gap-1.5">
                    <Database size={13} className="text-primary" />
                    <span>User Preferences & Layout</span>
                  </span>
                  <span className="text-foreground font-semibold">.spexy/config.json</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground pb-2 border-b border-border/50">
                  <span className="flex items-center gap-1.5">
                    <Sliders size={13} className="text-primary" />
                    <span>Project Governance & Server Config</span>
                  </span>
                  <span className="text-foreground font-semibold">.spexy/config.yaml</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground pb-2 border-b border-border/50">
                  <span className="flex items-center gap-1.5">
                    <FolderGit2 size={13} className="text-primary" />
                    <span>Specifications Directory</span>
                  </span>
                  <span className="text-foreground font-semibold">.spexy/specs/</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground pb-2 border-b border-border/50">
                  <span className="flex items-center gap-1.5">
                    <Check size={13} className="text-primary" />
                    <span>Steering Governance</span>
                  </span>
                  <span className="text-foreground font-semibold">.spexy/steering/</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FolderGit2 size={13} className="text-primary" />
                    <span>Archived Documents</span>
                  </span>
                  <span className="text-foreground font-semibold">.spexy/archived/</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
