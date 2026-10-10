import type { AppMode } from "../types";

export type OledScreenReadoutMode = Exclude<AppMode, "exam">;

export interface OledScreenReadout {
  mode: OledScreenReadoutMode;
  value: string;
  status?: "已暂停" | "未开始" | "时间到";
}

type Listener = () => void;

let snapshot: OledScreenReadout | null = null;
const listeners = new Set<Listener>();

export function getOledScreenReadout(): OledScreenReadout | null {
  return snapshot;
}

export function subscribeOledScreenReadout(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishOledScreenReadout(next: OledScreenReadout): void {
  if (
    snapshot?.mode === next.mode &&
    snapshot.value === next.value &&
    snapshot.status === next.status
  ) {
    return;
  }

  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function clearOledScreenReadout(mode: OledScreenReadoutMode): void {
  if (!snapshot || snapshot.mode !== mode) return;
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export function resetOledScreenReadoutForTests(): void {
  snapshot = null;
  listeners.clear();
}
