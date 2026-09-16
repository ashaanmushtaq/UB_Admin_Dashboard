import React from 'react';
import '../pages/ExportCenterPage.css';

interface QuickExportClusterProps {
  onExport: (format: 'excel' | 'word' | 'pdf') => void;
  loading?: boolean;
}

export function QuickExportCluster({ onExport, loading = false }: QuickExportClusterProps) {
  return (
    <div className="quick-export-cluster" title="Export this view">
      <span className="quick-export-label">Export:</span>
      <button
        type="button"
        className="quick-export-btn excel"
        onClick={() => onExport('excel')}
        disabled={loading}
        title="Export to Excel (.xlsx)"
      >
        📊 Excel
      </button>
      <button
        type="button"
        className="quick-export-btn word"
        onClick={() => onExport('word')}
        disabled={loading}
        title="Export to Word (.doc)"
      >
        📄 Word
      </button>
      <button
        type="button"
        className="quick-export-btn pdf"
        onClick={() => onExport('pdf')}
        disabled={loading}
        title="Export to PDF (.pdf)"
      >
        📑 PDF
      </button>
    </div>
  );
}
