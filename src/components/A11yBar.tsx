import contrastIcon from "../assets/icons/contrast.svg";
import fontPlusIcon from "../assets/icons/font-plus.svg";
import fontMinusIcon from "../assets/icons/font-minus.svg";
import { useAppContext } from "../context/AppContext";

const A11yBar = () => {
  const { updateFontScale, resetFontScale, fontScale, highContrast, toggleHighContrast } = useAppContext();

  return (
    <div className="bg-light border-bottom">
      <div
        className="container d-flex flex-wrap align-items-center justify-content-end gap-2 py-2"
        role="region"
        aria-label="Ferramentas de acessibilidade"
      >
        <span className="text-muted small me-2" aria-hidden="true">{`Fonte ${(fontScale * 100).toFixed(0)}%`}</span>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => updateFontScale(0.1)}
          aria-label="Aumentar fonte"
        >
          <img src={fontPlusIcon} alt="" width={16} height={16} className="me-1" />A+
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={resetFontScale}
          aria-label="Tamanho padrao da fonte"
        >
          A
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => updateFontScale(-0.1)}
          aria-label="Diminuir fonte"
        >
          <img src={fontMinusIcon} alt="" width={16} height={16} className="me-1" />A-
        </button>
        <button
          type="button"
          className={`btn btn-sm ${highContrast ? "btn-dark" : "btn-outline-secondary"}`}
          onClick={toggleHighContrast}
          aria-pressed={highContrast}
          aria-label="Alternar alto contraste"
        >
          <img src={contrastIcon} alt="" width={16} height={16} className="me-1" />Alto contraste
        </button>
      </div>
    </div>
  );
};

export default A11yBar;
