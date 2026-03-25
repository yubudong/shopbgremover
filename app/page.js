'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

const RENAME_TEMPLATES = {
  original: (name) => name.replace(/\.[^.]+$/, '.png'),
  sequence: (_, i) => `${String(i + 1).padStart(2, '0')}.png`,
  date_sequence: (_, i) => {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    return `${date}_${String(i + 1).padStart(2, '0')}.png`;
  },
};

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [bgColor, setBgColor] = useState('white');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [sizePreset, setSizePreset] = useState('original');
  const [renameTemplate, setRenameTemplate] = useState('original');
  const [results, setResults] = useState([]);
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      setSession(s?.user ? s : null);
      if (s?.user) fetchCredits();
    });
  }, []);

  const fetchCredits = () => {
    fetch('/api/credits').then(r => r.json()).then(setCredits);
  };

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files).slice(0, 50));
    setResults([]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 50);
    setFiles(dropped);
    setResults([]);
  };

  const handleProcess = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress({ current: 0, total: files.length });
    setResults([]);

    const processed = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (file, batchIdx) => {
        const globalIdx = i + batchIdx;
        const formData = new FormData();
        formData.append('image', file);
        formData.append('bgColor', bgColor);
        formData.append('customColor', customColor);
        formData.append('sizePreset', sizePreset);
        try {
          const res = await fetch('/api/remove-bg', { method: 'POST', body: formData });
          if (res.ok) {
            const blob = await res.blob();
            const rename = RENAME_TEMPLATES[renameTemplate];
            return { name: rename(file.name, globalIdx), blob, ok: true };
          }
          const err = await res.json().catch(() => ({}));
          return { name: file.name, ok: false, error: err.error || 'Failed' };
        } catch {
          return { name: file.name, ok: false, error: 'Network error' };
        }
      }));
      processed.push(...batchResults);
      setProgress({ current: Math.min(i + CONCURRENCY, files.length), total: files.length });
    }

    setResults(processed);
    setProcessing(false);

    if (session?.user) {
      fetchCredits();
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_count: processed.filter(r => r.ok).length,
          settings_json: { bgColor, sizePreset, renameTemplate },
        }),
      });
    }
  };

  const handleDownloadZip = async () => {
    const ok = results.filter(r => r.ok);
    if (!ok.length) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    ok.forEach((item) => zip.file(item.name, item.blob));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed-images.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadHistory = async () => {
    const data = await fetch('/api/history').then(r => r.json());
    setHistory(Array.isArray(data) ? data : []);
    setShowHistory(true);
  };

  const successCount = results.filter(r => r.ok).length;
  const progressPct = progress.total ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className={styles.container}>
      {/* Navbar */}
      <nav className={styles.nav}>
        <span className={styles.logo}>🛍️ ShopBG Remover</span>
        <div className={styles.navRight}>
          {session?.user ? (
            <>
              {credits !== null && (
                <span className={styles.creditsTag}>⚡ {credits.credits} credits</span>
              )}
              <span className={styles.userName}>{session.user.name}</span>
              <button className={styles.btnSmall} onClick={loadHistory}>History</button>
              <a href="/api/auth/signout" className={styles.btnSmall}>Sign out</a>
            </>
          ) : (
            <a href="/api/auth/signin" className={styles.btnPrimary}>Sign in with Google</a>
          )}
        </div>
      </nav>

      <div className={styles.hero}>
        <h1>AI Background Removal for Shopify Sellers</h1>
        <p>Upload up to 50 product images — get clean white or transparent backgrounds in seconds.</p>
      </div>

      <div className={styles.card}>
        {/* Upload area */}
        <div
          className={`${styles.uploadArea} ${dragOver ? styles.dragOver : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={processing}
            id="fileInput"
          />
          <label htmlFor="fileInput" className={styles.uploadLabel}>
            {files.length
              ? `📸 ${files.length} file(s) selected`
              : '📁 Click or drag & drop images here (max 50)'}
          </label>
        </div>

        {/* Options grid */}
        <div className={styles.optionsGrid}>
          {/* Background */}
          <div className={styles.optionGroup}>
            <label>Background</label>
            <select value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={processing}>
              <option value="white">White (#FFFFFF)</option>
              <option value="transparent">Transparent (PNG)</option>
              <option value="custom">Custom Color</option>
            </select>
            {bgColor === 'custom' && (
              <div className={styles.colorPicker}>
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  disabled={processing}
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  placeholder="#ffffff"
                  className={styles.colorInput}
                  disabled={processing}
                />
              </div>
            )}
          </div>

          {/* Size preset */}
          <div className={styles.optionGroup}>
            <label>Output Size</label>
            <select value={sizePreset} onChange={(e) => setSizePreset(e.target.value)} disabled={processing}>
              <option value="original">Original Size</option>
              <option value="shopify">Shopify (2048×2048)</option>
              <option value="amazon">Amazon (1000×1000)</option>
              <option value="ebay">eBay (500×500)</option>
            </select>
          </div>

          {/* Rename template */}
          <div className={styles.optionGroup}>
            <label>File Naming</label>
            <select value={renameTemplate} onChange={(e) => setRenameTemplate(e.target.value)} disabled={processing}>
              <option value="original">Keep original name</option>
              <option value="sequence">Sequence (01.png, 02.png...)</option>
              <option value="date_sequence">Date + Sequence (20260317_01.png)</option>
            </select>
          </div>
        </div>

        {/* Credit warning */}
        {session?.user && credits !== null && files.length > 0 && (
          <p className={styles.creditWarning}>
            This will use <strong>{files.length}</strong> credits. You have <strong>{credits.credits}</strong> remaining.
          </p>
        )}

        <button
          className={styles.btn}
          onClick={handleProcess}
          disabled={!files.length || processing}
        >
          {processing
            ? `Processing ${progress.current}/${progress.total}...`
            : `Remove Background (${files.length} image${files.length !== 1 ? 's' : ''})`}
        </button>

        {processing && (
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {results.length > 0 && (
          <div className={styles.results}>
            <p>✅ {successCount}/{results.length} processed successfully</p>
            {results.filter(r => !r.ok).length > 0 && (
              <p className={styles.errorNote}>
                ⚠️ {results.filter(r => !r.ok).length} failed — check your credits or try again
              </p>
            )}
            {successCount > 0 && (
              <button className={styles.btnGreen} onClick={handleDownloadZip}>
                ⬇️ Download ZIP ({successCount} images)
              </button>
            )}
            <div className={styles.previews}>
              {results.filter(r => r.ok).map((r, i) => (
                <div key={i} className={styles.previewItem}>
                  <img src={URL.createObjectURL(r.blob)} alt={r.name} className={styles.preview} />
                  <span className={styles.previewName}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History modal */}
      {showHistory && (
        <div className={styles.modal} onClick={() => setShowHistory(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2>Processing History (90 days)</h2>
            {history.length === 0 ? (
              <p>No history yet.</p>
            ) : (
              <table className={styles.historyTable}>
                <thead><tr><th>Date</th><th>Files</th><th>Settings</th></tr></thead>
                <tbody>
                  {history.map(h => {
                    const s = JSON.parse(h.settings_json || '{}');
                    return (
                      <tr key={h.id}>
                        <td>{new Date(h.created_at * 1000).toLocaleDateString()}</td>
                        <td>{h.file_count} images</td>
                        <td>{s.bgColor || '-'} / {s.sizePreset || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <button className={styles.btnSmall} onClick={() => setShowHistory(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
