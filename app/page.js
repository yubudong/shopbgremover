'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [bgColor, setBgColor] = useState('white');
  const [results, setResults] = useState([]);
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

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
    setFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 50));
    setResults([]);
  };

  const handleProcess = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress({ current: 0, total: files.length });
    setResults([]);

    const processed = [];
    // 并发最多 5 张
    const CONCURRENCY = 5;
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (file) => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('bgColor', bgColor);
        try {
          const res = await fetch('/api/remove-bg', { method: 'POST', body: formData });
          if (res.ok) {
            const blob = await res.blob();
            return { name: file.name.replace(/\.[^.]+$/, '.png'), blob, ok: true };
          }
          return { name: file.name, ok: false };
        } catch {
          return { name: file.name, ok: false };
        }
      }));
      processed.push(...batchResults);
      setProgress({ current: Math.min(i + CONCURRENCY, files.length), total: files.length });
    }

    setResults(processed);
    setProcessing(false);
    if (session?.user) {
      fetchCredits();
      // 记录历史
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_count: processed.filter(r => r.ok).length, settings_json: { bgColor } }),
      });
    }
  };

  const handleDownloadZip = async () => {
    if (!results.filter(r => r.ok).length) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    results.filter(r => r.ok).forEach((item) => zip.file(item.name, item.blob));
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
    setHistory(data);
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
          className={styles.uploadArea}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
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

        {/* Options */}
        <div className={styles.options}>
          <label>Background:</label>
          <select value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={processing}>
            <option value="white">White (#FFFFFF)</option>
            <option value="transparent">Transparent (PNG)</option>
          </select>
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
            {successCount > 0 && (
              <button className={styles.btnGreen} onClick={handleDownloadZip}>
                ⬇️ Download ZIP ({successCount} images)
              </button>
            )}
            <div className={styles.previews}>
              {results.filter(r => r.ok).map((r, i) => (
                <img key={i} src={URL.createObjectURL(r.blob)} alt={r.name} className={styles.preview} />
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
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at * 1000).toLocaleDateString()}</td>
                      <td>{h.file_count} images</td>
                      <td>{JSON.parse(h.settings_json || '{}').bgColor || '-'}</td>
                    </tr>
                  ))}
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
