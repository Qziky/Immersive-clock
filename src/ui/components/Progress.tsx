import styles from "./primitives.module.css";

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
}

export function Progress({ value, max = 100, label = "进度" }: ProgressProps) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={styles.progressBar} style={{ width: `${percent}%` }} />
    </div>
  );
}
