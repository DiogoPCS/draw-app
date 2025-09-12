// --------- Utilidades ----------
    const $ = sel => document.querySelector(sel);
    const video = $('#video');
    const overlayWrapper = $('#overlayWrapper');
    const overlay = $('#overlay');
    const camStatus = $('#camStatus');

    let currentStream = null;
    let devices = [];
    let deviceIndex = 0;
    let wakeLock = null;

    const state = {
      x: 0, y: 0, scale: 1, rotate: 0, flipH: 1, flipV: 1, opacity: 0.5, blend: 'normal',
    };

    function applyTransform() {
      overlayWrapper.style.transform = `translate(calc(50% + ${state.x}px), calc(50% + ${state.y}px)) scale(${state.scale}) rotate(${state.rotate}deg)`;
      overlay.style.transform = `scale(${state.flipH}, ${state.flipV})`;
      overlay.style.opacity = state.opacity;
      overlay.style.mixBlendMode = state.blend;
      $('#opacityVal').textContent = state.opacity.toFixed(2);
      $('#scaleVal').textContent = state.scale.toFixed(2) + '×';
      $('#rotateVal').textContent = Math.round(state.rotate) + '°';
      localStorage.setItem('arTracingState', JSON.stringify(state));
    }

    function restoreState() {
      const saved = localStorage.getItem('arTracingState');
      if (!saved) return;
      try {
        const s = JSON.parse(saved);
        Object.assign(state, s);
        $('#opacity').value = state.opacity;
        $('#scale').value = state.scale;
        $('#rotate').value = state.rotate;
        applyTransform();
      } catch {}
    }

    // --------- Câmera ----------
    async function listCameras() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        devices = all.filter(d => d.kind === 'videoinput');
      } catch (e) {
        console.warn('enumerateDevices falhou', e);
      }
    }

    async function startCamera({ facingMode = 'environment', deviceId = null } = {}) {
      stopCamera();
      const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode } };
      try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        camStatus.textContent = 'Câmera ativa';
        $('#hint').style.display = 'block';
        await listCameras();
      } catch (err) {
        camStatus.textContent = 'Falha ao abrir câmera';
        alert('Não foi possível acessar a câmera. Verifique permissões e conexão HTTPS.\n\nDetalhes: ' + err.message);
        console.error(err);
      }
    }

    function stopCamera() {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
        camStatus.textContent = 'Câmera parada';
      }
    }

    async function switchCamera() {
      if (!devices.length) await listCameras();
      if (!devices.length) return alert('Nenhuma câmera encontrada.');
      deviceIndex = (deviceIndex + 1) % devices.length;
      const chosen = devices[deviceIndex];
      startCamera({ deviceId: chosen.deviceId });
    }

    // --------- Wake Lock ----------
    async function toggleWakeLock() {
      try {
        if (!wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          $('#btnWake').textContent = 'Tela ligada ✔';
          wakeLock.addEventListener('release', () => { $('#btnWake').textContent = 'Manter tela ligada'; wakeLock = null; });
        } else {
          wakeLock.release();
          wakeLock = null;
          $('#btnWake').textContent = 'Manter tela ligada';
        }
      } catch (e) {
        alert('Wake Lock não suportado neste navegador.');
      }
    }

    // --------- Fullscreen ----------
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }

    // --------- Espelhar vídeo ----------
    let mirrored = false;
    function toggleMirror() {
      mirrored = !mirrored;
      video.style.transform = `scaleX(${mirrored ? -1 : 1})`;
    }

    // --------- Carregar imagem ----------
    $('#file').addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      overlay.src = url;
      overlay.onload = () => URL.revokeObjectURL(url);
    });
    $('#btnLoadUrl').addEventListener('click', () => {
      const url = $('#imgUrl').value.trim();
      if (!url) return;
      overlay.src = url;
    });
    function setImageLibrary(url){
      if (!url) return;
      overlay.src = url;
    }

    // --------- Sliders ----------
    $('#opacity').addEventListener('input', e => { state.opacity = parseFloat(e.target.value); applyTransform(); });
    $('#scale').addEventListener('input', e => { state.scale = parseFloat(e.target.value); applyTransform(); });
    $('#rotate').addEventListener('input', e => { state.rotate = parseFloat(e.target.value); applyTransform(); });

    // --------- Botões ----------
    $('#btnStart').addEventListener('click', () => startCamera({ facingMode: 'environment' }));
    $('#btnSwitch').addEventListener('click', switchCamera);
    $('#btnFullscreen').addEventListener('click', toggleFullscreen);
    $('#btnWake').addEventListener('click', toggleWakeLock);
    $('#btnMirror').addEventListener('click', toggleMirror);
    $('#btnFlipH').addEventListener('click', () => { state.flipH *= -1; applyTransform(); });
    $('#btnFlipV').addEventListener('click', () => { state.flipV *= -1; applyTransform(); });
    $('#btnBlend').addEventListener('click', () => {
      const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
      const i = modes.indexOf(state.blend);
      state.blend = modes[(i + 1) % modes.length];
      $('#btnBlend').textContent = 'Mistura: ' + state.blend;
      applyTransform();
    });
    $('#btnReset').addEventListener('click', () => {
      Object.assign(state, { x:0, y:0, scale:1, rotate:0, flipH:1, flipV:1, opacity:0.5, blend:'normal' });
      $('#opacity').value = state.opacity; $('#scale').value = state.scale; $('#rotate').value = state.rotate;
      applyTransform();
    });
    $('#btnCenter').addEventListener('click', () => { state.x = 0; state.y = 0; applyTransform(); });

    // --------- Gestos (arrastar, zoom, rotação) ----------
    let last = { x: 0, y: 0 };
    let touches = [];

    function setWrapperPos(dx, dy) {
      state.x += dx; state.y += dy; applyTransform();
    }

    function distance(a, b) { const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY; return Math.hypot(dx, dy); }
    function angle(a, b) { return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI; }

    overlayWrapper.addEventListener('pointerdown', (e) => {
      overlayWrapper.setPointerCapture(e.pointerId);
      touches = [e];
      last.x = e.clientX; last.y = e.clientY;
    });

    overlayWrapper.addEventListener('pointermove', (e) => {
      if (!touches.length) return;
      if (touches.length === 1) {
        const dx = e.clientX - last.x; const dy = e.clientY - last.y;
        setWrapperPos(dx, dy);
        last.x = e.clientX; last.y = e.clientY;
      }
    });

    overlayWrapper.addEventListener('pointerup', (e) => { touches = []; });
    overlayWrapper.addEventListener('pointercancel', () => { touches = []; });

    // Suporte a gesto de pinça/rotação com 2 dedos via eventos de toque
    let pinchStart = null;
    overlayWrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches; pinchStart = {
          dist: distance(a, b), ang: angle(a, b), scale: state.scale, rot: state.rotate
        };
      }
    }, { passive: true });

    overlayWrapper.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStart) {
        const [a, b] = e.touches;
        const d = distance(a, b);
        const ang = angle(a, b);
        const scaleFactor = d / pinchStart.dist;
        state.scale = Math.min(3, Math.max(0.2, pinchStart.scale * scaleFactor));
        state.rotate = pinchStart.rot + (ang - pinchStart.ang);
        applyTransform();
      }
    }, { passive: true });

    overlayWrapper.addEventListener('touchend', () => { pinchStart = null; }, { passive: true });

    // Restaura estado salvo
    restoreState();

    // Carrega uma imagem placeholder opcional
    overlay.src = '';

    // Dicas de uso
    setTimeout(() => { $('#hint').style.display = 'none'; }, 6000);

    // Evita bloqueio de rolagem quando arrasta o overlay
    document.addEventListener('gesturestart', e => e.preventDefault());