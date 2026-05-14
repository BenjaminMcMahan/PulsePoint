import { useState, useCallback } from "react";

export const ALL_WIDGETS = [
  { id: "stats",         label: "Summary Stats" },
  { id: "trend",         label: "Intensity & Satisfaction Trend" },
  { id: "hr_trend",      label: "Heart Rate Trend" },
  { id: "monthly",       label: "Monthly Averages" },
  { id: "methods",       label: "Method Usage" },
  { id: "physio",        label: "Physiological Patterns" },
  { id: "hr_perf",       label: "HR Performance Metrics" },
  { id: "events",        label: "Event Log Summary" },
  { id: "event_hr",      label: "Event-HR Correlation" },
  { id: "scatter",       label: "Intensity vs. Satisfaction" },
];

const STORAGE_KEY = "dashboard_widget_config";

const defaultConfig = () =>
  ALL_WIDGETS.map((w) => ({ id: w.id, visible: true }));

const loadConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    // Merge in any new widgets not yet in saved config
    const ids = new Set(parsed.map((w) => w.id));
    const merged = [...parsed];
    ALL_WIDGETS.forEach((w) => {
      if (!ids.has(w.id)) merged.push({ id: w.id, visible: true });
    });
    return merged;
  } catch {
    return defaultConfig();
  }
};

export function useDashboardWidgets() {
  const [config, setConfig] = useState(loadConfig);

  const save = useCallback((next) => {
    setConfig(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleWidget = useCallback((id) => {
    save(config.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }, [config, save]);

  const moveWidget = useCallback((fromIdx, toIdx) => {
    const next = [...config];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    save(next);
  }, [config, save]);

  const isVisible = useCallback((id) => {
    const w = config.find((c) => c.id === id);
    return w ? w.visible : true;
  }, [config]);

  return { config, toggleWidget, moveWidget, isVisible };
}