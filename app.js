'use strict';

/* ─── DOT CANVAS ──────────────────────────────────────────────────────────── */
(function() {
  var c = document.getElementById('canvas');
  if (!c) return;
  var ctx = c.getContext('2d');
  var dots = [], W, H, mouse = { x: -9999, y: -9999 };
  var GAP = 38;

  function build() {
    W = c.width  = window.innerWidth;
    H = c.height = window.innerHeight;
    dots = [];
    for (var r = 0; r * GAP <= H + GAP; r++)
      for (var col = 0; col * GAP <= W + GAP; col++)
        dots.push({ x: col * GAP, y: r * GAP, a: .07 + Math.random() * .08, p: Math.random() * Math.PI * 2, s: .0005 + Math.random() * .0004 });
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var dx = d.x - mouse.x, dy = d.y - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var near = Math.max(0, 1 - dist / 140);
      var pulse = Math.sin(ts * d.s + d.p) * .5 + .5;
      var a = d.a + pulse * .06 + near * .45;
      var r = 1 + near * 2;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,166,35,' + a + ')';
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('mousemove', function(e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseleave', function() { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener('resize', build);
  build();
  requestAnimationFrame(draw);
})();

/* ─── OPERATOR DEFINITIONS ────────────────────────────────────────────────── */
var OPS = {
  string:  [{v:'contains',l:'contains'},{v:'eq',l:'equals'},{v:'neq',l:'not equals'},{v:'ncontains',l:'not contains'},{v:'starts',l:'starts with'},{v:'ends',l:'ends with'},{v:'empty',l:'is empty'},{v:'nempty',l:'not empty'}],
  number:  [{v:'eq',l:'='},{v:'neq',l:'≠'},{v:'gt',l:'>'},{v:'gte',l:'≥'},{v:'lt',l:'<'},{v:'lte',l:'≤'},{v:'empty',l:'is empty'},{v:'nempty',l:'not empty'}],
  boolean: [{v:'istrue',l:'is true'},{v:'isfalse',l:'is false'},{v:'empty',l:'is empty'},{v:'nempty',l:'not empty'}],
  date:    [{v:'eq',l:'on'},{v:'gt',l:'after'},{v:'lt',l:'before'},{v:'contains',l:'contains'},{v:'empty',l:'is empty'},{v:'nempty',l:'not empty'}],
  empty:   [{v:'empty',l:'is empty'},{v:'nempty',l:'not empty'}],
};
var NO_VAL = { empty:1, nempty:1, istrue:1, isfalse:1 };

/* ─── STATE ───────────────────────────────────────────────────────────────── */
var S = {
  headers:[], schema:[], rawRows:[], filteredRows:[],
  filters:[], sortCol:-1, sortAsc:true,
  visibleCols: new Set(), searchQ:'', fid:0,
};

/* ─── DOM ─────────────────────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }

/* ─── WORKER (blob) ───────────────────────────────────────────────────────── */
var WSRC = [
"self.onmessage=function(e){",
"var id=e.data.id,buf=e.data.buffer,t0=Date.now();",
"try{",
"  post('P',id,15,'Decoding\u2026');",
"  var text=new TextDecoder().decode(new Uint8Array(buf));",
"  post('P',id,35,'Parsing JSON\u2026');",
"  var root; try{root=JSON.parse(text);}catch(e){throw new Error('Invalid JSON: '+e.message);}",
"  post('P',id,55,'Analysing\u2026');",
"  var isArr=Array.isArray(root);",
"  var recs=isArr?root:(root&&typeof root==='object'?[root]:[root]);",
"  var total=recs.length;",
"  function flat(v,k,o){",
"    if(v===null||v===undefined){o[k]=null;return;}",
"    if(Array.isArray(v)){",
"      if(v.every(function(x){return typeof x!=='object'||x===null;})){o[k]=v.map(function(x){return x==null?'null':String(x);}).join(', ');}",
"      else v.slice(0,8).forEach(function(x,i){flat(x,k+'.'+i,o);});",
"      return;",
"    }",
"    if(typeof v==='object'){Object.keys(v).forEach(function(j){flat(v[j],k?k+'.'+j:j,o);});return;}",
"    o[k]=v;",
"  }",
"  var ks=Object.create(null),ko=[];",
"  var sm=Math.min(total,5000);",
"  for(var i=0;i<sm;i++){var f=Object.create(null);flat(recs[i],'',f);Object.keys(f).forEach(function(k){if(!ks[k]){ks[k]=1;ko.push(k);}});}",
"  ko.sort();",
"  post('P',id,70,'Building rows\u2026');",
"  var rows=[];",
"  for(var r=0;r<total;r++){var f=Object.create(null);flat(recs[r],'',f);rows.push(ko.map(function(k){var v=f[k];return(v===null||v===undefined)?'':String(v);}));}",
"  post('P',id,85,'Schema\u2026');",
"  function typ(vs){",
"    var ne=vs.filter(function(v){return v!==''&&v!=='null';});",
"    if(!ne.length)return 'empty';",
"    var s=ne.slice(0,120);",
"    if(s.every(function(v){return v==='true'||v==='false';}))return 'boolean';",
"    if(s.every(function(v){return v!==''&&!isNaN(Number(v));}))return 'number';",
"    if(s.every(function(v){return /^\\d{4}-\\d{2}-\\d{2}/.test(v);}))return 'date';",
"    return 'string';",
"  }",
"  var tn=0,schema=ko.map(function(col,ci){",
"    var vs=rows.map(function(r){return r[ci];});",
"    var nc=vs.filter(function(v){return v===''||v==='null';}).length;",
"    tn+=nc;",
"    var np=total>0?Math.round(nc/total*100):0;",
"    var t=typ(vs);",
"    var uq=new Set(vs.slice(0,10000));",
"    var seen=new Set(),samp=[];",
"    for(var i=0;i<vs.length&&samp.length<5;i++){var v=vs[i];if(v&&v!=='null'&&!seen.has(v)){seen.add(v);samp.push(v);}}",
"    return{name:col,type:t,nullCount:nc,nullPct:np,uniqueCount:uq.size,samples:samp};",
"  });",
"  var fsz=buf.byteLength;",
"  var flab=fsz<1048576?(fsz/1024).toFixed(1)+' KB':(fsz/1048576).toFixed(1)+' MB';",
"  var npt=rows.length&&ko.length?Math.round(tn/(rows.length*ko.length)*100):0;",
"  self.postMessage({type:'R',id:id,result:{headers:ko,rows:rows,schema:schema,totalRows:total,fileSize:flab,isArray:isArr,nullPctTotal:npt,elapsed:Date.now()-t0}});",
"}catch(e){self.postMessage({type:'E',id:id,error:e.message});}",
"function post(t,id,p,m){self.postMessage({type:t,id:id,pct:p,msg:m});}",
"};"
].join('\n');

var worker = null, msgId = 0;

function initWorker() {
  if (worker) return;
  try {
    var blob = new Blob([WSRC], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = onMsg;
    worker.onerror   = function(e) { showErr('Worker error: ' + e.message); };
  } catch(e) {
    showErr('Open via HTTP (not file://). ' + e.message);
  }
}

function onMsg(e) {
  var d = e.data;
  if (d.type === 'P') { setProgress(d.pct, d.msg); }
  else if (d.type === 'R') { renderResult(d.result); }
  else if (d.type === 'E') { showErr(d.error); }
}

/* ─── INPUT MODE ──────────────────────────────────────────────────────────── */
window.setMode = function(m) {
  var isDrop = m === 'drop';
  $('tab-drop').classList.toggle('on', isDrop);
  $('tab-paste').classList.toggle('on', !isDrop);
  $('dropzone').style.display  = isDrop ? '' : 'none';
  $('pastezone').style.display = isDrop ? 'none' : '';
  if (!isDrop) setTimeout(function() { $('paste-ta').focus(); }, 40);
};

/* ─── FILE DROP/PICK ──────────────────────────────────────────────────────── */
var dz = $('dropzone');

$('pick-btn').addEventListener('click', function(e) {
  e.stopPropagation();
  $('file-in').click();
});

$('file-in').addEventListener('change', function() {
  if (this.files[0]) loadFile(this.files[0]);
});

dz.addEventListener('click', function() { $('file-in').click(); });
dz.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') $('file-in').click(); });
dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', function() { dz.classList.remove('over'); });
dz.addEventListener('drop', function(e) {
  e.preventDefault(); dz.classList.remove('over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

async function loadFile(f) {
  clearErr(); initWorker();
  setProgress(5, 'Reading file\u2026');
  try {
    var buf = await f.arrayBuffer();
    setProgress(12, 'Sending to engine\u2026');
    worker.postMessage({ id: ++msgId, buffer: buf }, [buf]);
  } catch(e) { showErr('Cannot read file: ' + e.message); }
}

/* ─── PASTE ───────────────────────────────────────────────────────────────── */
var pasteTA     = $('paste-ta');
var pasteStatus = $('paste-status');

pasteTA.addEventListener('input', function() {
  var v = pasteTA.value.trim();
  if (!v) { pasteStatus.textContent = ''; return; }
  try {
    JSON.parse(v);
    pasteStatus.textContent = 'Valid JSON ✓';
    pasteStatus.style.color = 'var(--amber)';
  } catch(_) {
    pasteStatus.textContent = 'Invalid JSON';
    pasteStatus.style.color = 'var(--red)';
  }
});

pasteTA.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') window.parsePaste();
});

window.parsePaste = function() {
  var raw = pasteTA.value.trim();
  if (!raw) { showErr('Paste some JSON first.'); return; }
  clearErr(); initWorker();
  setProgress(5, 'Encoding\u2026');
  try {
    var buf = new TextEncoder().encode(raw).buffer;
    setProgress(12, 'Sending to engine\u2026');
    worker.postMessage({ id: ++msgId, buffer: buf }, [buf]);
  } catch(e) { showErr('Cannot encode text: ' + e.message); }
};

/* ─── RENDER RESULT ───────────────────────────────────────────────────────── */
function renderResult(res) {
  S.headers     = res.headers;
  S.schema      = res.schema;
  S.rawRows     = res.rows;
  S.visibleCols = new Set(res.headers);
  S.filters     = []; S.sortCol = -1; S.sortAsc = true; S.searchQ = '';

  $('s-rows').textContent  = res.totalRows.toLocaleString();
  $('s-cols').textContent  = res.headers.length;
  $('s-size').textContent  = res.fileSize;
  $('s-time').textContent  = res.elapsed + ' ms';
  $('s-nulls').textContent = res.nullPctTotal + '%';

  if (res.totalRows > 50000) {
    $('warnbar').textContent = res.totalRows.toLocaleString() + ' rows loaded. Virtual scroll keeps the UI smooth.';
    $('warnbar').classList.add('on');
  } else {
    $('warnbar').classList.remove('on');
  }

  buildSchema(res.schema, res.totalRows);
  buildColMenu();
  filterAndSort();
  hideProg();
  $('hero').style.display   = 'none';
  $('footer').style.display = 'none';
  $('results').classList.add('on');
}

/* ─── SCHEMA ──────────────────────────────────────────────────────────────── */
function buildSchema(schema, total) {
  $('schema-info').innerHTML = '<b>' + schema.length + '</b> columns &nbsp;&middot;&nbsp; <b>' + total.toLocaleString() + '</b> rows';
  var grid = $('schema-grid');
  grid.innerHTML = '';
  schema.forEach(function(col, ci) {
    var card = document.createElement('div');
    card.className = 'cc fu';
    card.style.animationDelay = Math.min(ci * .025, .5) + 's';
    var nullBit = col.nullPct > 0
      ? '<div class="cc-bar"><div class="cc-bar-fill" style="width:' + col.nullPct + '%"></div></div>'
      : '';
    var nullStat = col.nullPct > 0
      ? '<span class="cc-null-bad">' + col.nullPct + '% null</span>'
      : '<span class="cc-complete">complete</span>';
    card.innerHTML =
      '<div class="cc-top">' +
        '<span class="cc-name" title="' + esc(col.name) + '">' + esc(col.name) + '</span>' +
        '<span class="cc-type t-' + col.type + '">' + col.type + '</span>' +
      '</div>' +
      '<div class="cc-stats"><span>' + col.uniqueCount.toLocaleString() + ' unique</span>' + nullStat + '</div>' +
      nullBit +
      '<div class="cc-samples">' + col.samples.slice(0,3).map(function(s) { return '<div class="cc-sample">' + esc(String(s)) + '</div>'; }).join('') + '</div>' +
      '<div class="cc-hint"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="5" r="3.5"/><path d="M8 8l2.5 2.5"/></svg> Filter this column</div>';
    card.addEventListener('click', function() { addFilter(ci); switchTab('data'); });
    grid.appendChild(card);
  });
}

/* ─── TABS ────────────────────────────────────────────────────────────────── */
window.switchTab = function(name) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('on', t.dataset.tab === name); });
  $('pane-schema').classList.toggle('on', name === 'schema');
  $('pane-data').classList.toggle('on', name === 'data');
  if (name === 'data') renderVisible();
};

/* ─── FILTERS ─────────────────────────────────────────────────────────────── */
window.addFilter = function(colIdx) {
  var fid = ++S.fid;
  var ci  = colIdx != null ? colIdx : 0;
  var sch = S.schema[ci] || { type: 'string' };
  var ops = OPS[sch.type] || OPS.string;

  var row = document.createElement('div');
  row.className = 'frow'; row.dataset.fid = fid;

  var csel = document.createElement('select'); csel.className = 'fs-col';
  S.headers.forEach(function(h, i) {
    var o = document.createElement('option'); o.value = i; o.textContent = h;
    if (i === ci) o.selected = true;
    csel.appendChild(o);
  });

  var osel = document.createElement('select'); osel.className = 'fs-op';
  ops.forEach(function(op) { var o = document.createElement('option'); o.value = op.v; o.textContent = op.l; osel.appendChild(o); });

  var vin = document.createElement('input'); vin.className = 'fval';
  vin.placeholder = 'value\u2026'; vin.type = sch.type === 'number' ? 'number' : 'text';
  if (NO_VAL[ops[0].v]) vin.classList.add('h');

  var rem = document.createElement('button'); rem.className = 'frem'; rem.title = 'Remove';
  rem.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

  row.appendChild(csel); row.appendChild(osel); row.appendChild(vin); row.appendChild(rem);
  $('filter-rows').appendChild(row);
  S.filters.push({ id: fid, colIdx: ci, op: ops[0].v, val: '', type: sch.type });

  function sync() {
    var f = S.filters.find(function(x) { return x.id === fid; });
    if (!f) return;
    f.colIdx = parseInt(csel.value); f.op = osel.value; f.val = vin.value;
    f.type = S.schema[f.colIdx] ? S.schema[f.colIdx].type : 'string';
    filterAndSort();
  }

  csel.addEventListener('change', function() {
    var t = S.schema[parseInt(csel.value)] ? S.schema[parseInt(csel.value)].type : 'string';
    var newOps = OPS[t] || OPS.string;
    osel.innerHTML = '';
    newOps.forEach(function(op) { var o = document.createElement('option'); o.value = op.v; o.textContent = op.l; osel.appendChild(o); });
    vin.type = t === 'number' ? 'number' : 'text';
    vin.classList.toggle('h', !!NO_VAL[osel.value]);
    sync();
  });
  osel.addEventListener('change', function() { vin.classList.toggle('h', !!NO_VAL[osel.value]); sync(); });
  vin.addEventListener('input', sync);
  vin.addEventListener('keydown', function(e) { if (e.key === 'Enter') filterAndSort(); });
  rem.addEventListener('click', function() {
    S.filters = S.filters.filter(function(x) { return x.id !== fid; });
    row.remove(); updateFilterUI(); filterAndSort();
  });

  updateFilterUI();
  if (!NO_VAL[ops[0].v]) vin.focus();
};

window.clearFilters = function() {
  S.filters = []; $('filter-rows').innerHTML = '';
  updateFilterUI(); filterAndSort();
};

function updateFilterUI() {
  var n = S.filters.length;
  $('filter-count').textContent = n;
  $('filter-count').classList.toggle('on', n > 0);
  $('clear-filters-btn').style.display = n > 0 ? '' : 'none';
}

function match(cell, op, val, type) {
  var empty = cell === '' || cell === 'null';
  if (op === 'empty')   return empty;
  if (op === 'nempty')  return !empty;
  if (op === 'istrue')  return cell === 'true';
  if (op === 'isfalse') return cell === 'false';
  if (empty) return false;
  if (type === 'number') {
    var n = parseFloat(cell), fv = parseFloat(val);
    if (isNaN(n)) return false;
    if (op==='eq')  return n===fv; if (op==='neq') return n!==fv;
    if (op==='gt')  return n>fv;   if (op==='gte') return n>=fv;
    if (op==='lt')  return n<fv;   if (op==='lte') return n<=fv;
  }
  var c = cell.toLowerCase(), v = (val||'').toLowerCase();
  if (op==='eq')       return c===v;
  if (op==='neq')      return c!==v;
  if (op==='contains') return c.includes(v);
  if (op==='ncontains')return !c.includes(v);
  if (op==='starts')   return c.startsWith(v);
  if (op==='ends')     return c.endsWith(v);
  if (op==='gt')       return c>v;
  if (op==='lt')       return c<v;
  return true;
}

/* ─── FILTER + SORT + SEARCH ──────────────────────────────────────────────── */
function filterAndSort() {
  var q = S.searchQ.trim().toLowerCase();
  var rows = S.rawRows;

  if (S.filters.length)
    rows = rows.filter(function(r) {
      return S.filters.every(function(f) { return match(r[f.colIdx]||'', f.op, f.val, f.type); });
    });

  if (q)
    rows = rows.filter(function(r) { return r.some(function(c) { return c.toLowerCase().includes(q); }); });

  if (S.sortCol >= 0) {
    var ci = S.sortCol, asc = S.sortAsc;
    rows = rows.slice().sort(function(a, b) {
      var av = a[ci]||'', bv = b[ci]||'';
      var an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return asc ? an-bn : bn-an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }
  S.filteredRows = rows;
  rebuildTable();
}

/* ─── TABLE ───────────────────────────────────────────────────────────────── */
window.sortBy = function(ci) {
  S.sortAsc = S.sortCol === ci ? !S.sortAsc : true;
  S.sortCol = ci;
  buildHead(); filterAndSort();
};

function buildHead() {
  var h = $('tbl-head'); h.innerHTML = '';
  var rn = document.createElement('div'); rn.className = 'th rn'; rn.textContent = '#'; h.appendChild(rn);
  S.headers.forEach(function(hdr, ci) {
    if (!S.visibleCols.has(hdr)) return;
    var th = document.createElement('div'); th.className = 'th';
    if (S.sortCol === ci) th.classList.add(S.sortAsc ? 'asc' : 'desc');
    th.textContent = hdr; th.title = hdr;
    th.addEventListener('click', function() { window.sortBy(ci); });
    h.appendChild(th);
  });
}

function buildColMenu() {
  var m = $('col-menu'); m.innerHTML = '';
  S.headers.forEach(function(hdr) {
    var item = document.createElement('label'); item.className = 'col-item';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
    cb.addEventListener('change', function() {
      if (cb.checked) S.visibleCols.add(hdr); else S.visibleCols.delete(hdr);
      buildHead(); rebuildTable();
    });
    item.appendChild(cb); item.appendChild(document.createTextNode(hdr));
    m.appendChild(item);
  });
}

/* ─── VIRTUAL SCROLL ──────────────────────────────────────────────────────── */
var ROW_H = 30, BUF = 8;

function rebuildTable() {
  buildHead();
  var v = $('virt'), n = S.filteredRows.length;
  v.innerHTML = ''; v.style.height = n * ROW_H + 'px';
  $('empty-tbl').classList.toggle('on', n === 0);
  $('row-count').textContent = n.toLocaleString() + (n !== S.rawRows.length ? ' of ' + S.rawRows.length.toLocaleString() : '') + ' rows';
  var tw = $('tbl-wrap');
  tw.removeEventListener('scroll', renderVisible);
  tw.addEventListener('scroll', renderVisible, { passive: true });
  tw.scrollTop = 0;
  renderVisible();
}

function renderVisible() {
  var tw = $('tbl-wrap');
  var st = tw.scrollTop, ch = tw.clientHeight;
  var start = Math.max(0, Math.floor(st / ROW_H) - BUF);
  var end   = Math.min(S.filteredRows.length, Math.ceil((st + ch) / ROW_H) + BUF);
  var v = $('virt');

  v.querySelectorAll('.vrow').forEach(function(el) {
    var i = +el.dataset.i;
    if (i < start || i >= end) el.remove();
  });

  var existing = new Set();
  v.querySelectorAll('.vrow').forEach(function(el) { existing.add(+el.dataset.i); });

  var frag = document.createDocumentFragment();
  for (var i = start; i < end; i++) {
    if (!existing.has(i)) frag.appendChild(makeRow(i));
  }
  v.appendChild(frag);
}

function makeRow(idx) {
  var cells = S.filteredRows[idx];
  var row = document.createElement('div');
  row.className = 'vrow'; row.dataset.i = idx;
  row.style.top = idx * ROW_H + 'px';
  var rn = document.createElement('div'); rn.className = 'td rn'; rn.textContent = idx + 1; row.appendChild(rn);
  S.headers.forEach(function(h, ci) {
    if (!S.visibleCols.has(h)) return;
    var v = cells[ci] || '', td = document.createElement('div'); td.className = 'td';
    if (!v || v === 'null')                          td.classList.add('tnl');
    else if (v === 'true')                           td.classList.add('tbt');
    else if (v === 'false')                          td.classList.add('tbf');
    else if (!isNaN(Number(v)) && v.trim() !== '')  td.classList.add('tn');
    td.textContent = v; td.title = v; row.appendChild(td);
  });
  return row;
}

/* ─── SEARCH ──────────────────────────────────────────────────────────────── */
var stimer;
$('search-in').addEventListener('input', function() {
  clearTimeout(stimer);
  var val = this.value;
  stimer = setTimeout(function() { S.searchQ = val; filterAndSort(); }, 180);
});

/* ─── DROPDOWNS ───────────────────────────────────────────────────────────── */
window.toggleColMenu = function() { $('col-menu').classList.toggle('on'); $('exp-menu').classList.remove('on'); };
window.toggleExpMenu = function() { $('exp-menu').classList.toggle('on'); $('col-menu').classList.remove('on'); };

document.addEventListener('click', function(e) {
  if (!$('col-wrap').contains(e.target)) $('col-menu').classList.remove('on');
  if (!$('exp-wrap').contains(e.target)) $('exp-menu').classList.remove('on');
});

/* ─── EXPORT ──────────────────────────────────────────────────────────────── */
window.doExport = function(fmt) {
  $('exp-menu').classList.remove('on');
  var visH = S.headers.filter(function(h) { return S.visibleCols.has(h); });
  var visI = S.headers.map(function(h, i) { return S.visibleCols.has(h) ? i : -1; }).filter(function(i) { return i >= 0; });
  var rows = S.filteredRows.map(function(r) { return visI.map(function(i) { return r[i] || ''; }); });

  var blob;
  if (fmt === 'csv') {
    function ec(c) { var s = String(c||''); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; }
    blob = new Blob([[visH.map(ec).join(',')].concat(rows.map(function(r){return r.map(ec).join(',');})).join('\r\n')], { type: 'text/csv' });
    dl(blob, 'boltjson-export.csv');
  } else {
    var objs = rows.map(function(r) { var o = {}; visH.forEach(function(h,i) { o[h] = r[i]||null; }); return o; });
    blob = new Blob([JSON.stringify(objs, null, 2)], { type: 'application/json' });
    dl(blob, 'boltjson-export.json');
  }
};

function dl(blob, name) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  toast('Exported ' + name);
}

/* ─── TOAST ───────────────────────────────────────────────────────────────── */
var ttimer;
function toast(msg) {
  var el = $('toast'); el.querySelector('span').textContent = msg;
  el.classList.add('on'); clearTimeout(ttimer);
  ttimer = setTimeout(function() { el.classList.remove('on'); }, 2500);
}

/* ─── RESET ───────────────────────────────────────────────────────────────── */
window.resetApp = function() {
  $('results').classList.remove('on');
  $('hero').style.display = '';
  $('footer').style.display = '';
  $('warnbar').classList.remove('on');
  S.headers=[]; S.schema=[]; S.rawRows=[]; S.filteredRows=[]; S.filters=[];
  $('schema-grid').innerHTML=''; $('filter-rows').innerHTML='';
  $('tbl-head').innerHTML=''; $('virt').innerHTML=''; $('col-menu').innerHTML='';
  $('file-in').value=''; $('search-in').value=''; S.searchQ='';
  if (pasteTA) { pasteTA.value=''; pasteStatus.textContent=''; }
  updateFilterUI(); clearErr(); hideProg();
  window.setMode('drop');
};

/* ─── KEYBOARD ────────────────────────────────────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && $('results').classList.contains('on')) {
    if ($('col-menu').classList.contains('on')) { $('col-menu').classList.remove('on'); return; }
    if ($('exp-menu').classList.contains('on')) { $('exp-menu').classList.remove('on'); return; }
    $('search-in').focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && $('results').classList.contains('on')) {
    e.preventDefault(); window.switchTab('data'); $('search-in').focus();
  }
});

window.addEventListener('resize', renderVisible);

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function showErr(m)  { hideProg(); $('errbox').innerHTML = '<b>Error:</b> ' + esc(m); $('errbox').classList.add('on'); }
function clearErr()  { $('errbox').textContent = ''; $('errbox').classList.remove('on'); }
function setProgress(p, m) { $('prog').classList.add('on'); $('prog-fill').style.width = p + '%'; if (m) $('prog-msg').textContent = m; }
function hideProg()  { $('prog').classList.remove('on'); }
function esc(s)      { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ─── BOOT ────────────────────────────────────────────────────────────────── */
initWorker();