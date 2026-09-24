import { Input } from "./Input";

type DateInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  compact?: boolean;
};

/** HouseToDo-aligned direct date input. Keep the native control at 16px+ for iPhone Safari. */
export function DateInput({ id, label, value, onChange, min, compact = false }: DateInputProps) {
  return (
    <label className={`date-input${compact ? " date-input--compact" : ""}`} htmlFor={id}>
      <span>{label}</span>
      <span className="native-input-row__control"><Input id={id} min={min} onChange={onChange} type="date" value={value} /></span>
    </label>
  );
}
