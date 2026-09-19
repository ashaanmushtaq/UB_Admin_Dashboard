import React from 'react';
import '../pages/ExportCenterPage.css';

export interface QuickExportClusterProps {
  onExport: (format: 'excel' | 'word' | 'pdf') => void;
  loading?: boolean;
  formats?: ('excel' | 'word' | 'pdf')[];
  label?: string;
}

export function QuickExportCluster({
  onExport,
  loading = false,
  formats = ['excel', 'word', 'pdf'],
  label = 'Export:',
}: QuickExportClusterProps) {
  return (
    <div className="quick-export-cluster" title="Export this view">
      {label && <span className="quick-export-label">{label}</span>}
      {formats.includes('excel') && (
        <button
          type="button"
          className="quick-export-btn excel"
          onClick={() => onExport('excel')}
          disabled={loading}
          title="Export to Excel (.xlsx)"
        >
          📊 Excel
        </button>
      )}
      {formats.includes('word') && (
        <button
          type="button"
          className="quick-export-btn word"
          onClick={() => onExport('word')}
          disabled={loading}
          title="Export to Word (.doc)"
        >
          📄 Word
        </button>
      )}
      {formats.includes('pdf') && (
        <button
          type="button"
          className="quick-export-btn pdf"
          onClick={() => onExport('pdf')}
          disabled={loading}
          title="Export to PDF (.pdf)"
        >
          📑 PDF
        </button>
      )}
    </div>
  );
}
