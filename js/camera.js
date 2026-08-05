// ============================================================
// LIVE CAMERA CAPTURE — an in-page camera preview with a Capture
// button, instead of relying on the phone's file picker. Falls
// back to a normal file picker automatically if camera access
// isn't available (e.g. desktop without a webcam, or permission denied).
// ============================================================

let _cameraStream = null;
let _cameraCallback = null;
let _cameraFacingMode = "environment"; // rear camera by default — better for photographing items/documents

function ensureCameraModal() {
  if (document.getElementById("cameraModalOverlay")) return;
  const html = `
  <div class="modal-overlay" id="cameraModalOverlay" style="display:none;z-index:200;">
    <div class="modal" style="max-width:420px;">
      <h2 style="margin-bottom:10px;">Take photo</h2>
      <div style="position:relative;background:#000;border-radius:8px;overflow:hidden;">
        <video id="cameraVideo" autoplay playsinline muted style="width:100%;display:block;"></video>
        <img id="cameraPreviewImg" style="width:100%;display:none;">
        <button type="button" id="cameraFlipBtn" title="Switch camera" aria-label="Switch camera" style="position:absolute;top:10px;right:10px;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 014-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 01-4 4H3"/></svg>
        </button>
      </div>
      <canvas id="cameraCanvas" style="display:none;"></canvas>
      <p id="cameraError" style="color:var(--danger);font-size:13px;display:none;margin-top:8px;"></p>
      <div style="display:flex;gap:10px;margin-top:12px;" id="cameraShotRow">
        <button type="button" class="btn btn-secondary btn-block" id="cameraCancelBtn">Cancel</button>
        <button type="button" class="btn btn-primary btn-block" id="cameraShotBtn">📸 Capture</button>
      </div>
      <div style="display:none;gap:10px;margin-top:12px;" id="cameraRetakeRow">
        <button type="button" class="btn btn-secondary btn-block" id="cameraRetakeBtn">Retake</button>
        <button type="button" class="btn btn-primary btn-block" id="cameraUseBtn">Use this photo</button>
      </div>
      <label class="btn btn-ghost btn-sm" style="margin-top:8px;cursor:pointer;display:inline-block;">
        Or choose a file instead
        <input type="file" id="cameraFallbackInput" accept="image/*" style="display:none;">
      </label>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);

  document.getElementById("cameraCancelBtn").addEventListener("click", closeCameraModal);
  document.getElementById("cameraShotBtn").addEventListener("click", takeShot);
  document.getElementById("cameraRetakeBtn").addEventListener("click", retakeShot);
  document.getElementById("cameraUseBtn").addEventListener("click", usePhoto);
  document.getElementById("cameraFlipBtn").addEventListener("click", flipCamera);
  document.getElementById("cameraFallbackInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && _cameraCallback) {
      const compressed = await compressImage(file);
      _cameraCallback(compressed);
      closeCameraModal();
    }
  });
}

/**
 * Resizes/re-encodes any image File/Blob down to MAX_PHOTO_DIM and JPEG
 * quality 0.75, so gallery-picked photos (which can be several MB straight
 * off a phone camera) upload just as fast as live captures.
 */
function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }) : file);
      }, "image/jpeg", 0.75);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fall back to original if it can't be read as an image
    img.src = url;
  });
}

async function openCameraCapture(callback) {
  ensureCameraModal();
  _cameraCallback = callback;

  const video = document.getElementById("cameraVideo");
  const preview = document.getElementById("cameraPreviewImg");
  const errorEl = document.getElementById("cameraError");
  video.style.display = "";
  preview.style.display = "none";
  errorEl.style.display = "none";
  document.getElementById("cameraShotRow").style.display = "flex";
  document.getElementById("cameraRetakeRow").style.display = "none";
  document.getElementById("cameraModalOverlay").style.display = "flex";
  document.body.classList.add("modal-open");

  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _cameraFacingMode } });
    video.srcObject = _cameraStream;
    hideFlipButtonIfOnlyOneCamera();
  } catch (err) {
    errorEl.textContent = "Couldn't open the camera (permission denied or unavailable). Use \"choose a file instead\" below.";
    errorEl.style.display = "block";
    document.getElementById("cameraShotRow").style.display = "none";
  }
}

// Hides the flip button on devices that only report one camera (e.g. most
// laptops), since there'd be nothing to switch to.
async function hideFlipButtonIfOnlyOneCamera() {
  const flipBtn = document.getElementById("cameraFlipBtn");
  if (!flipBtn || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameraCount = devices.filter((d) => d.kind === "videoinput").length;
    flipBtn.style.display = cameraCount > 1 ? "flex" : "none";
  } catch (err) {
    // If we can't tell, just leave the button visible — worst case, flipping fails gracefully (see flipCamera()).
  }
}

// Switches between the rear ("environment") and front ("user") camera by
// stopping the current stream and requesting a new one with the opposite
// facing mode. Falls back to keeping the current camera if the switch fails
// (e.g. the device genuinely only has one camera).
async function flipCamera() {
  const video = document.getElementById("cameraVideo");
  const nextMode = _cameraFacingMode === "environment" ? "user" : "environment";
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextMode } });
    if (_cameraStream) _cameraStream.getTracks().forEach((t) => t.stop());
    _cameraStream = newStream;
    _cameraFacingMode = nextMode;
    video.srcObject = _cameraStream;
  } catch (err) {
    console.error("Couldn't switch camera:", err);
    toast("Couldn't switch camera — this device may only have one.");
  }
}

const MAX_PHOTO_DIM = 1280; // cap width/height so uploads stay fast and small

function takeShot() {
  const video = document.getElementById("cameraVideo");
  const canvas = document.getElementById("cameraCanvas");
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 960;
  const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(vw, vh));
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  document.getElementById("cameraPreviewImg").src = canvas.toDataURL("image/jpeg", 0.75);
  document.getElementById("cameraPreviewImg").style.display = "";
  video.style.display = "none";
  document.getElementById("cameraFlipBtn").style.display = "none";
  document.getElementById("cameraShotRow").style.display = "none";
  document.getElementById("cameraRetakeRow").style.display = "flex";
}

function retakeShot() {
  document.getElementById("cameraPreviewImg").style.display = "none";
  document.getElementById("cameraVideo").style.display = "";
  hideFlipButtonIfOnlyOneCamera();
  document.getElementById("cameraShotRow").style.display = "flex";
  document.getElementById("cameraRetakeRow").style.display = "none";
}

function usePhoto() {
  const canvas = document.getElementById("cameraCanvas");
  canvas.toBlob((blob) => {
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (_cameraCallback) _cameraCallback(file);
    closeCameraModal();
  }, "image/jpeg", 0.75);
}

function closeCameraModal() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach((t) => t.stop());
    _cameraStream = null;
  }
  const overlay = document.getElementById("cameraModalOverlay");
  if (overlay) overlay.style.display = "none";
  // The camera modal is often opened from within another modal (e.g. New
  // Customer's "Take photo" button) — only clear the flag if nothing else
  // with class .modal-overlay is still visible underneath.
  const anyStillOpen = [...document.querySelectorAll(".modal-overlay")].some((m) => m.style.display === "flex");
  if (!anyStillOpen) document.body.classList.remove("modal-open");
}

/**
 * Wires a "Take photo" button + preview area to the live camera modal.
 * onCaptured(file) receives a File object once the person confirms a shot.
 */
function wirePhotoCapture(buttonId, previewId, onCaptured) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", () => {
    openCameraCapture((file) => {
      const url = URL.createObjectURL(file);
      const preview = document.getElementById(previewId);
      if (preview) preview.innerHTML = `<img src="${url}" style="max-width:160px;border-radius:8px;border:1px solid var(--line);margin-top:8px;display:block;">`;
      onCaptured(file);
    });
  });
}
