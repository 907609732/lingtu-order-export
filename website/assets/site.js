// Progressive enhancement: core navigation remains usable without JavaScript.
const lightbox = document.querySelector('.lightbox');
document.querySelectorAll('a[href="#platform-status"]').forEach(link => link.addEventListener('click', () => {
  const status = document.getElementById('platform-status');
  if (status) status.open = true;
}));
if (lightbox && typeof lightbox.showModal === 'function') {
  lightbox.querySelector('.close-lightbox').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });
  document.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => {
    const img = lightbox.querySelector('img'); img.src = button.dataset.image; img.alt = button.dataset.caption;
    lightbox.querySelector('p').textContent = button.dataset.caption; lightbox.showModal();
  }));
}
async function loadRelease() {
  try {
    const response = await fetch('release.json', { cache: 'no-cache' }); if (!response.ok) return;
    const release = await response.json(); const url = new URL(release.downloadUrl);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/907609732/lingtu-order-export/releases/download/')) return;
    if (!/^v\d+\.\d+\.\d+$/.test(release.version) || !release.filename?.endsWith('-Setup.exe')) return;
    document.querySelectorAll('[data-version]').forEach(el => { el.textContent = release.version; });
    document.querySelectorAll('[data-preview-version]').forEach(el => { el.textContent = release.previewVersion; });
    document.querySelectorAll('[data-filename]').forEach(el => { el.textContent = release.filename; });
    document.querySelectorAll('[data-size]').forEach(el => { el.textContent = ` · ${(release.size / 1024 / 1024).toFixed(1)} MB`; });
    document.querySelectorAll('.download-link').forEach(el => { el.href = url.href; });
    if (/^sha256:[a-f0-9]{64}$/i.test(release.sha256 || '')) document.querySelectorAll('[data-checksum]').forEach(el => {
      el.textContent = release.sha256.slice(7); el.closest('details').hidden = false;
    });
    if (release.netdiskUrl) { const backup = new URL(release.netdiskUrl);
      if (backup.protocol === 'https:') document.querySelectorAll('.netdisk-link').forEach(el => {
        el.href = backup.href; el.textContent = '网盘备用下载 ↗' + (release.netdiskCode ? ` · 提取码 ${release.netdiskCode}` : ''); el.hidden = false;
      });
    }
  } catch { /* Preserve the working GitHub Releases fallback. */ }
}
void loadRelease();
