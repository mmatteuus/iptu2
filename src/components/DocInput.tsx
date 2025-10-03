import { ChangeEvent } from "react";

type DocInputProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  descriptionId?: string;
};

const formatCpf = (digits: string) => {
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
  const [p0, p1, p2, p3] = parts;
  let formatted = p0;
  if (p1) formatted += `.${p1}`;
  if (p2) formatted += `.${p2}`;
  if (p3) formatted += `-${p3}`;
  return formatted;
};

const formatCnpj = (digits: string) => {
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 8),
    digits.slice(8, 12),
    digits.slice(12, 14)
  ];
  const [p0, p1, p2, p3, p4] = parts;
  let formatted = p0;
  if (p1) formatted += `.${p1}`;
  if (p2) formatted += `.${p2}`;
  if (p3) formatted += `/${p3}`;
  if (p4) formatted += `-${p4}`;
  return formatted;
};

const formatDocument = (digits: string) => {
  if (!digits) return "";
  return digits.length <= 11 ? formatCpf(digits) : formatCnpj(digits);
};

const DocInput = ({ id = "cpfCnpj", label, value, onChange, onBlur, error, descriptionId }: DocInputProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 14);
    onChange(digits);
  };

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={`form-control${error ? " is-invalid" : ""}`}
        value={formatDocument(value)}
        onChange={handleChange}
        onBlur={onBlur}
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        placeholder="000.000.000-00"
      />
      {error ? <div className="invalid-feedback">{error}</div> : null}
    </div>
  );
};

export default DocInput;
