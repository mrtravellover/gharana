// ============================================================
// signature-pad.js — a simple hand-drawn signature capture pad.
// No external library — a signature pad is simple enough to hand-roll
// with plain canvas + pointer events, consistent with this app's
// preference to avoid new dependencies unless genuinely necessary.
// ============================================================

let sigPadDrawing = false;
let sigPadHasStroke = false;
let sigPadCallback = null;

function openSignaturePad(onCapture) {
  sigPadCallback = onCapture;
  sigPadHasStroke = false;
  document.getElementById("sigPadUseBtn").disabled = true;
  openModal("signaturePadModal");

  // Sized after the modal is actually visible, so canvas.clientWidth/Height
  // reflect the real on-screen size rather than 0 (which they'd be if
  // measured while the modal is still display:none).
  requestAnimationFrame(setupSignatureCanvas);
}

function setupSignatureCanvas() {
  const canvas = document.getElementById("sigPadCanvas");
  const ctx = canvas.getContext("2d");

  // Match the canvas's internal pixel size to its displayed size (accounting
  // for device pixel ratio) so strokes are crisp on high-DPI phone screens,
  // not blurry or misaligned with where the finger/mouse actually is.
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0B2A5B";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - r.left, y: point.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    sigPadDrawing = true;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!sigPadDrawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    sigPadHasStroke = true;
    document.getElementById("sigPadUseBtn").disabled = false;
  };
  const end = () => { sigPadDrawing = false; };

  // Remove any listeners from a previous open (openSignaturePad can be
  // called more than once per page visit) before attaching fresh ones.
  const fresh = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(fresh, canvas);
  fresh.addEventListener("mousedown", start);
  fresh.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  fresh.addEventListener("touchstart", start, { passive: false });
  fresh.addEventListener("touchmove", move, { passive: false });
  fresh.addEventListener("touchend", end);
}

function clearSignaturePad() {
  const canvas = document.getElementById("sigPadCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  sigPadHasStroke = false;
  document.getElementById("sigPadUseBtn").disabled = true;
}

function cancelSignaturePad() {
  closeModal("signaturePadModal");
  if (sigPadCallback) sigPadCallback(null); // null = customer declined / skipped, fall back to the printed line
  sigPadCallback = null;
}

function useSignaturePad() {
  if (!sigPadHasStroke) return;
  const canvas = document.getElementById("sigPadCanvas");
  const dataUrl = canvas.toDataURL("image/png");
  closeModal("signaturePadModal");
  if (sigPadCallback) sigPadCallback(dataUrl);
  sigPadCallback = null;
}
