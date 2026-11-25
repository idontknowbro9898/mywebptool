'use strict';

// Local conversion only. No file or filename is sent to a server.
(() => {
  const $ = selector => document.querySelector(selector);
  const input = $('#fileInput');
  if (!input) return;
  const quality = $('#quality');
  const format = $('#outputFormat');
  const width = $('#maxWidth');
  const convertButton = $('#convertBtn');
  const clearButton = $('#clearBtn');
  const zipButton = $('#zipBtn');
  const results = $('#results');
  const status = $('#status');
  const selection = $('#selection');
  const dropzone = $('#dropzone');
  const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const MB = 1024 * 1024;
  let files = [];
  let outputs = [];
  let urls = [];
  let busy = false;
  let zipUrl = null;

  function bytes(value) {
    if (value < 1024) return `${value} B`;
    return value < MB ? `${(value / 1024).toFixed(1)} KB` : `${(value / MB).toFixed(2)} MB`;
  }

  function typeOf(file) {
    if (file.type) return file.type;
    const extension = file.name.split('.').pop().toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension] || '';
  }

  function outputType(file) {
    const value = format ? format.value : document.body.dataset.format;
    return value === 'original' ? typeOf(file) : value;
  }

  function resetResults() {
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
    outputs = [];
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = null;
    results.replaceChildren();
    zipButton.hidden = true;
    status.textContent = '';
  }

  function updateQuality() {
    const value = format ? format.value : document.body.dataset.format;
    quality.disabled = busy || value === 'image/png' || (value === 'original' && files.length > 0 && files.every(file => typeOf(file) === 'image/png'));
    $('#qualityVal').textContent = quality.disabled && !busy ? 'Not used for PNG' : `${quality.value}%`;
  }

  function controls() {
    input.disabled = busy;
    if (format) format.disabled = busy;
    width.disabled = busy;
    clearButton.disabled = busy || !files.length;
    convertButton.disabled = busy || !files.length;
    zipButton.disabled = busy;
    updateQuality();
  }

  function choose(list) {
    if (busy) return;
    resetResults();
    files = [];
    const incoming = Array.from(list);
    const acceptedTypes = input.accept.split(',');
    const error = incoming.length > 20 ? 'Choose no more than 20 images at once.' :
      incoming.some(file => !TYPES.includes(typeOf(file)) || !acceptedTypes.includes(typeOf(file))) ? 'Choose only the image formats accepted by this tool.' :
      incoming.some(file => !file.size || file.size > 25 * MB) ? 'Each image must be non-empty and no larger than 25 MB.' :
      incoming.reduce((total, file) => total + file.size, 0) > 100 * MB ? 'The combined input must be no larger than 100 MB.' : '';
    if (error) {
      status.textContent = error;
      input.value = '';
    } else {
      files = incoming;
    }
    selection.textContent = files.length ? `${files.length} image${files.length === 1 ? '' : 's'} selected (${bytes(files.reduce((sum, file) => sum + file.size, 0))}): ${files.map(file => file.name).join(', ')}` : 'No images selected.';
    controls();
  }

  input.addEventListener('change', () => choose(input.files));
  clearButton.addEventListener('click', () => { choose([]); input.value = ''; });
  [quality, format, width].filter(Boolean).forEach(control => control.addEventListener('input', () => {
    if (!busy) { resetResults(); controls(); }
  }));
  ['dragenter', 'dragover'].forEach(event => dropzone.addEventListener(event, e => {
    e.preventDefault();
    if (!busy) dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(event => dropzone.addEventListener(event, e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  }));
  dropzone.addEventListener('drop', event => choose(event.dataTransfer.files));

  async function convert(file, mime, q, maxWidth) {
    const source = URL.createObjectURL(file);
    const image = new Image();
    let canvas;
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('This file could not be decoded as an image.'));
        image.src = source;
      });
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      if (!w || !h || w > 16383 || h > 16383 || w * h > 24000000) {
        throw new Error('Image dimensions exceed 16,383 pixels per side or 24 megapixels. Resize the source before using this tool.');
      }
      const ratio = maxWidth ? Math.min(1, maxWidth / w) : 1;
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The browser could not allocate image memory. Try a smaller image.');
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => {
        if (!value) reject(new Error('The browser could not encode this image.'));
        else if (value.type !== mime) reject(new Error('This browser does not support the selected output format. Try another format or browser.'));
        else resolve(value);
      }, mime, q));
      if (blob.size > 50 * MB) throw new Error('Output exceeds 50 MB. Try a smaller maximum width.');
      return { blob, width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(source);
      image.src = '';
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  function showError(file, message) {
    const paragraph = document.createElement('p');
    paragraph.className = 'notice';
    paragraph.textContent = `${file.name}: ${message}`;
    results.append(paragraph);
  }

  function showResult(file, result, index) {
    const mime = result.blob.type;
    const extension = mime.split('/')[1].replace('jpeg', 'jpg');
    const stem = file.name.replace(/\.[^/.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'image';
    const filename = `${String(index + 1).padStart(2, '0')}-${stem}.${extension}`;
    const url = URL.createObjectURL(result.blob);
    urls.push(url);
    outputs.push({ blob: result.blob, name: filename });
    const article = document.createElement('article');
    article.className = 'result';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `Converted preview of ${file.name}`;
    image.width = 160;
    image.height = 160;
    image.loading = 'lazy';
    const meta = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = file.name;
    const details = document.createElement('p');
    const change = (1 - result.blob.size / file.size) * 100;
    details.textContent = `${bytes(file.size)} → ${bytes(result.blob.size)} (${change >= 0 ? `${change.toFixed(1)}% smaller` : `${Math.abs(change).toFixed(1)}% larger`}). ${result.width} × ${result.height} pixels, ${extension.toUpperCase()}.`;
    const link = document.createElement('a');
    link.className = 'btn ghost';
    link.href = url;
    link.download = filename;
    link.textContent = `Download ${filename}`;
    meta.append(heading, details, link);
    article.append(image, meta);
    results.append(article);
  }

  convertButton.addEventListener('click', async () => {
    if (busy || !files.length) return;
    if (!width.checkValidity()) { width.reportValidity(); return; }
    resetResults();
    busy = true;
    controls();
    results.setAttribute('aria-busy', 'true');
    const q = Number(quality.value) / 100;
    const maxWidth = Number(width.value) || 0;
    let totalOutput = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Converting image ${i + 1} of ${files.length}…`;
        try {
          const result = await convert(files[i], outputType(files[i]), q, maxWidth);
          if (totalOutput + result.blob.size > 150 * MB) throw new Error('Combined output would exceed 150 MB. Use a smaller batch or output dimensions.');
          totalOutput += result.blob.size;
          showResult(files[i], result, i);
        } catch (error) {
          showError(files[i], error.message || 'Conversion failed. Try a smaller file.');
        }
      }
      status.textContent = `${outputs.length} of ${files.length} images converted. ${files.length - outputs.length} failed. Originals have not been changed.`;
      zipButton.hidden = outputs.length < 2;
    } finally {
      busy = false;
      results.setAttribute('aria-busy', 'false');
      controls();
    }
  });

  // ZIP method 0 (stored): image data is already encoded. UTF-8 filenames and CRC-32.
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function zip(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    let centralSize = 0;
    for (const entry of entries) {
      const name = new TextEncoder().encode(entry.name);
      const data = new Uint8Array(await entry.blob.arrayBuffer());
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true);
      l.setUint16(12, 33, true); // DOS date: 1980-01-01
      l.setUint32(14, crc, true);
      l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, entry.blob);
      const record = new Uint8Array(46 + name.length);
      const c = new DataView(record.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(14, 33, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      record.set(name, 46);
      central.push(record);
      centralSize += record.length;
      offset += local.length + data.length;
    }
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  zipButton.addEventListener('click', async () => {
    if (busy || !outputs.length) return;
    busy = true;
    controls();
    status.textContent = 'Preparing ZIP on your device…';
    try {
      if (zipUrl) URL.revokeObjectURL(zipUrl);
      zipUrl = URL.createObjectURL(await zip(outputs));
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = 'myimgconvert-images.zip';
      document.body.append(link);
      link.click();
      link.remove();
      status.textContent = 'ZIP download prepared. If your browser asks, allow the download.';
    } catch (error) {
      status.textContent = 'ZIP could not be prepared. Download files individually or try a smaller batch.';
    } finally {
      busy = false;
      controls();
    }
  });
  controls();
})();
