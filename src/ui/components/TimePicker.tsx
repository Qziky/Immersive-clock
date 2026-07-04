import styles from "./primitives.module.css";

export interface TimePickerValue {
  hours: string;
  minutes: string;
  seconds: string;
}

export interface TimePickerProps {
  value: TimePickerValue;
  onChange: (value: TimePickerValue) => void;
  label?: string;
}

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteSecondOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function TimePicker({ value, onChange, label = "时间选择" }: TimePickerProps) {
  const updateValue = (key: keyof TimePickerValue, nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className={styles.timePicker} role="group" aria-label={label}>
      <select
        className={styles.select}
        value={value.hours}
        aria-label="小时"
        onChange={(event) => updateValue("hours", event.target.value)}
      >
        {hourOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.minutes}
        aria-label="分钟"
        onChange={(event) => updateValue("minutes", event.target.value)}
      >
        {minuteSecondOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={value.seconds}
        aria-label="秒"
        onChange={(event) => updateValue("seconds", event.target.value)}
      >
        {minuteSecondOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
