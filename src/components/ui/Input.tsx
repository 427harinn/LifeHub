import type { InputHTMLAttributes } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onChange: (value: string) => void;
};

export function Input({ className = "", onChange, ...props }: InputProps) {
  return (
    <input
      className={`input ${className}`.trim()}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    />
  );
}
