import React, { useState, useEffect } from "react";
import { ArrowLeft, Camera, FileText, Loader2 } from "lucide-react";
import { dbSelect } from "../lib/api";

const BRAND = "#9E191B";
const ESTATUS_LABEL = { borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada", rechazada: "Rechazada" };
const ESTATUS_COLOR = { borrador: "#9C9585", enviada: "#B08A3E", aprobada: "#3F7268", rechazada: "#B5482F" };

export default function Ordenes({ session, onBack, onNavegar }) {
  const { accessToken, profile, cliente } = session;
  const esCliente = profile.rol === "cliente";

  const [trabajos, setTrabajos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const query = esCliente
          ? `select=*,cotizaciones(estatus,created_at)&cliente_id=eq.${cliente?.id}&order=created_at.desc&cotizaciones.order=created_at.desc&cotizaciones.limit=1`
          : "select=*,clientes(nombre)&order=created_at.desc";
        const ts = await dbSelect(accessToken, "trabajos", query);
        setTrabajos(ts);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{esCliente ? "Mis órdenes" : "Órdenes de trabajo"}</span>
      </div>

      {error && (
        <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : trabajos.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9C9585" }}>Aún no hay órdenes de trabajo.</div>
      ) : (
        trabajos.map((t) => {
          const cot = t.cotizaciones?.[0];
          return (
            <div key={t.id} style={{ background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1C2A3E" }}>
                    {t.folio}
                  </div>
                  {!esCliente && (
                    <div style={{ fontSize: 12, color: "#6B6656", marginTop: 2 }}>{t.clientes?.nombre}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9C9585", marginTop: 2 }}>
                    {new Date(t.created_at).toLocaleDateString("es-MX")}
                  </div>
                </div>
                {esCliente && cliente?.ve_cotizaciones && cot && (
                  <span
                    style={{
                      fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 3, whiteSpace: "nowrap",
                      fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", color: "#fff",
                      background: ESTATUS_COLOR[cot.estatus] || "#9C9585",
                    }}
                  >
                    {ESTATUS_LABEL[cot.estatus] || cot.estatus}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid #F0EDE4" }}>
                <button onClick={() => onNavegar("reportes", { trabajoId: t.id })} style={linkBtnStyle}>
                  <Camera size={13} /> Reporte fotográfico
                </button>
                {(!esCliente || cliente?.ve_cotizaciones) && (
                  <button onClick={() => onNavegar("cotizaciones", { trabajoId: t.id })} style={linkBtnStyle}>
                    <FileText size={13} /> Cotización
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const linkBtnStyle = {
  display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #E4DFD2",
  borderRadius: 4, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, color: BRAND, cursor: "pointer",
};
