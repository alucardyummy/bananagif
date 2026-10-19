import gifsicle from './vendor/gifsicle.min.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

// ───────── Tema ─────────
$('theme').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('bananagif-theme', next); } catch (e) {}
});

// ───────── Estado ─────────
const S = {
  file: null,
  width: 0,
  height: 0,
  origUrl: null,
  outUrl: null,
  cancel: false,
  unit: 'KB',
};

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
function fmtBytes(n) {
  // 1 KB = 1000 bytes (mesma conta do Android e do macOS). Fica sempre do lado seguro de um limite em KB.
  if (n >= 1e6) return nf2.format(n / 1e6) + ' MB';
  return nf.format(n / 1e3) + ' KB';
}

function setState(s) { app.dataset.state = s; }
function showError(msg) {
  const el = $('error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

// ───────── Lendo o cabeçalho do GIF (largura e altura) ─────────
async function readGifHeader(blob) {
  const buf = await blob.slice(0, 10).arrayBuffer();
  const b = new Uint8Array(buf);
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
}

// ───────── Escolher o arquivo ─────────
const drop = $('drop');
const fileInput = $('file');

fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) loadFile(f);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault();
  drop.classList.add('is-over');
}));
['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('is-over');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});
// soltar fora do nicho não pode abrir o arquivo no navegador
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

async function loadFile(file) {
  showError('');
  const head = await readGifHeader(file).catch(() => null);
  if (!head) {
    showError('Esse arquivo não é um GIF. Escolha um arquivo que termine em .gif.');
    return;
  }
  if (file.size > 150 * 1e6) {
    showError('Esse GIF tem mais de 150 MB e é grande demais para o navegador comprimir. Tente um menor.');
    return;
  }
  if (S.origUrl) URL.revokeObjectURL(S.origUrl);
  if (S.outUrl) { URL.revokeObjectURL(S.outUrl); S.outUrl = null; }

  S.file = file;
  S.width = head.w;
  S.height = head.h;
  S.origUrl = URL.createObjectURL(file);

  const prev = $('preview');
  prev.src = S.origUrl;
  prev.hidden = false;
  drop.classList.add('has-file');

  $('fname').textContent = file.name;
  $('fmeta').textContent = `${fmtBytes(file.size)} · ${head.w} × ${head.h} px`;
  $('fileinfo').hidden = false;

  $('go').disabled = false;
  setState('ready');
}

function resetToIdle() {
  S.file = null;
  if (S.origUrl) { URL.revokeObjectURL(S.origUrl); S.origUrl = null; }
  if (S.outUrl) { URL.revokeObjectURL(S.outUrl); S.outUrl = null; }
  $('preview').hidden = true;
  $('preview').removeAttribute('src');
  drop.classList.remove('has-file');
  $('fileinfo').hidden = true;
  $('go').disabled = true;
  showError('');
  setState('idle');
}

$('change').addEventListener('click', () => fileInput.click());
$('other').addEventListener('click', () => { resetToIdle(); window.scrollTo({ top: 0 }); });
$('again').addEventListener('click', () => { setState('ready'); showError(''); window.scrollTo({ top: 0 }); });

// ───────── Tamanho final ─────────
const sizeInput = $('size');
const chips = [...document.querySelectorAll('#chips button')];

function parseNumber(str) {
  const n = parseFloat(String(str).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function targetBytes() {
  const n = parseNumber(sizeInput.value);
  if (!(n > 0)) return NaN;
  return Math.round(n * (S.unit === 'MB' ? 1e6 : 1e3));
}
function setUnit(u) {
  S.unit = u;
  $('u-kb').setAttribute('aria-pressed', String(u === 'KB'));
  $('u-mb').setAttribute('aria-pressed', String(u === 'MB'));
  markChip();
}
function markChip() {
  const t = targetBytes();
  chips.forEach((c) => c.classList.toggle('on', Number(c.dataset.bytes) === t));
}
$('u-kb').addEventListener('click', () => setUnit('KB'));
$('u-mb').addEventListener('click', () => setUnit('MB'));
sizeInput.addEventListener('input', () => {
  sizeInput.value = sizeInput.value.replace(/[^0-9.,]/g, '');
  markChip();
});
$('maxw').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); });
chips.forEach((c) => c.addEventListener('click', () => {
  const b = Number(c.dataset.bytes);
  if (b >= 1e6) { setUnit('MB'); sizeInput.value = String(b / 1e6); }
  else { setUnit('KB'); sizeInput.value = String(b / 1e3); }
  markChip();
}));
markChip();

// ───────── Compressão ─────────
// Do mais suave ao mais forte. A compressão extra só entra quando reduzir o tamanho em pixels
// não basta, porque nos testes ela estraga mais a imagem do que encolher um pouco.
const LADDER = [
  { lossy: 0,   colors: 256, label: '' },
  { lossy: 60,  colors: 256, label: 'compressão leve nas cores' },
  { lossy: 120, colors: 128, label: 'compressão média nas cores' },
  { lossy: 200, colors: 64,  label: 'compressão forte nas cores' },
];
const MIN_W = 48;

class Cancelled extends Error {}

let tries = 0;
const seen = { smallest: null };

async function attempt(width, level, capped) {
  if (S.cancel) throw new Cancelled();
  tries += 1;
  $('status').textContent = `Teste ${tries}: ${capped ? 'tamanho original' : width + ' px de largura'}`;

  const args = ['-O3'];
  if (level.lossy) args.push(`--lossy=${level.lossy}`);
  if (level.colors < 256) args.push(`--colors ${level.colors}`);
  if (!capped) args.push(`--resize-width ${width}`);

  const out = await gifsicle.run({
    input: [{ file: S.file, name: '1.gif' }],
    command: [`${args.join(' ')} 1.gif -o /out/out.gif`],
  });
  if (S.cancel) throw new Cancelled();
  if (!out || !out[0] || !out[0].size) throw new Error('falha no gifsicle');
  const f = out[0];
  if (!seen.smallest || f.size < seen.smallest.file.size) seen.smallest = { file: f, width };
  return f;
}

