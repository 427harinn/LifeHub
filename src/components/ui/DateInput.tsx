import { Input } from "./Input";

type DateInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
};

/** HouseToDo-aligned direct date input. Keep the native control at 16px+ for iPhone Safari. */
export function DateInput({ id, label, value, onChange, min }: DateInputProps) {
  return (
    <label className="date-input" htmlFor={id}>
      <span>{label}</span>
      <Input id={id} min={min} onChange={onChange} type="date" value={value} />
    </label>
  );
}
