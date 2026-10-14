(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;

  var fileInput = $('fileInput'), selectBtn = $('selectBtn'), dropzone = $('dropzone');
  var preview = $('preview'), previewSection = $('previewSection');
  var fileInfo = $('fileInfo'), outInfo = $('outInfo'), savedInfo = $('savedInfo');
  var convertBtn = $('convertBtn'), downloadBtn = $('downloadBtn');
  var statusEl = $('status'), resultsEl = $('results');
  var formatSelect = $('formatSelect'), qualityInput = $('quality');
  var qualityVal = $('qualityVal'), optionsEl = $('options'), qualityWrap = $('qualityWrap');

  var MAX_FILES = 50;
  var EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
  var LABEL = { 'image/webp': 'WebP', 'image/jpeg': 'JPG', 'image/png': 'PNG' };

  var files = [];
  var urls = [];          // object URLs to revoke on next selection
  var busy = false;

  /* ---------- helpers ---------- */

  function fmtSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !!isError);
    statusEl.classList.toggle('hidden', !msg);
  }

  function track(url) { urls.push(url); return url; }

  function revokeAll() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
  }

  function targetFor(file) {
    var sel = formatSelect ? formatSelect.value : (body.dataset.format || 'image/webp');
    if (sel === 'auto') return file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    return sel;
  }

  function quality() {
    if (qualityInput) return Math.min(1, Math.max(0.1, parseInt(qualityInput.value, 10) / 100));
    var q = body.dataset.quality ? parseFloat(body.dataset.quality) : 0.85;
    return isNaN(q) ? 0.85 : q;
  }

  function baseName(name) {
    var n = name.replace(/\.[^.]+$/, '');
    return n || 'image';
  }

  function outName(file, type) {
    var suffix = body.dataset.mode === 'compress' ? '-compressed' : '';
    return baseName(file.name) + suffix + '.' + EXT[type];
  }

  function isLossy(type) { return type === 'image/webp' || type === 'image/jpeg'; }

  function syncQualityVisibility() {
    if (!qualityWrap) return;
    var type = formatSelect ? formatSelect.value : (body.dataset.format || 'image/webp');
    var lossy = type === 'auto' || isLossy(type);
    qualityWrap.classList.toggle('hidden', !lossy);
  }

  function resetOutput() {
    if (!files.length) return;
    downloadBtn.classList.add('hidden');
    convertBtn.classList.remove('hidden');
    convertBtn.disabled = false;
    outInfo.textContent = '';
    savedInfo.textContent = '';
    if (resultsEl) { resultsEl.textContent = ''; resultsEl.classList.add('hidden'); }
    setStatus('');
  }

  /* ---------- file selection ---------- */

  function handleFiles(list) {
    if (busy) return;
    var picked = Array.prototype.slice.call(list || []);
    if (!picked.length) return;

    var images = picked.filter(function (f) { return f.type && f.type.indexOf('image/') === 0; });
    var skipped = picked.length - images.length;
    if (!images.length) {
      setStatus('That file is not an image. Choose a PNG, JPG or WebP file.', true);
      return;
    }
    var msg = '';
    if (images.length > MAX_FILES) {
      images = images.slice(0, MAX_FILES);
      msg = 'Only the first ' + MAX_FILES + ' images were added. ';
    }
    if (skipped) msg += skipped + ' non-image file(s) skipped.';

    revokeAll();
    files = images;

    var total = files.reduce(function (s, f) { return s + f.size; }, 0);
    preview.src = track(URL.createObjectURL(files[0]));
    fileInfo.textContent = files.length === 1
      ? 'Original: ' + fmtSize(total)
      : files.length + ' images selected, ' + fmtSize(total) + ' in total';
    outInfo.textContent = '';
    savedInfo.textContent = '';
    if (resultsEl) { resultsEl.textContent = ''; resultsEl.classList.add('hidden'); }
    downloadBtn.classList.add('hidden');
    convertBtn.classList.remove('hidden');
    convertBtn.disabled = false;
    previewSection.classList.remove('hidden');
    setStatus(msg.trim(), false);
  }

  selectBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) {
    var list = Array.prototype.slice.call(e.target.files || []);
    fileInput.value = '';
    handleFiles(list);
  });

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });
  }

  if (formatSelect) formatSelect.addEventListener('change', function () { syncQualityVisibility(); resetOutput(); });
  if (qualityInput) {
    qualityInput.addEventListener('input', function () {
      if (qualityVal) qualityVal.textContent = qualityInput.value + '%';
    });
    qualityInput.addEventListener('change', resetOutput);
  }
  syncQualityVisibility();
  if (qualityInput && qualityVal) qualityVal.textContent = qualityInput.value + '%';

  /* ---------- conversion ---------- */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('could not be read as an image')); };
      img.src = url;
    });
  }

  function encode(img, type, q) {
    return new Promise(function (resolve, reject) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) { reject(new Error('has no readable size')); return; }
      if (type === 'image/webp' && (w > 16383 || h > 16383)) {
        reject(new Error('is larger than the 16,383 px per side limit of the WebP format'));
        return;
      }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('is too large for this browser')); return; }
      if (type === 'image/jpeg') {            // JPG has no transparency: avoid a black background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(function (blob) {
        if (!blob) { reject(new Error('is too large for this browser to convert')); return; }
        if (blob.type !== type) {
          reject(new Error('could not be saved as ' + LABEL[type] + ' because this browser cannot create ' + LABEL[type] + ' files. Try Chrome, Edge or Firefox'));
          return;
        }
        resolve(blob);
      }, type, isLossy(type) ? q : undefined);
    });
  }

  function crcTable() {
    var t = [], n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  }
  var CRC = null;
  function crc32(buf) {
    if (!CRC) CRC = crcTable();
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Minimal "stored" (no compression) ZIP writer: images are already compressed.
  function makeZip(entries) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, e.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true);
      ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  function uniqueName(name, used) {
    if (!used[name]) { used[name] = 1; return name; }
    var dot = name.lastIndexOf('.'), base = name.slice(0, dot), ext = name.slice(dot), i = 1, n;
    do { n = base + '-' + i + ext; i++; } while (used[n]);
    used[n] = 1;
    return n;
  }

  function savingText(orig, out, type) {
    var pct = ((orig - out) / orig) * 100;
    if (pct >= 0) return 'Saved: ' + pct.toFixed(1) + '%';
    var s = 'Larger than the original: +' + Math.abs(pct).toFixed(1) + '%';
    if (type === 'image/png') s += ' (PNG is lossless, so photos usually grow)';
    else if (body.dataset.mode === 'compress') s += ' (this image is already well optimized; try a lower quality)';
    return s;
  }

  convertBtn.addEventListener('click', async function () {
    if (busy || !files.length) return;
    busy = true;
    convertBtn.disabled = true;
    setStatus('');

    var q = quality(), done = [], errors = [], used = {};
    for (var i = 0; i < files.length; i++) {
      var f = files[i], type = targetFor(f);
      setStatus('Converting ' + (i + 1) + ' of ' + files.length + '...', false);
      try {
        var img = await loadImage(f);
        var blob = await encode(img, type, q);
        done.push({ file: f, type: type, blob: blob, name: uniqueName(outName(f, type), used) });
      } catch (err) {
        errors.push(f.name + ' ' + err.message + '.');
      }
    }

    busy = false;
    convertBtn.disabled = false;

    if (!done.length) {
      setStatus(errors.join(' '), true);
      return;
    }

    var origTotal = done.reduce(function (s, r) { return s + r.file.size; }, 0);
    var outTotal = done.reduce(function (s, r) { return s + r.blob.size; }, 0);
    outInfo.textContent = (done.length === 1 ? 'Output: ' : 'Output total: ') + fmtSize(outTotal);
    savedInfo.textContent = savingText(origTotal, outTotal, done.length === 1 ? done[0].type : '');

    if (done.length === 1) {
      downloadBtn.href = track(URL.createObjectURL(done[0].blob));
      downloadBtn.setAttribute('download', done[0].name);
      downloadBtn.textContent = 'Download ' + done[0].name;
      if (resultsEl) { resultsEl.textContent = ''; resultsEl.classList.add('hidden'); }
    } else {
      var entries = await Promise.all(done.map(async function (r) {
        return { name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) };
      }));
      downloadBtn.href = track(URL.createObjectURL(makeZip(entries)));
      downloadBtn.setAttribute('download', body.dataset.mode === 'compress' ? 'compressed-images.zip' : 'converted-images.zip');
      downloadBtn.textContent = 'Download all (' + done.length + ' files, ZIP)';
      if (resultsEl) {
        resultsEl.textContent = '';
        done.forEach(function (r) {
          var li = document.createElement('li');
          var span = document.createElement('span');
          span.textContent = r.name + ' (' + fmtSize(r.blob.size) + ')';
          var a = document.createElement('a');
          a.href = track(URL.createObjectURL(r.blob));
          a.setAttribute('download', r.name);
          a.textContent = 'Download';
          li.appendChild(span); li.appendChild(a);
          resultsEl.appendChild(li);
        });
        resultsEl.classList.remove('hidden');
      }
    }
    downloadBtn.classList.remove('hidden');
    convertBtn.classList.add('hidden');
    setStatus(errors.length ? 'Some files were skipped: ' + errors.join(' ') : '', errors.length > 0);
  });
})();