// Maior largura (até o teto) que cabe no tamanho pedido, com este nível de compressão.
async function fitLevel(level, target, ceiling) {
  const origW = S.width;
  const top = Math.min(origW, ceiling);
  const atOriginal = top >= origW;

  let r = await attempt(top, level, atOriginal);
  if (r.size <= target) return { width: top, file: r, level };
  if (top <= MIN_W) return null;

  let hi = top;            // sabemos que não cabe
  let lo = MIN_W - 1;      // virtual: o que cabe fica entre lo e hi
  let best = null;
  let w = clamp(Math.round(top * Math.sqrt((target * 0.96) / r.size)), MIN_W, hi - 1);

  for (let i = 0; i < 7; i++) {
    r = await attempt(w, level, false);
    if (r.size <= target) {
      best = { width: w, file: r, level };
      lo = w;
      if (r.size >= target * 0.93) break;     // já está colado no limite
    } else {
      hi = w;
    }
    if (hi - lo <= 2) break;
    let next = Math.round(w * Math.sqrt((target * 0.97) / r.size));
    next = clamp(next, lo + 1, hi - 1);
    if (next === w) next = r.size <= target ? Math.min(hi - 1, w + 1) : Math.max(lo + 1, w - 1);
    w = next;
  }
  return best;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

async function compress() {
  const target = targetBytes();
  if (!S.file) return;
  if (!(target >= 5000)) {
    showError('Informe um tamanho final de pelo menos 5 KB.');
    return;
  }
  const cap = parseInt($('maxw').value, 10);
  const ceiling = cap > 0 ? Math.max(cap, MIN_W) : Infinity;

  showError('');
  S.cancel = false;
  tries = 0;
  seen.smallest = null;
  $('status').textContent = 'Procurando a melhor combinação…';
  $('cancel').disabled = false;
  setState('working');

  try {
    let best = null;
    let prevWidth = 0;
    for (let i = 0; i < LADDER.length; i++) {
      const level = LADDER[i];
      const r = await fitLevel(level, target, ceiling);
      // nem a menor largura coube: os níveis do meio não vão salvar, tenta só o mais forte
      if (!r && i < LADDER.length - 2) i = LADDER.length - 2;
      if (r) {
        const score = r.width * (1 - level.lossy / 500);
        if (!best || score > best.score) best = { ...r, score };
        const goal = Math.min(S.width, ceiling) * 0.7;
        if (r.width >= goal) break;                       // já está nítido o bastante
        if (prevWidth && r.width < prevWidth * 1.12) break; // compressão extra quase não ajuda
        prevWidth = r.width;
      }
    }

    if (!best) {
      const s = seen.smallest;
      showError(`Não consegui chegar em ${fmtBytes(target)} sem deixar o GIF minúsculo. O menor que saiu foi ${fmtBytes(s.file.size)}, com ${s.width} px de largura. Tente um tamanho maior.`);
      setState('ready');
      return;
    }
    await showResult(best, target);
  } catch (err) {
    if (err instanceof Cancelled) {
      setState('ready');
      return;
    }
    console.error(err);
    showError('Algo deu errado ao comprimir. Recarregue a página e tente de novo. Se continuar, o arquivo pode estar corrompido.');
    setState('ready');
  }
}

async function showResult(best, target) {
  let outFile = best.file;
  let alreadyFits = false;
  if (S.file.size <= target && outFile.size >= S.file.size) {
    outFile = S.file;       // otimizar não ajudou e o original já cabe: devolve o original
    alreadyFits = true;
  }

  const head = (await readGifHeader(outFile).catch(() => null)) || { w: best.width, h: 0 };
  if (S.outUrl) URL.revokeObjectURL(S.outUrl);
  S.outUrl = URL.createObjectURL(outFile);

  $('img-before').src = S.origUrl;
  $('img-after').src = S.outUrl;
  $('before-size').textContent = fmtBytes(S.file.size);
  $('before-dim').textContent = `${S.width} × ${S.height} px`;
  $('after-size').textContent = fmtBytes(outFile.size);
  $('after-dim').textContent = `${head.w} × ${head.h} px`;

  const pct = Math.round((1 - outFile.size / S.file.size) * 100);
  if (alreadyFits) {
    $('summary-title').textContent = 'Já estava leve';
    $('summary-note').textContent = `Esse GIF já tem ${fmtBytes(S.file.size)}, dentro dos ${fmtBytes(target)} que você pediu. Não precisa comprimir.`;
  } else {
    $('summary-title').textContent = pct >= 1 ? `${pct}% menor` : 'Otimizado';
    const parts = [];
    if (head.w < S.width) parts.push(`Largura de ${S.width} para ${head.w} px`);
    else parts.push('Mantive o tamanho em pixels');
    if (best.level.label) parts.push(best.level.label);
    $('summary-note').textContent = parts.join(', ') + `. Ficou em ${fmtBytes(outFile.size)}, dentro dos ${fmtBytes(target)}.`;
  }

  const base = S.file.name.replace(/\.gif$/i, '') || 'gif';
  const dl = $('download');
  dl.href = S.outUrl;
  dl.download = `${base}-leve.gif`;

  setState('done');
  window.scrollTo({ top: 0 });
}

$('controls').addEventListener('submit', (e) => { e.preventDefault(); compress(); });
$('cancel').addEventListener('click', () => {
  S.cancel = true;
  $('cancel').disabled = true;
  $('status').textContent = 'Cancelando…';
});
