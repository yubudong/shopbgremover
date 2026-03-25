'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bgColor, setBgColor] = useState('white');
  const [results, setResults] = useState([]);

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files).slice(0, 50));
  };

  const handleProcess = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress(0);
    setResults([]);

    const processed = [];
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('image', files[i]);
      formData.append('bgColor', bgColor);

      try {
        const res = await fetch('/api/remove-bg', { method: 'POST', body: formData });
        if (res.ok) {
          const blob = await res.blob();
          processed.push({ name: files[i].name, blob });
        }
      } catch (err) {
        console.error(`Failed to process ${files[i].name}:`, err);
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

    results.forEach((item, idx) => {
      zip.file(`${idx + 1}.png`, item.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed-images.zip';
    a.click();
  };

  return (
    <div className={styles.container}>
      <h1>ShopBG Remover</h1>
      <div className={styles.card}>
        <input type="file" multiple accept="image/*" onChange={handleFileChange} disabled={processing} />
        <p>{files.length} file(s) selected</p>

        <div>
          <label>Background:</label>
          <select value={bgColor} onChange={(e) => setBgColor(e.target.value)} disabled={processing}>
            <option value="white">White</option>
            <option value="transparent">Transparent</option>
          </select>
        </div>

        <button onClick={handleProcess} disabled={!files.length || processing}>
          {processing ? `Processing... ${Math.round(progress)}%` : 'Start Processing'}
        </button>

        {processing && <div className={styles.progressBar} style={{ width: `${progress}%` }} />}

        {results.length > 0 && (
          <button onClick={handleDownloadZip} className={styles.downloadBtn}>
            Download ZIP ({results.length} images)
          </button>
        )}
      </div>
    </div>
  );
}
