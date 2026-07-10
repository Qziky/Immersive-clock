import type { ReactNode } from "react";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";

export type OverlayLayerType = "modal" | "floating";

interface OverlayLayer {
  id: string;
  order: number;
  parentId: string | null;
  type: OverlayLayerType;
}

interface BackgroundState {
  ariaHidden: string | null;
  inert: boolean;
}

const layers: OverlayLayer[] = [];
const listeners = new Set<() => void>();
const backgroundStates = new Map<HTMLElement, BackgroundState>();
const OverlayParentContext = createContext<string | null>(null);
let nextLayerOrder = 0;
let stackVersion = 0;

function emitStackChange() {
  stackVersion += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getStackVersion() {
  return stackVersion;
}

function isPortalRoot(element: Element) {
  return element.hasAttribute("data-ui-overlay-root");
}

function disableBackground() {
  if (typeof document === "undefined" || backgroundStates.size > 0) return;

  Array.from(document.body.children).forEach((element) => {
    if (!(element instanceof HTMLElement) || isPortalRoot(element)) return;

    backgroundStates.set(element, {
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    });
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  });
}

function restoreBackground() {
  backgroundStates.forEach((state, element) => {
    element.inert = state.inert;

    if (state.ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", state.ariaHidden);
    }
  });
  backgroundStates.clear();
}

function registerLayer(id: string, type: OverlayLayerType, parentId: string | null) {
  const existingIndex = layers.findIndex((layer) => layer.id === id);
  if (existingIndex >= 0) layers.splice(existingIndex, 1);

  layers.push({ id, order: nextLayerOrder, parentId, type });
  nextLayerOrder += 1;

  if (type === "modal" && layers.filter((item) => item.type === "modal").length === 1) {
    disableBackground();
  }

  emitStackChange();
}

function unregisterLayer(id: string) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index >= 0) layers.splice(index, 1);

  if (!layers.some((layer) => layer.type === "modal")) restoreBackground();
  if (layers.length === 0) nextLayerOrder = 0;
  emitStackChange();
}

function getLayerPath(layer: OverlayLayer) {
  const path = [layer.order];
  const visited = new Set([layer.id]);
  let parentId = layer.parentId;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = layers.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    path.unshift(parent.order);
    parentId = parent.parentId;
  }

  return path;
}

function compareLayers(first: OverlayLayer, second: OverlayLayer) {
  const firstPath = getLayerPath(first);
  const secondPath = getLayerPath(second);
  const sharedLength = Math.min(firstPath.length, secondPath.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (firstPath[index] !== secondPath[index]) return firstPath[index] - secondPath[index];
  }

  return firstPath.length - secondPath.length;
}

export function isTopOverlay(id: string) {
  const sortedLayers = [...layers].sort(compareLayers);
  return sortedLayers[sortedLayers.length - 1]?.id === id;
}

function isTopModalOverlay(id: string) {
  const sortedModalLayers = layers.filter((layer) => layer.type === "modal").sort(compareLayers);
  return sortedModalLayers[sortedModalLayers.length - 1]?.id === id;
}

function getOverlayZIndex(id: string) {
  const sortedLayers = [...layers].sort(compareLayers);
  const index = sortedLayers.findIndex((layer) => layer.id === id);
  return index < 0 ? 2000 : 2000 + index * 2;
}

export function OverlayLayerBoundary({
  layerId,
  children,
}: {
  layerId: string;
  children: ReactNode;
}) {
  return createElement(OverlayParentContext.Provider, { value: layerId }, children);
}

interface UseOverlayLayerOptions {
  active: boolean;
  type: OverlayLayerType;
}

export function useOverlayLayer({ active, type }: UseOverlayLayerOptions) {
  const parentId = useContext(OverlayParentContext);
  const id = useId();
  useSyncExternalStore(subscribe, getStackVersion, getStackVersion);
  const isTop = useCallback(() => isTopOverlay(id), [id]);
  const isRegistered = layers.some((layer) => layer.id === id);
  const isTopModal = active && type === "modal" && (!isRegistered || isTopModalOverlay(id));

  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    registerLayer(id, type, parentId);
    return () => unregisterLayer(id);
  }, [active, id, parentId, type]);

  return { id, isTop, isTopModal, zIndex: getOverlayZIndex(id) };
}
