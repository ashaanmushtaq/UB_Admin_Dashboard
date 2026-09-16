import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { 
  fetchBarcodeLabels, 
  saveBarcodeLabel, 
  deleteBarcodeLabel, 
  type BarcodeLabel 
} from '../lib/barcodes';
import './BarcodePage.css';

export function BarcodePage() {
  const [labelType, setLabelType] = useState<'order' | 'product' | 'bundle'>('product');
  const [referenceLabel, setReferenceLabel] = useState('Cotton Kurta - Blue / L');
  const [barcodeValue, setBarcodeValue] = useState('PRD-' + Math.floor(100000 + Math.random() * 900000));
  const [price, setPrice] = useState('2450');
  const [skuOrBatch, setSkuOrBatch] = useState('LOT-2026-B9');

  const [savedLabels, setSavedLabels] = useState<BarcodeLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const previewSvgRef = useRef<SVGSVGElement>(null);
  const printModalSvgRef = useRef<SVGSVGElement>(null);
  const [printTarget, setPrintTarget] = useState<BarcodeLabel | null>(null);

  useEffect(() => {
    loadSaved();
  }, []);

  useEffect(() => {
    if (previewSvgRef.current && barcodeValue.trim()) {
      try {
        JsBarcode(previewSvgRef.current, barcodeValue.trim(), {
          format: 'CODE128',
          width: 2,
          height: 55,
          displayValue: true,
          font: 'monospace',
          fontSize: 13,
          margin: 8,
        });
      } catch (err) {
        console.warn('JsBarcode render error', err);
      }
    }
  }, [barcodeValue]);

  useEffect(() => {
    if (printTarget && printModalSvgRef.current) {
      try {
        JsBarcode(printModalSvgRef.current, printTarget.barcode_value, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          font: 'monospace',
          fontSize: 14,
          margin: 10,
        });
      } catch (err) {
        console.warn('JsBarcode modal render error', err);
      }
    }
  }, [printTarget]);

  async function loadSaved() {
    setLoading(true);
    try {
      const list = await fetchBarcodeLabels();
      setSavedLabels(list);
    } catch (err) {
      console.error('Failed to load barcode labels', err);
    } finally {
      setLoading(false);
    }
  }

  function handleGenerateNew() {
    const prefix = labelType === 'order' ? 'ORD-' : labelType === 'bundle' ? 'BUN-' : 'PRD-';
    setBarcodeValue(prefix + Math.floor(100000 + Math.random() * 900000));
  }

  async function handleSave() {
    if (!barcodeValue.trim() || !referenceLabel.trim()) return;
    setSaving(true);
    try {
      const saved = await saveBarcodeLabel({
        label_type: labelType,
        reference_label: referenceLabel.trim(),
        barcode_value: barcodeValue.trim(),
        label_data: {
          price: price ? `₨ ${price}` : undefined,
          skuOrBatch: skuOrBatch || undefined,
        },
      });
      setSavedLabels(prev => [saved, ...prev]);
      alert('Barcode label saved successfully!');
    } catch (err: any) {
      alert('Failed to save barcode: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this barcode label?')) return;
    try {
      await deleteBarcodeLabel(id);
      setSavedLabels(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      alert('Failed to delete barcode: ' + err.message);
    }
  }

  return (
    <div className="barcode-page">
      <header className="barcode-header">
        <div>
          <h1 className="barcode-title">🏷️ Barcode & SKU Generator</h1>
          <p className="barcode-sub">
            Generate Code128 barcodes for finished goods, cut bundles, and wholesale orders. Print 60mm thermal stickers.
          </p>
        </div>
      </header>

      <div className="barcode-layout">
        {/* Config Form */}
        <div className="barcode-card">
          <h2 className="barcode-card-title">Configure Label</h2>
          
          <div className="tax-form-group">
            <label className="tax-form-label">Label Type</label>
            <select 
              className="tax-input"
              value={labelType}
              onChange={(e) => {
                const t = e.target.value as any;
                setLabelType(t);
                const prefix = t === 'order' ? 'ORD-' : t === 'bundle' ? 'BUN-' : 'PRD-';
                setBarcodeValue(prefix + Math.floor(100000 + Math.random() * 900000));
              }}
            >
              <option value="product">👕 Finished Product SKU</option>
              <option value="order">📦 Wholesale Order Consignment</option>
              <option value="bundle">✂️ Cut Bundle Floor Tag</option>
            </select>
          </div>

          <div className="tax-form-group">
            <label className="tax-form-label">Item / Reference Name</label>
            <input 
              className="tax-input"
              value={referenceLabel}
              onChange={(e) => setReferenceLabel(e.target.value)}
              placeholder="e.g. Cotton Kurta - White / XL"
            />
          </div>

          <div className="tax-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="tax-form-label">Barcode Value (Code 128)</label>
              <button 
                type="button" 
                className="tax-action-btn"
                style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}
                onClick={handleGenerateNew}
              >
                🔄 Auto-Generate
              </button>
            </div>
            <input 
              className="tax-input"
              value={barcodeValue}
              onChange={(e) => setBarcodeValue(e.target.value)}
              placeholder="e.g. PRD-894102"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="tax-form-group">
              <label className="tax-form-label">Price (₨, Optional)</label>
              <input 
                className="tax-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="2450"
              />
            </div>
            <div className="tax-form-group">
              <label className="tax-form-label">Batch / Lot / Size</label>
              <input 
                className="tax-input"
                value={skuOrBatch}
                onChange={(e) => setSkuOrBatch(e.target.value)}
                placeholder="LOT-2026-B9"
              />
            </div>
          </div>

          <div className="barcode-btn-row">
            <button 
              className="tax-primary-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : '💾 Save Label'}
            </button>
            <button 
              className="tax-action-btn"
              style={{ fontWeight: 600 }}
              onClick={() => {
                setPrintTarget({
                  id: 'preview',
                  tenant_id: '',
                  label_type: labelType,
                  reference_id: null,
                  reference_label: referenceLabel,
                  barcode_value: barcodeValue,
                  label_data: { price: price ? `₨ ${price}` : undefined, skuOrBatch },
                  created_at: new Date().toISOString(),
                });
              }}
            >
              🖨️ Print Label Sticker
            </button>
          </div>
        </div>

        {/* Live Sticker Preview */}
        <div className="barcode-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="barcode-card-title">Sticker Preview (Thermal 60mm)</h2>
          
          <div className="barcode-preview-box" style={{ margin: 'auto 0' }}>
            <div className="barcode-preview-label-header">
              {referenceLabel || 'Sample Product'}
            </div>
            {skuOrBatch && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem' }}>
                Batch: {skuOrBatch}
              </div>
            )}
            <svg ref={previewSvgRef} />
            {price && (
              <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.4rem', color: '#0f172a' }}>
                PKR {price}
              </div>
            )}
            <div className="barcode-preview-sub">
              Karobit Factory Manufacturing
            </div>
          </div>
        </div>
      </div>

      {/* Saved Barcodes History */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>Saved Barcode Registry</h2>
      <div className="tax-table-container">
        <table className="tax-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Reference Item</th>
              <th>Barcode Value</th>
              <th>Details</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>Loading saved labels...</td></tr>
            ) : savedLabels.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No barcode labels saved yet.</td></tr>
            ) : (
              savedLabels.map((lbl) => (
                <tr key={lbl.id}>
                  <td>
                    <span className="tax-status-badge issued" style={{ textTransform: 'uppercase' }}>
                      {lbl.label_type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{lbl.reference_label}</td>
                  <td>
                    <code style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                      {lbl.barcode_value}
                    </code>
                  </td>
                  <td>
                    {lbl.label_data?.price && <span style={{ marginRight: '0.5rem' }}>{lbl.label_data.price}</span>}
                    {lbl.label_data?.skuOrBatch && <span style={{ color: '#64748b' }}>({lbl.label_data.skuOrBatch})</span>}
                  </td>
                  <td>{new Date(lbl.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="tax-action-btn"
                      style={{ marginRight: '0.5rem' }}
                      onClick={() => setPrintTarget(lbl)}
                    >
                      🖨️ Print
                    </button>
                    <button 
                      className="expenses-delete-btn"
                      onClick={() => handleDelete(lbl.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Print Modal Dialog */}
      {printTarget && (
        <div className="tax-modal-backdrop" onClick={() => setPrintTarget(null)}>
          <div className="tax-modal print-area" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>{printTarget.reference_label}</h3>
            {printTarget.label_data?.skuOrBatch && (
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{printTarget.label_data.skuOrBatch}</div>
            )}
            <div style={{ margin: '0.75rem 0' }}>
              <svg ref={printModalSvgRef} />
            </div>
            {printTarget.label_data?.price && (
              <div style={{ fontWeight: 700, fontSize: '1.1rem', margin: '0.25rem 0' }}>
                {printTarget.label_data.price}
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '1.25rem' }}>
              KAROBIT SYSTEMS
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
              <button className="tax-action-btn" onClick={() => setPrintTarget(null)}>Close</button>
              <button className="tax-primary-btn" onClick={() => window.print()}>Print Sticker Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
