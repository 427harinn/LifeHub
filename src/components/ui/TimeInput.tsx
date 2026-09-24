import { Input } from "./Input";

type TimeInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

/** Direct native time input with the same resilient label/control row as DateInput. */
export function TimeInput({ id, label, value, onChange, required = false }: TimeInputProps) {
  return (
    <label className="time-input" htmlFor={id}>
      <span>{label}</span>
      <span className="native-input-row__control"><Input id={id} onChange={onChange} required={required} type="time" value={value} /></span>
    </label>
  );
}
