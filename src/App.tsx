import { Navigate, Route, Routes, NavLink } from "react-router-dom";
import A11yBar from "./components/A11yBar";
import WhatsAppFloat from "./components/WhatsAppFloat";
import { AppProvider } from "./context/AppContext";
import PesquisaPage from "./pages/PesquisaPage";
import SimulacaoPage from "./pages/SimulacaoPage";

const assinaturaLink = import.meta.env.VITE_WHATSAPP_ASSINATURA_URL ?? "https://wa.me/5563999999999";

const App = () => {
  return (
    <AppProvider>
      <div className="d-flex flex-column min-vh-100 bg-body-secondary">
        <A11yBar />
        <header className="bg-white border-bottom shadow-sm">
          <div className="container py-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <h1 className="h4 mb-0">IPTU Araguaina</h1>
              <p className="mb-0 text-muted small">Consulta e simulacao integradas ao SIG</p>
            </div>
            <nav aria-label="Principal">
              <ul className="nav nav-pills gap-2">
                <li className="nav-item">
                  <NavLink to="/pesquisa" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                    Pesquisa
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/simulacao" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                    Simulacao
                  </NavLink>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <div className="flex-grow-1">
          <Routes>
            <Route path="/" element={<Navigate to="/pesquisa" replace />} />
            <Route path="/pesquisa" element={<PesquisaPage />} />
            <Route path="/simulacao" element={<SimulacaoPage />} />
            <Route path="*" element={<Navigate to="/pesquisa" replace />} />
          </Routes>
        </div>
        <footer className="bg-dark text-white py-3 mt-auto">
          <div className="container d-flex flex-wrap justify-content-between align-items-center gap-2">
            <small>Aviso: a simulacao exibe ate 48 parcelas retornadas pela API oficial.</small>
            <a href={assinaturaLink} className="text-white text-decoration-none" target="_blank" rel="noreferrer noopener">
              Desenvolvido por MtsFerreira
            </a>
          </div>
        </footer>
        <WhatsAppFloat />
      </div>
    </AppProvider>
  );
};

export default App;
