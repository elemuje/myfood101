window.Food101 = {
  escape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); },
  naira(value) { return '₦' + Number(value).toLocaleString('en-NG'); },
  async request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers } });
    let result;
    try { result = await response.json(); } catch { throw new Error('The server could not be reached. Please try again.'); }
    if (!response.ok) { const error = new Error(result.error || 'Please try again.'); error.status = response.status; throw error; }
    return result;
  },
  async picture(file, maxBytes = 600000) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP picture.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a picture smaller than 10 MB.');
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    let data;
    for (const quality of [.82, .65, .45, .3]) {
      data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (Math.ceil(data.length * 3 / 4) <= maxBytes) return { data, mime: 'image/jpeg' };
    }
    throw new Error('This picture is too detailed. Please choose a smaller picture.');
  }
};
