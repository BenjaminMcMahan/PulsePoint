import { useState, useRef, useCallback } from "react";

/**
 * Cross-platform (mouse + touch) drag-to-zoom for recharts.
 * Uses a callback ref so touch listeners (non-passive) are attached
 * as soon as the wrapper div mounts.
 */
export function useChartZoom(dataMin, dataMax) {
  const [zoomDomain, setZoomDomain] = useState(null);
  const [selectRange, setSelectRange] = useState(null); // { x1, x2 }
  const selectStartRef = useRef(null);
  const containerRef = useRef(null);
  const dataMinRef = useRef(dataMin);
  const dataMaxRef = useRef(dataMax);
  dataMinRef.current = dataMin;
  dataMaxRef.current = dataMax;

  // Convert pixel X → data value
  const pixelToValue = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const MARGIN_LEFT = 30;
    const MARGIN_RIGHT = 10;
    const plotWidth = rect.width - MARGIN_LEFT - MARGIN_RIGHT;
    const relX = clientX - rect.left - MARGIN_LEFT;
    const clamped = Math.max(0, Math.min(relX, plotWidth));
    return dataMinRef.current + (clamped / plotWidth) * (dataMaxRef.current - dataMinRef.current);
  }, []);

  // Callback ref — attaches non-passive touch listeners immediately when element mounts
  const setContainerRef = useCallback((el) => {
    if (containerRef.current) {
      containerRef.current.removeEventListener("touchstart", handleTouchStart);
      containerRef.current.removeEventListener("touchmove", handleTouchMove);
      containerRef.current.removeEventListener("touchend", handleTouchEnd);
    }
    containerRef.current = el;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
  }, []); // eslint-disable-line

  function handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const val = pixelToValue(e.touches[0].clientX);
    if (val == null) return;
    selectStartRef.current = val;
    setSelectRange(null);
  }

  function handleTouchMove(e) {
    if (e.touches.length !== 1 || selectStartRef.current == null) return;
    const val = pixelToValue(e.touches[0].clientX);
    if (val == null) return;
    if (Math.abs(val - selectStartRef.current) > 2) {
      e.preventDefault(); // non-passive — this actually works on Android
      setSelectRange({
        x1: Math.min(selectStartRef.current, val),
        x2: Math.max(selectStartRef.current, val),
      });
    }
  }

  function handleTouchEnd(e) {
    if (selectStartRef.current == null) return;
    const val = pixelToValue(e.changedTouches[0].clientX);
    if (val != null && Math.abs(val - selectStartRef.current) > 5) {
      setZoomDomain({
        x1: Math.min(selectStartRef.current, val),
        x2: Math.max(selectStartRef.current, val),
      });
    }
    selectStartRef.current = null;
    setSelectRange(null);
  }

  // Global mouseup — fires even if mouse is released outside the chart
  const onMouseDown = useCallback((e) => {
    if (e?.activeLabel == null) return;
    selectStartRef.current = Number(e.activeLabel);
    setSelectRange(null);

    const handleGlobalMouseUp = (nativeE) => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (selectStartRef.current == null) return;
      const end = pixelToValue(nativeE.clientX);
      if (end != null && Math.abs(end - selectStartRef.current) > 3) {
        setZoomDomain({ x1: Math.min(selectStartRef.current, end), x2: Math.max(selectStartRef.current, end) });
      }
      selectStartRef.current = null;
      setSelectRange(null);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
  }, [pixelToValue]);

  const onMouseMove = useCallback((e) => {
    if (selectStartRef.current == null || e?.activeLabel == null) return;
    const cur = Number(e.activeLabel);
    setSelectRange({ x1: Math.min(selectStartRef.current, cur), x2: Math.max(selectStartRef.current, cur) });
  }, []);

  const onMouseUp = useCallback((e) => {
    if (selectStartRef.current == null) return;
    // Try recharts activeLabel first, fall back to pixel conversion
    let end = e?.activeLabel != null ? Number(e.activeLabel) : null;
    if (end == null && e?.clientX != null) end = pixelToValue(e.clientX);
    if (end != null && Math.abs(end - selectStartRef.current) > 3) {
      setZoomDomain({ x1: Math.min(selectStartRef.current, end), x2: Math.max(selectStartRef.current, end) });
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

  const chartProps = { onMouseDown, onMouseMove, onMouseUp };

  const wrapperProps = {
    ref: setContainerRef,
    style: { touchAction: "pan-y" },
  };

  return { zoomDomain, resetZoom, isSelecting, selectRange, chartProps, wrapperProps };
}