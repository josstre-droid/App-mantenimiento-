import React, { useRef, useState } from "react";
import { PenLine, Type } from "lucide-react";

const BRAND = "#9E191B";
const linkBtnStyle = {
  fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E",
  background: "none", border: "none", cursor: "pointer", padding: 0,
};
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const secondaryBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#1C2A3E", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };

function FirmaCanvas({ onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    hasStroke.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#1C2A3E";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
  };
  const save = () => {
    if (!hasStroke.current) return;
    onSave(canvasRef.current.toDataURL());
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{
          width: "100%", height: 120, background: "#fff",
          border: "1px dashed #C9C2B0", borderRadius: 4, touchAction: "none", cursor: "crosshair",
        }}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <button onClick={clear} style={linkBtnStyle}>limpiar</button>
        <button onClick={save} style={{ ...linkBtnStyle, color: BRAND, fontWeight: 600 }}>
          guardar firma
        </button>
      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 4,
      border: active ? `1px solid ${BRAND}` : "1px solid #E4DFD2", background: active ? BRAND : "#fff",
      color: active ? "#fff" : "#4A4438", fontSize: 11.5, cursor: "pointer",
    }}>
      {icon} {label}
    </button>
  );
}

/**
 * Bloque de firma completo: si ya existe firma la muestra; si no, permite firmar
 * (dibujada o nombre+checkbox) según los permisos que se le pasen.
 *
 * props:
 *  - firma: { tipo, dato, nombre_cliente } | null
 *  - puedeFirmar: boolean
 *  - onFirmaDibujada(dataUrl)
 *  - onFirmaTexto(nombre)
 */
export default function BloqueFirma({ firma, puedeFirmar, onFirmaDibujada, onFirmaTexto }) {
  const [tipo, setTipo] = useState("dibujada");
  const [nombre, setNombre] = useState("");

  if (firma && (firma.dato || firma.nombre_cliente)) {
    return (
      <div>
        <div style={{ fontSize: 11, color: "#6B6656", marginBottom: 6 }}>Firmado</div>
        {firma.tipo === "dibujada" ? (
          <img src={firma.dato} alt="firma" style={{ height: 60 }} />
        ) : (
          <div style={{ fontSize: 13 }}>☑ Conforme — {firma.nombre_cliente}</div>
        )}
      </div>
    );
  }

  if (!puedeFirmar) {
    return <div style={{ fontSize: 12, color: "#9C9585" }}>Sin firmar</div>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <ToggleBtn active={tipo === "dibujada"} onClick={() => setTipo("dibujada")} icon={<PenLine size={13} />} label="Firma dibujada" />
        <ToggleBtn active={tipo === "texto"} onClick={() => setTipo("texto")} icon={<Type size={13} />} label="Nombre + check" />
      </div>
      {tipo === "dibujada" ? (
        <FirmaCanvas onSave={onFirmaDibujada} />
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => onFirmaTexto(nombre)} style={secondaryBtnStyle}>Firmar</button>
        </div>
      )}
    </>
  );
}
