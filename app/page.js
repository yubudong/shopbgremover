'use client';

import { useState } from 'react';
import styles from './page.module.css';

const REMOVE_BG_API_KEY = 'XQ4tTk1g4cQMixrojMzJCw9R';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bgColor, setBgColor] = useState('white');
  const [results, setResults] = useState([]);

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files).slice(0, 50));
    setResults([]);
  };

  const handleProcess = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress(0);
    setResults([]);

    const processed = [];
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('image_file', files[i]);
      formData.append('type', 'product');
      if (bgColor === 'white') {
        formData.append('bg_color', 'ffffff');
      }

      try {
        const res = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
          body: formData,
        });
        if (res.ok) {
          const blob = await res.blob();
          processed.push({ name: files[i].name.replace(/\.[^.]+$/, '.png'), blob });
        } else {
          console.error(`Failed: ${files[i].name}`, await res.text());
        }
      } catch (err) {
        console.error(`Error: ${files[i].name}`, err);
      }

      setProgress(((i + 1) / files.length) * 100);
    }

    setResults(processed);
    setProcessing(false);
  };

  const handleDownloadZip = async () => {
    if (!results.length) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    results.forEach((item) => zip.file(item.name, item.blob));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed-images.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <h1>ShopBG Remover</h1>
      <p className={styles.subtitle}>AI background removal for Shopify sellers</p>
      <div className={styles.card}>
        <div className={styles.uploadArea}>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={processing}
            id="fileInput"
          />
          <label htmlFor="fileInput" className={styles.uploadLabel}>
            {files.length ? `${files.length} file(s) selected` : '📁 Click or drag to upload images (max 50)'}
          </label>
        </div>

        <div className={styles.options}>
          <label>Background:</label>
          <select value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={processing}>
            <option value="white">White (#FFFFFF)</option>
            <option value="transparent">Transparent (PNG)</option>
          </select>
        </div>

        <button className={styles.btn} onClick={handleProcess} disabled={!files.length || processing}>
          {processing ? `Processing... ${Math.round(progress)}%` : `Remove Background (${files.length} image${files.length !== 1 ? 's' : ''})`}
        </button>

        {processing && (
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        )}

        {results.length > 0 && (
          <div className={styles.results}>
            <p>✅ {results.length} image(s) processed successfully</p>
            <button className={styles.btnGreen} onClick={handleDownloadZip}>
              ⬇️ Download ZIP ({results.length} images)
            </button>
            <div className={styles.previews}>
              {results.map((r, i) => (
                <img key={i} src={URL.createObjectURL(r.blob)} alt={r.name} className={styles.preview} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
