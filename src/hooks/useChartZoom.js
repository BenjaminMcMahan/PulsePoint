import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Cross-platform (mouse + touch) drag-to-zoom for recharts.
 * Touch listeners are registered as non-passive so preventDefault works on Android.
 */
export function useChartZoom(dataMin, dataMax) {
  const [zoomDomain, setZoomDomain] = useState(null);
  const [selectRange, setSelectRange] = useState(null); // { x1, x2 }
  const selectStartRef = useRef(null);
  const containerRef = useRef(null);
  const dataMinRef = useRef(dataMin);
  const dataMaxRef = useRef(dataMax);

  // Keep refs in sync so touch callbacks (registered once) always see latest values
  useEffect(() => { dataMinRef.current = dataMin; }, [dataMin]);
  useEffect(() => { dataMaxRef.current = dataMax; }, [dataMax]);

  // Convert a pixel X position to a data value
  const pixelToValue = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const MARGIN_LEFT = 30;
    const MARGIN_RIGHT = 10;
    const plotWidth = rect.width - MARGIN_LEFT - MARGIN_RIGHT;
    const relX = clientX - rect.left - MARGIN_LEFT;
    const clamped = Math.max(0, Math.min(relX, plotWidth));
    const frac = clamped / plotWidth;
    const min = dataMinRef.current ?? 0;
    const max = dataMaxRef.current ?? 1;
    return min + frac * (max - min);
  }, []);

  // Register touch listeners as non-passive so we can call preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const val = pixelToValue(e.touches[0].clientX);
      if (val == null) return;
      selectStartRef.current = val;
      setSelectRange(null);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length !== 1 || selectStartRef.current == null) return;
      const val = pixelToValue(e.touches[0].clientX);
      if (val == null) return;
      const diff = Math.abs(val - selectStartRef.current);
      if (diff > 3) {
        e.preventDefault(); // works because listener is non-passive
        setSelectRange({
          x1: Math.min(selectStartRef.current, val),
          x2: Math.max(selectStartRef.current, val),
        });
      }
    };

    const handleTouchEnd = (e) => {
      if (selectStartRef.current == null) return;
      const lastTouch = e.changedTouches[0];
      const val = pixelToValue(lastTouch.clientX);
      if (val != null && Math.abs(val - selectStartRef.current) > 5) {
        setZoomDomain({
          x1: Math.min(selectStartRef.current, val),
          x2: Math.max(selectStartRef.current, val),
        });
      }
      selectStartRef.current = null;
      setSelectRange(null);
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false }); // non-passive!
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pixelToValue]);

  // Mouse events (recharts synthetic events)
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

  const resetZoom = useCallback(() => {
    setZoomDomain(null);
    setSelectRange(null);
    selectStartRef.current = null;
  }, []);

  const isSelecting = selectRange != null;

  const chartProps = { onMouseDown, onMouseMove, onMouseUp };

  // Only ref needed on wrapper — touch listeners attached imperatively
  const wrapperProps = {
    ref: containerRef,
    style: { touchAction: "pan-y" }, // browser handles scroll by default; preventDefault overrides when dragging
  };

  return { zoomDomain, resetZoom, isSelecting, selectRange, chartProps, wrapperProps };
}