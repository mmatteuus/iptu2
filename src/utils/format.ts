const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2
});

export const formatCurrency = (value: number) => currencyFormatter.format(value ?? 0);

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export const formatDate = (value: string) => {
  if (!value) return "";
  try {
    return dateFormatter.format(new Date(value));
  } catch (error) {
    return value;
  }
};

export const formatCpfCnpj = (digits: string | number) => {
  const raw = typeof digits === "number" ? digits.toString() : digits ?? "";
  const onlyDigits = raw.replace(/\D/g, "");
  if (onlyDigits.length <= 11) {
    const [p0, p1, p2, p3] = [
      onlyDigits.slice(0, 3),
      onlyDigits.slice(3, 6),
      onlyDigits.slice(6, 9),
      onlyDigits.slice(9, 11)
    ];
    return [p0, p1, p2].filter(Boolean).join(".") + (p3 ? `-${p3}` : "");
  }
  const [p0, p1, p2, p3, p4] = [
    onlyDigits.slice(0, 2),
    onlyDigits.slice(2, 5),
    onlyDigits.slice(5, 8),
    onlyDigits.slice(8, 12),
    onlyDigits.slice(12, 14)
  ];
  return [p0, p1, p2].filter(Boolean).join(".") + (p3 ? `/${p3}` : "") + (p4 ? `-${p4}` : "");
};
