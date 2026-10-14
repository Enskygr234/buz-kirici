/*! Buz Kırıcı — kartopuyla buz blokları kırma oyunu. MIT © Winterdeveloper */
(function () {
  "use strict";

  const W = 400, H = 700;           // oyun alanı (mantıksal piksel)
  const UST = 56;                    // üstteki gösterge şeridi
  const SUTUN = 10, BLOK_Y = 96, BLOK_H = 22, BOSLUK = 4;
  const BLOK_W = (W - 20 - BOSLUK * (SUTUN - 1)) / SUTUN;

  // Bölümler: . boş, 1-3 dayanıklılık, # kırılmaz demir buz, * içinden kesin güç çıkar
  const BOLUMLER = [
    ["..........", ".11111111.", ".11111111.", ".11111111.", ".11111111."],
    ["1.1.1.1.1.", ".2.2.2.2.2", "1.1*1.1*1.", ".2.2.2.2.2", "1.1.1.1.1."],
    ["2222222222", "1111111111", "1*111111*1", "1111111111", "..........", "##......##"],
    ["....33....", "...3223...", "..321123..", ".32*11*23.", "..321123..", "...3223...", "....33...."],
    ["1#1#1#1#1#", "2222222222", "1111*11111", "2222222222", "#1#1#1#1#1"],
    ["3........3", "23......32", "123.**.321", "123....321", "23......32", "3........3"],
    ["##########", "3333333333", "2222**2222", "1111111111", "1111111111", "....##...."],
    [".3.3.3.3.3", "3.3.3.3.3.", ".2*2.2*2.2", "2.2.2.2.2.", ".1.1.1.1.1", "#........#", "1.1.1.1.1."],
  ];

  const GUCLER = {
    genis: { harf: "↔", renk: "#4fb3e0", ad: "Geniş kızak" },
    coklu: { harf: "×3", renk: "#9b8cff", ad: "Üç kartopu" },
    yavas: { harf: "🐢", renk: "#7ad18f", ad: "Yavaş top" },
    can:   { harf: "♥", renk: "#ff6b81", ad: "Fazladan can" },
    ates:  { harf: "🔥", renk: "#f0a03c", ad: "Kor topu" },
  };

  const tuval = document.getElementById("oyun");
  const c = tuval.getContext("2d");
  let olcek = 1, kx = 0, ky = 0;

  let durum = "menu";               // menu | oyun | durak | gecis | bitti
  let seviye, puan, can, rekor, raket, toplar, bloklar, gucler, parcalar, etkiler, sarsinti, gecisSure, hedefX, zaman;
  const tus = { sol: false, sag: false };
  let sesAcik = true, ses = null;

  // ---------- kayıt ----------
  function oku(a, v) { try { const x = localStorage.getItem("buzkirici-" + a); return x === null ? v : JSON.parse(x); } catch { return v; } }
  function yaz(a, v) { try { localStorage.setItem("buzkirici-" + a, JSON.stringify(v)); } catch { /* gizli sekme */ } }

  // ---------- ses (WebAudio ile üretilir, ses dosyası yok) ----------
  function bip(frekans, sure = 0.07, tur = "sine", hacim = 0.12) {
    if (!sesAcik) return;
    try {
      ses = ses || new (window.AudioContext || window.webkitAudioContext)();
      const o = ses.createOscillator(), g = ses.createGain();
      o.type = tur; o.frequency.value = frekans;
      g.gain.setValueAtTime(hacim, ses.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ses.currentTime + sure);
      o.connect(g).connect(ses.destination);
      o.start(); o.stop(ses.currentTime + sure);
    } catch { /* ses yoksa sessiz oyna */ }
  }

  // ---------- kurulum ----------
  function boyutla() {
    const oran = Math.min(window.devicePixelRatio || 1, 2);
    tuval.width = innerWidth * oran; tuval.height = innerHeight * oran;
    tuval.style.width = innerWidth + "px"; tuval.style.height = innerHeight + "px";
    olcek = Math.min(innerWidth / W, innerHeight / H);
    kx = (innerWidth - W * olcek) / 2; ky = (innerHeight - H * olcek) / 2;
    c.setTransform(oran * olcek, 0, 0, oran * olcek, oran * kx, oran * ky);
  }

  function yeniOyun() {
    seviye = 1; puan = 0; can = 3;
    bolumKur();
    durum = "oyun";
  }

  function bolumKur() {
    raket = { x: W / 2, w: 84, h: 14, y: H - 64, genisSure: 0 };
    toplar = [yeniTop()];
    gucler = []; parcalar = []; etkiler = { yavas: 0, ates: 0 };
    hedefX = null;
    const harita = BOLUMLER[(seviye - 1) % BOLUMLER.length];
    const tur = Math.floor((seviye - 1) / BOLUMLER.length);   // ikinci turda bloklar daha dayanıklı
    bloklar = [];
    harita.forEach((satir, s) => Array.from(satir).forEach((h, i) => {
      if (h === ".") return;
      const x = 10 + i * (BLOK_W + BOSLUK), y = BLOK_Y + s * (BLOK_H + BOSLUK);
      if (h === "#") bloklar.push({ x, y, can: Infinity, max: Infinity, demir: true });
      else {
        const dayanim = Math.min(3, (h === "*" ? 1 : +h) + tur);
        bloklar.push({ x, y, can: dayanim, max: dayanim, guc: h === "*" });
      }
    }));
  }

  function yeniTop() { return { x: raket.x, y: raket.y - 9, vx: 0, vy: 0, r: 7, yapisik: true }; }

  function hiz() { return Math.min(620, 360 + (seviye - 1) * 22) * (etkiler.yavas > 0 ? 0.72 : 1); }

  function firlat() {
    for (const t of toplar) if (t.yapisik) {
      const a = (Math.random() * 40 - 20) * Math.PI / 180;
      t.vx = Math.sin(a) * hiz(); t.vy = -Math.cos(a) * hiz(); t.yapisik = false;
      bip(520, 0.05, "triangle");
    }
  }

  // ---------- güncelleme ----------
  function guncelle(dt) {
    zaman += dt;
    for (let i = parcalar.length - 1; i >= 0; i--) {
      const p = parcalar[i];
      p.omur -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.don += p.dh * dt;
      if (p.omur <= 0) parcalar.splice(i, 1);
    }
    if (sarsinti > 0) sarsinti = Math.max(0, sarsinti - dt * 4);

    if (durum === "gecis") {
      gecisSure -= dt;
      if (gecisSure <= 0) { seviye++; bolumKur(); durum = "oyun"; }
      return;
    }
    if (durum !== "oyun") return;

    // kızak
    const hizR = 640;
    if (tus.sol) raket.x -= hizR * dt;
    if (tus.sag) raket.x += hizR * dt;
    if (hedefX !== null) raket.x += Math.max(-1, Math.min(1, (hedefX - raket.x) / 12)) * Math.min(Math.abs(hedefX - raket.x), 1400 * dt) ;
    if (raket.genisSure > 0) { raket.genisSure -= dt; raket.w = 124; } else raket.w = 84;
    raket.x = Math.max(raket.w / 2 + 6, Math.min(W - raket.w / 2 - 6, raket.x));
    etkiler.yavas = Math.max(0, etkiler.yavas - dt);
    etkiler.ates = Math.max(0, etkiler.ates - dt);

    // toplar: hızlı topun blokların içinden geçmemesi için küçük adımlarla ilerle
    for (let ti = toplar.length - 1; ti >= 0; ti--) {
      const t = toplar[ti];
      if (t.yapisik) { t.x = raket.x; t.y = raket.y - t.r - 2; continue; }
      const v = Math.hypot(t.vx, t.vy), hedef = hiz();
      if (Math.abs(v - hedef) > 1) { t.vx *= hedef / v; t.vy *= hedef / v; }
      const adim = Math.max(1, Math.ceil((hedef * dt) / (t.r * 0.7)));
      for (let a = 0; a < adim; a++) {
        if (topAdimi(t, dt / adim)) { toplar.splice(ti, 1); break; }
      }
    }
    if (toplar.length === 0) canGitti();

    // düşen güçler
    for (let i = gucler.length - 1; i >= 0; i--) {
      const g = gucler[i];
      g.y += 150 * dt;
      if (g.y > raket.y - 10 && g.y < raket.y + raket.h + 10 && Math.abs(g.x - raket.x) < raket.w / 2 + 14) {
        gucAl(g.tur); gucler.splice(i, 1);
      } else if (g.y > H + 20) gucler.splice(i, 1);
    }

    if (!bloklar.some(b => !b.demir)) {
      durum = "gecis"; gecisSure = 1.8; puan += 100 * seviye;
      bip(660, 0.12, "triangle"); setTimeout(() => bip(880, 0.18, "triangle"), 120);
    }
  }

  /** Topu bir adım ilerletir; top aşağı düştüyse true döner. */
  function topAdimi(t, dt) {
    t.x += t.vx * dt; t.y += t.vy * dt;
    if (t.x < t.r) { t.x = t.r; t.vx = Math.abs(t.vx); bip(300, 0.03); }
    if (t.x > W - t.r) { t.x = W - t.r; t.vx = -Math.abs(t.vx); bip(300, 0.03); }
    if (t.y < UST + t.r) { t.y = UST + t.r; t.vy = Math.abs(t.vy); bip(300, 0.03); }
    if (t.y > H + 20) return true;

    // kızak: değdiği yere göre açı ver (ortası dik, kenarlar yatık)
    if (t.vy > 0 && t.y + t.r >= raket.y && t.y + t.r <= raket.y + raket.h + 8 && Math.abs(t.x - raket.x) <= raket.w / 2 + t.r) {
      const goreli = Math.max(-1, Math.min(1, (t.x - raket.x) / (raket.w / 2)));
      const aci = goreli * 62 * Math.PI / 180, v = hiz();
      t.vx = Math.sin(aci) * v; t.vy = -Math.cos(aci) * v;
      t.y = raket.y - t.r;
      bip(440, 0.05, "square", 0.06);
    }

    // bloklar
    for (let i = 0; i < bloklar.length; i++) {
      const b = bloklar[i];
      const yx = Math.max(b.x, Math.min(t.x, b.x + BLOK_W));
      const yy = Math.max(b.y, Math.min(t.y, b.y + BLOK_H));
      const dx = t.x - yx, dy = t.y - yy;
      if (dx * dx + dy * dy > t.r * t.r) continue;

      const atesli = etkiler.ates > 0 && !b.demir;
      if (!atesli) {
        // hangi kenara çarptı: top merkezi bloğun yatay aralığındaysa üst/alt, değilse yan
        if (t.x > b.x && t.x < b.x + BLOK_W) { t.vy = -t.vy; t.y = t.vy > 0 ? b.y + BLOK_H + t.r : b.y - t.r; }
        else if (t.y > b.y && t.y < b.y + BLOK_H) { t.vx = -t.vx; t.x = t.vx > 0 ? b.x + BLOK_W + t.r : b.x - t.r; }
        else { t.vx = -t.vx; t.vy = -t.vy; }   // köşe
      }
      vur(b, i, atesli);
      break;
    }
    return false;
  }

  function vur(b, i, atesli) {
    if (b.demir) { bip(180, 0.05, "square", 0.05); return; }
    b.can -= atesli ? b.can : 1;
    kirikParca(b, b.can <= 0 ? 10 : 4);
    if (b.can > 0) { bip(600 + b.can * 80, 0.05); puan += 5; return; }
    bloklar.splice(i, 1);
    puan += 10 * b.max * seviye;
    sarsinti = Math.min(1, sarsinti + 0.25);
    bip(760 + Math.random() * 200, 0.08, "triangle");
    if (b.guc || Math.random() < 0.13) {
      const turler = Object.keys(GUCLER).filter(k => k !== "can" || Math.random() < 0.35);
      gucler.push({ x: b.x + BLOK_W / 2, y: b.y + BLOK_H / 2, tur: turler[Math.floor(Math.random() * turler.length)] });
    }
  }

  function kirikParca(b, n) {
    for (let k = 0; k < n; k++) {
      parcalar.push({
        x: b.x + Math.random() * BLOK_W, y: b.y + Math.random() * BLOK_H,
        vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 220,
        boy: 2 + Math.random() * 4, omur: 0.6 + Math.random() * 0.5, don: Math.random() * 6, dh: (Math.random() - 0.5) * 12,
      });
    }
  }

  function gucAl(tur) {
    bip(990, 0.12, "triangle", 0.1);
    if (tur === "genis") raket.genisSure = 15;
    else if (tur === "yavas") etkiler.yavas = 10;
    else if (tur === "ates") etkiler.ates = 7;
    else if (tur === "can") can = Math.min(6, can + 1);
    else if (tur === "coklu") {
      const yeni = [];
      for (const t of toplar.slice(0, 4)) {
        if (t.yapisik) continue;
        for (const d of [-0.35, 0.35]) {
          const a = Math.atan2(t.vx, -t.vy) + d, v = hiz();
          yeni.push({ x: t.x, y: t.y, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, r: t.r, yapisik: false });
        }
      }
      toplar.push(...yeni);
    }
    puan += 25;
  }

  function canGitti() {
    can--;
    sarsinti = 1;
    bip(200, 0.3, "sawtooth", 0.08);
    gucler = []; etkiler = { yavas: 0, ates: 0 }; raket.genisSure = 0;
    if (can <= 0) {
      durum = "bitti";
      if (puan > rekor) { rekor = puan; yaz("rekor", rekor); yeniRekor = true; } else yeniRekor = false;
      return;
    }
    toplar = [yeniTop()];
  }
  let yeniRekor = false;

  // ---------- çizim ----------
  function yuvarlak(x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function yazi(m, x, y, boy, renk, kalin = true, hiza = "center") {
    c.font = `${kalin ? 700 : 400} ${boy}px "Segoe UI", system-ui, sans-serif`;
    c.textAlign = hiza; c.fillStyle = renk; c.fillText(m, x, y);
  }

  function ciz() {
    const oran = Math.min(window.devicePixelRatio || 1, 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#06101c"; c.fillRect(0, 0, tuval.width, tuval.height);
    let sx = 0, sy = 0;
    if (sarsinti > 0) { sx = (Math.random() - 0.5) * 8 * sarsinti; sy = (Math.random() - 0.5) * 8 * sarsinti; }
    c.setTransform(oran * olcek, 0, 0, oran * olcek, oran * (kx + sx * olcek), oran * (ky + sy * olcek));

    const zemin = c.createLinearGradient(0, 0, 0, H);
    zemin.addColorStop(0, "#1d3a5c"); zemin.addColorStop(1, "#0b1626");
    c.fillStyle = zemin; c.fillRect(0, 0, W, H);

    // arkada usul kar
    c.fillStyle = "rgba(255,255,255,.35)";
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3 + Math.sin(zaman * 0.5 + i) * 12) % W, y = (i * 53.7 + zaman * (12 + i % 5 * 6)) % H;
      c.beginPath(); c.arc(x, y, 1 + (i % 3) * 0.6, 0, 6.28); c.fill();
    }

    // bloklar
    for (const b of bloklar) {
      if (b.demir) {
        c.fillStyle = "#5d6f80"; yuvarlak(b.x, b.y, BLOK_W, BLOK_H, 5); c.fill();
        c.fillStyle = "#8496a6"; c.fillRect(b.x + 3, b.y + 3, BLOK_W - 6, 4);
        continue;
      }
      const g = c.createLinearGradient(b.x, b.y, b.x, b.y + BLOK_H);
      const ton = b.can >= 3 ? ["#2d6fa8", "#1d4f80"] : b.can === 2 ? ["#4fa3d8", "#2f7ab3"] : ["#a9e1fb", "#6cc0ea"];
      g.addColorStop(0, ton[0]); g.addColorStop(1, ton[1]);
      c.fillStyle = g; yuvarlak(b.x, b.y, BLOK_W, BLOK_H, 5); c.fill();
      c.fillStyle = "rgba(255,255,255,.45)"; c.fillRect(b.x + 4, b.y + 3, BLOK_W - 8, 3);
      if (b.can < b.max) {   // çatlaklar
        c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(b.x + BLOK_W * 0.3, b.y + 2); c.lineTo(b.x + BLOK_W * 0.45, b.y + BLOK_H * 0.55); c.lineTo(b.x + BLOK_W * 0.35, b.y + BLOK_H - 2);
        if (b.max - b.can > 1) { c.moveTo(b.x + BLOK_W * 0.45, b.y + BLOK_H * 0.55); c.lineTo(b.x + BLOK_W * 0.75, b.y + BLOK_H * 0.4); }
        c.stroke();
      }
      if (b.guc) { yazi("✦", b.x + BLOK_W / 2, b.y + BLOK_H - 6, 12, "#fff"); }
    }

    // parçalar
    for (const p of parcalar) {
      c.save(); c.translate(p.x, p.y); c.rotate(p.don);
      c.globalAlpha = Math.max(0, p.omur); c.fillStyle = "#cfefff"; c.fillRect(-p.boy / 2, -p.boy / 2, p.boy, p.boy);
      c.restore();
    }
    c.globalAlpha = 1;

    // güçler
    for (const g of gucler) {
      const bilgi = GUCLER[g.tur];
      c.fillStyle = bilgi.renk; yuvarlak(g.x - 16, g.y - 10, 32, 20, 10); c.fill();
      yazi(bilgi.harf, g.x, g.y + 5, 12, "#06121f");
    }

    // kızak
    if (raket) {
      const g = c.createLinearGradient(0, raket.y, 0, raket.y + raket.h);
      g.addColorStop(0, "#e6f6ff"); g.addColorStop(1, "#7cc4ea");
      c.shadowColor = "rgba(142,202,230,.8)"; c.shadowBlur = 14;
      c.fillStyle = g; yuvarlak(raket.x - raket.w / 2, raket.y, raket.w, raket.h, 7); c.fill();
      c.shadowBlur = 0;
    }

    // toplar
    for (const t of toplar || []) {
      const ates = etkiler && etkiler.ates > 0;
      c.shadowColor = ates ? "rgba(255,150,40,.95)" : "rgba(255,255,255,.7)"; c.shadowBlur = ates ? 18 : 8;
      c.fillStyle = ates ? "#ffb347" : "#fff";
      c.beginPath(); c.arc(t.x, t.y, t.r, 0, 6.28); c.fill();
      c.shadowBlur = 0;
    }

    // gösterge
    c.fillStyle = "rgba(6,16,28,.7)"; c.fillRect(0, 0, W, UST);
    if (durum !== "menu") {
      yazi(String(puan), 14, 34, 22, "#fff", true, "left");
      yazi("Bölüm " + seviye, W / 2, 34, 16, "#8ecae6");
      yazi("❄".repeat(Math.max(0, can)), W - 52, 33, 14, "#bfe6ff", true, "right");
    }
    yazi(sesAcik ? "🔊" : "🔇", W - 20, 34, 16, "#fff", false);
    if (etkiler && (etkiler.ates > 0 || etkiler.yavas > 0 || raket.genisSure > 0)) {
      const aktif = [etkiler.ates > 0 && "🔥", etkiler.yavas > 0 && "🐢", raket.genisSure > 0 && "↔"].filter(Boolean).join("  ");
      yazi(aktif, W / 2, 52, 11, "#f0d9a8", false);
    }

    // ekranlar
    if (durum === "menu") panel(["BUZ KIRICI", "Kartopuyla buz bloklarını kır", "", "Parmağını ya da fareni kaydır", "← → tuşlarıyla da oynanır", "", "Başlamak için dokun"], rekor ? "Rekor: " + rekor : "");
    else if (durum === "durak") panel(["Duraklatıldı", "", "Devam için dokun"]);
    else if (durum === "gecis") panel(["Bölüm " + seviye + " bitti!", "+" + 100 * seviye + " bonus", "", "Sıradaki bölüm geliyor…"]);
    else if (durum === "bitti") panel(["Oyun bitti", String(puan), yeniRekor ? "★ Yeni rekor! ★" : "Rekor: " + rekor, "", "Yeniden oynamak için dokun"]);
    else if (toplar.some(t => t.yapisik)) yazi("Fırlatmak için dokun", W / 2, raket.y - 40, 15, "rgba(255,255,255,.75)", false);
  }

  function panel(satirlar, alt) {
    c.fillStyle = "rgba(6,16,28,.82)"; yuvarlak(30, 220, W - 60, 280, 18); c.fill();
    c.strokeStyle = "rgba(142,202,230,.4)"; c.lineWidth = 1.5; c.stroke();
    let y = 270;
    satirlar.forEach((s, i) => {
      if (i === 0) { yazi(s, W / 2, y, 30, "#fff"); y += 40; }
      else if (/^\d+$/.test(s)) { yazi(s, W / 2, y + 10, 42, "#ffd166"); y += 52; }
      else { yazi(s, W / 2, y, 15, s.startsWith("★") ? "#ffd166" : "#b9cfe0", s.startsWith("★") || s.includes("dokun")); y += s ? 24 : 12; }
    });
    if (alt) yazi(alt, W / 2, 486, 13, "#8ecae6", false);
  }

  // ---------- girdi ----------
  function oyunX(e) { return (e.clientX - kx) / olcek; }
  function oyunY(e) { return (e.clientY - ky) / olcek; }

  function dokun(e) {
    if (ses && ses.state === "suspended") ses.resume();
    // sağ üstteki ses düğmesi
    if (oyunY(e) < UST && oyunX(e) > W - 44) { sesAcik = !sesAcik; yaz("ses", sesAcik); return; }
    if (durum === "menu" || durum === "bitti") { yeniOyun(); return; }
    if (durum === "durak") { durum = "oyun"; return; }
    if (durum === "oyun") { hedefX = oyunX(e); firlat(); }
  }

  tuval.addEventListener("pointerdown", e => { e.preventDefault(); dokun(e); });
  tuval.addEventListener("pointermove", e => { if (durum === "oyun" && (e.pointerType === "mouse" || e.buttons)) hedefX = oyunX(e); });
  tuval.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") hedefX = null; });
  addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "a") { tus.sol = true; hedefX = null; }
    else if (e.key === "ArrowRight" || e.key === "d") { tus.sag = true; hedefX = null; }
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (durum === "menu" || durum === "bitti") yeniOyun();
      else if (durum === "durak") durum = "oyun";
      else if (durum === "oyun") firlat();
    } else if (e.key === "p" || e.key === "Escape") {
      if (durum === "oyun") durum = "durak"; else if (durum === "durak") durum = "oyun";
    } else if (e.key === "m") { sesAcik = !sesAcik; yaz("ses", sesAcik); }
  });
  addEventListener("keyup", e => {
    if (e.key === "ArrowLeft" || e.key === "a") tus.sol = false;
    if (e.key === "ArrowRight" || e.key === "d") tus.sag = false;
  });
  addEventListener("blur", () => { tus.sol = tus.sag = false; if (durum === "oyun") durum = "durak"; });
  addEventListener("resize", boyutla);
  document.addEventListener("visibilitychange", () => { if (document.hidden && durum === "oyun") durum = "durak"; });

  // ---------- döngü ----------
  let onceki = null;
  function kare(t) {
    const dt = onceki === null ? 0.016 : Math.min((t - onceki) / 1000, 0.033);
    onceki = t;
    guncelle(dt);
    ciz();
    requestAnimationFrame(kare);
  }

  rekor = oku("rekor", 0);
  sesAcik = oku("ses", true);
  zaman = 0; sarsinti = 0;
  raket = { x: W / 2, w: 84, h: 14, y: H - 64, genisSure: 0 };
  etkiler = { yavas: 0, ates: 0 }; parcalar = []; gucler = []; toplar = []; bloklar = [];
  seviye = 1; puan = 0; can = 3;
  bolumKur();
  boyutla();
  requestAnimationFrame(kare);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  // Testler için
  window.BuzKirici = {
    durum: () => ({ durum, seviye, puan, can, top: toplar.length, blok: bloklar.filter(b => !b.demir).length, rekor }),
    ilerlet(sn) { for (let t = 0; t < sn; t += 1 / 60) guncelle(1 / 60); return this.durum(); },
    basla: () => yeniOyun(),
    firlat: () => firlat(),
    takip(ac) { this._takip = ac; },
    bolumuBitir() { bloklar = bloklar.filter(b => b.demir); },
    gucVer: tur => gucAl(tur),
  };
  // Test için: kızak topu kendiliğinden takip etsin
  const eskiGuncelle = guncelle;
  guncelle = function (dt) {
    if (window.BuzKirici._takip && toplar.length) {
      const hedef = toplar.filter(t => !t.yapisik).sort((a, b) => b.y - a.y)[0];
      if (hedef) hedefX = hedef.x + 10;
    }
    eskiGuncelle(dt);
  };
})();
