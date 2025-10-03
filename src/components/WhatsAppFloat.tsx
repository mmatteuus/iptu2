const PREFEITURA_WHATSAPP = import.meta.env.VITE_WHATSAPP_PREFEITURA_URL ?? "https://wa.me/5563999999999";

const WhatsAppFloat = () => {
  return (
    <a
      href={PREFEITURA_WHATSAPP}
      className="position-fixed bottom-0 end-0 m-3 btn btn-success rounded-circle shadow"
      style={{ width: "3.5rem", height: "3.5rem" }}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Fale com a Prefeitura pelo WhatsApp"
    >
      <span className="visually-hidden">WhatsApp Prefeitura</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16 3C9.383 3 4 8.383 4 15c0 2.3.654 4.445 1.781 6.266L4 29l7.953-1.742C13.664 28.02 14.809 28 16 28c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.07 0-2.105-.168-3.074-.48l-.547-.18-.563.123-4.016.879.852-3.867.123-.555-.297-.488C7.563 19.26 7 17.172 7 15c0-5.523 4.477-10 9-10zm-3.01 4c-.246 0-.637.09-.973.441-.336.352-1.277 1.246-1.277 3.04 0 1.793 1.309 3.531 1.492 3.777.184.246 2.508 4.008 6.199 5.465 3.059 1.205 3.68.965 4.34.902.66-.062 2.137-.871 2.441-1.742.305-.871.305-1.617.215-1.773-.09-.156-.336-.246-.703-.43-.367-.184-2.137-1.055-2.469-1.176-.332-.121-.574-.184-.813.184-.242.367-.934 1.176-1.145 1.422-.211.246-.422.277-.789.094-.367-.184-1.555-.574-2.965-1.829-1.096-.977-1.836-2.184-2.047-2.551-.211-.367-.023-.567.16-.75.164-.163.367-.43.55-.645.184-.215.246-.367.367-.613.121-.246.059-.461-.027-.645-.09-.184-.805-1.941-1.152-2.656-.301-.613-.61-.629-.856-.633z"
        />
      </svg>
    </a>
  );
};

export default WhatsAppFloat;
