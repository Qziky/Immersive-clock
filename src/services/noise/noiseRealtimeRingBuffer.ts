import type { NoiseRealtimePoint } from "../../types/noise";

export type { NoiseRealtimePoint } from "../../types/noise";

export interface NoiseRealtimeRingBuffer {
  push: (point: NoiseRealtimePoint) => void;
  snapshot: () => NoiseRealtimePoint[];
  clear: () => void;
}

export function createNoiseRealtimeRingBuffer(params: {
  retentionMs: number;
  capacity: number;
}): NoiseRealtimeRingBuffer {
  const retentionMs = Math.max(1, Math.round(params.retentionMs));
  const capacity = Math.max(16, Math.round(params.capacity));
  const data: NoiseRealtimePoint[] = new Array(capacity);
  let start = 0;
  let length = 0;

  const prune = (cutoffTs: number) => {
    while (length > 0) {
      const first = data[start];
      if (!first || first.t >= cutoffTs) break;
      start = (start + 1) % capacity;
      length -= 1;
    }
  };

  const push = (point: NoiseRealtimePoint) => {
    prune(point.t - retentionMs);
    const index = (start + length) % capacity;
    if (length < capacity) {
      data[index] = point;
      length += 1;
      return;
    }
    data[start] = point;
    start = (start + 1) % capacity;
  };

  const snapshot = () => {
    const output: NoiseRealtimePoint[] = [];
    for (let index = 0; index < length; index += 1) {
      output.push(data[(start + index) % capacity]!);
    }
    return output;
  };

  const clear = () => {
    start = 0;
    length = 0;
  };

  return { push, snapshot, clear };
}
