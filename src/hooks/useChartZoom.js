import { useState, useRef, useCallback } from "react";

/**
 * Cross-platform (mouse + touch) drag-to-zoom for recharts.
 * 
 * Usage:
 *   const { zoomDomain, zoomProps, resetZoom, isSelecting, selectRange } = useChartZoom(dataMin, dataMax);
 * 
 * Spread `zoomProps` onto your recharts chart component.
 * Pass `zoomDomain` as the XAxis domain (when non-null).
 * Render a ReferenceArea using selectRange while isSelecting.
 */
export function useChartZoom(dataMin, dataMax) {
  const [zoomDomain, setZoomDomain] = useState(null);
  const [selectRange, setSelectRange] = useState(null); // { x1, x2 }
  const selectStartRef = useRef(null);
  const containerRef = useRef(null);

  // Convert a pixel X position (relative to the chart container) to a data value
  const pixelToValue = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Recharts left margin is roughly 10px (we use left: -20 offset but the actual plot area starts ~30px in)
    const MARGIN_LEFT = 30;
    const MARGIN_RIGHT = 10;
    const plotWidth = rect.width - MARGIN_LEFT - MARGIN_RIGHT;
    const relX = clientX - rect.left - MARGIN_LEFT;
    const clamped = Math.max(0, Math.min(relX, plotWidth));
    const frac = clamped / plotWidth;
    const min = dataMin ?? 0;
    const max = dataMax ?? 1;
    return min + frac * (max - min);
  }, [dataMin, dataMax]);

  // Mouse events
  const onMouseDown = useCallback((e) => {
    if (e?.activeLabel == null) return;
    selectStartRef.current = Number(e.activeLabel);
    setSelectRange(null);
  }, []);

  const onMouseMove = useCallback((e) => {
    if (selectStartRef.current == null || e?.activeLabel == null) return;
    const cur = Number(e.activeLabel);
    setSelectRange({ x1: Math.min(selectStartRef.current, cur), x2: Math.max(selectStartRef.current, cur) });
  }, []);

  const onMouseUp = useCallback((e) => {
    if (selectStartRef.current == null) return;
    const end = e?.activeLabel != null ? Number(e.activeLabel) : null;
    if (end != null && Math.abs(end - selectStartRef.current) > 3) {
      setZoomDomain({ x1: Math.min(selectStartRef.current, end), x2: Math.max(selectStartRef.current, end) });
    }
    selectStartRef.current = null;
    setSelectRange(null);
  }, []);

  // Touch events (attached directly to the container div, not recharts)
  const onTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const val = pixelToValue(e.touches[0].clientX);
    if (val == null) return;
    selectStartRef.current = val;
    setSelectRange(null);
  }, [pixelToValue]);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 1 || selectStartRef.current == null) return;
    const val = pixelToValue(e.touches[0].clientX);
    if (val == null) return;
    const x1 = Math.min(selectStartRef.current, val);
    const x2 = Math.max(selectStartRef.current, val);
    setSelectRange({ x1, x2 });
    // prevent page scroll while selecting
    if (Math.abs(val - selectStartRef.current) > 5) e.preventDefault();
  }, [pixelToValue]);

  const onTouchEnd = useCallback((e) => {
    if (selectStartRef.current == null) return;
    const lastTouch = e.changedTouches[0];
    const val = pixelToValue(lastTouch.clientX);
    if (val != null && Math.abs(val - selectStartRef.current) > 5) {
      setZoomDomain({ x1: Math.min(selectStartRef.current, val), x2: Math.max(selectStartRef.current, val) });
    }
    selectStartRef.current = null;
    setSelectRange(null);
  }, [pixelToValue]);

  const resetZoom = useCallback(() => {
    setZoomDomain(null);
    setSelectRange(null);
    selectStartRef.current = null;
  }, []);

  const isSelecting = selectRange != null;

  // recharts chart props (mouse only — touch is on the wrapper div)
  const chartProps = { onMouseDown, onMouseMove, onMouseUp };

  // wrapper div props (touch)
  const wrapperProps = {
    ref: containerRef,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    style: { touchAction: isSelecting ? "none" : "pan-y" },
  };

  return { zoomDomain, resetZoom, isSelecting, selectRange, chartProps, wrapperProps };
}