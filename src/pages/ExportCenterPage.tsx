import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { exportDataset, type ExportData } from '../lib/exportUtils';
import { fetchCustomerBalances } from '../lib/customers';
import { fetchSupplierBalances } from '../lib/fabric';
import { fetchEmployees } from '../lib/employees';
import { fetchBusinessExpenses } from '../lib/expenses';
import { fetchTaxInvoices } from '../lib/taxFbr';
import { fetchFinanceOverview, fetchReportsSummary } from '../lib/finance';
import './ExportCenterPage.css';

interface ExportCenterPageProps {
  shopName?: string;
}

export function ExportCenterPage({ shopName = 'Karobit Enterprise' }: ExportCenterPageProps) {
  const [exportingId, setExportingId] = useState<string | null>(null);

  async function handleExport(datasetKey: string, format: 'excel' | 'word' | 'pdf') {
    setExportingId(`${datasetKey}-${format}`);
    try {
      let exportData: ExportData | null = null;
      const today = new Date().toISOString().split('T')[0];

      if (datasetKey === 'customers') {
        const balances = await fetchCustomerBalances();
        const totalSales = balances.reduce((a, b) => a + Number(b.total_sales_amount || 0), 0);
        const totalPaid = balances.reduce((a, b) => a + Number(b.total_paid_amount || 0), 0);
        const totalDues = balances.reduce((a, b) => a + Number(b.current_balance_due || 0), 0);

        exportData = {
          filename: `Customers_Ledger_${today}`,
          title: 'Customer Sales & Ledger Report',
          subtitle: 'Active customers, cumulative sales volume, payments received, and current balance dues',
          shopName,
          headers: ['Customer Name', 'Shop / Company', 'Phone', 'City', 'Total Sales (₨)', 'Total Paid (₨)', 'Balance Due (₨)'],
          rows: balances.map(b => [
            b.customer_name,
            b.shop_name || b.company_name || '—',
            b.phone || '—',
            b.city || '—',
            Number(b.total_sales_amount || 0).toLocaleString(),
            Number(b.total_paid_amount || 0).toLocaleString(),
            Number(b.current_balance_due || 0).toLocaleString(),
          ]),
          summaryStats: {
            'Total Active Accounts': balances.length,
            'Total Cumulative Sales': `₨ ${totalSales.toLocaleString()}`,
            'Total Payments Collected': `₨ ${totalPaid.toLocaleString()}`,
            'Total Outstanding Receivables': `₨ ${totalDues.toLocaleString()}`,
          },
        };
      } else if (datasetKey === 'suppliers') {
        const balances = await fetchSupplierBalances();
        const totalPurchased = balances.reduce((a, b) => a + Number(b.total_purchased_amount || 0), 0);
        const totalPaid = balances.reduce((a, b) => a + Number(b.total_paid_amount || 0), 0);
        const totalDues = balances.reduce((a, b) => a + Number(b.current_balance_due || 0), 0);

        exportData = {
          filename: `Suppliers_Ledger_${today}`,
          title: 'Fabric Suppliers Ledger Report',
          subtitle: 'Raw material procurement, supplier payments, and running credit liabilities',
          shopName,
          headers: ['Supplier Name', 'Company Name', 'Phone', 'Total Purchased (₨)', 'Total Paid (₨)', 'Payable Due (₨)'],
          rows: balances.map(b => [
            b.supplier_name,
            b.company_name || '—',
            b.phone || '—',
            Number(b.total_purchased_amount || 0).toLocaleString(),
            Number(b.total_paid_amount || 0).toLocaleString(),
            Number(b.current_balance_due || 0).toLocaleString(),
          ]),
          summaryStats: {
            'Total Suppliers': balances.length,
            'Total Fabric Purchases': `₨ ${totalPurchased.toLocaleString()}`,
            'Total Payments Settled': `₨ ${totalPaid.toLocaleString()}`,
            'Total Outstanding Payables': `₨ ${totalDues.toLocaleString()}`,
          },
        };
      } else if (datasetKey === 'employees') {
        const emps = await fetchEmployees();
        exportData = {
          filename: `Staff_Roster_${today}`,
          title: 'Staff Roster & Payroll Directory',
          subtitle: 'Factory personnel, assigned production roles, wage terms, and operational status',
          shopName,
          headers: ['Employee Name', 'Phone', 'Role', 'Employment Type', 'Base Rate (₨)', 'Status'],
          rows: emps.map(e => [
            e.full_name || '—',
            e.phone || '—',
            e.role ? e.role.replace(/_/g, ' ').toUpperCase() : '—',
            e.employment_type ? e.employment_type.toUpperCase() : 'PIECE WORK',
            e.base_rate ? Number(e.base_rate).toLocaleString() : '0',
            e.is_active ? 'ACTIVE' : 'INACTIVE',
          ]),
          summaryStats: {
            'Total Staff Members': emps.length,
            'Active Personnel': emps.filter(e => e.is_active).length,
          },
        };
      } else if (datasetKey === 'production') {
        const { data: orders } = await supabase
          .from('production_orders')
          .select('*')
          .order('created_at', { ascending: false });

        const list = orders || [];
        const totalPieces = list.reduce((a, b) => a + (Number(b.total_quantity) || 0), 0);

        exportData = {
          filename: `Production_Orders_${today}`,
          title: 'Production Orders & Batch Pipeline',
          subtitle: 'Manufacturing work orders, stage progression, and consignment volumes',
          shopName,
          headers: ['Order Number', 'Garment Type', 'Total Quantity', 'Urgent / Rush', 'Status', 'Order Date'],
          rows: list.map(o => [
            o.order_number,
            o.garment_type || 'Custom',
            Number(o.total_quantity || 0).toLocaleString(),
            o.is_urgent ? 'YES (URGENT)' : 'STANDARD',
            o.status ? o.status.toUpperCase() : 'IN PROGRESS',
            new Date(o.created_at).toLocaleDateString(),
          ]),
          summaryStats: {
            'Total Work Orders': list.length,
            'Total Pieces in Production': totalPieces.toLocaleString(),
          },
        };
      } else if (datasetKey === 'expenses') {
        const expList = await fetchBusinessExpenses();
        const totalAmount = expList.reduce((a, b) => a + Number(b.amount || 0), 0);

        exportData = {
          filename: `Operational_Expenses_${today}`,
          title: 'Business Overhead & Operational Expenses',
          subtitle: 'Itemized factory rent, electricity bills, transport logistics, and floor sundries',
          shopName,
          headers: ['Date', 'Expense Category', 'Amount (₨)', 'Notes / Reference'],
          rows: expList.map(e => [
            e.expense_date,
            e.category.toUpperCase(),
            Number(e.amount).toLocaleString(),
            e.notes || '—',
          ]),
          summaryStats: {
            'Total Expense Records': expList.length,
            'Total Expenditures': `₨ ${totalAmount.toLocaleString()}`,
          },
        };
      } else if (datasetKey === 'tax') {
        const invList = await fetchTaxInvoices();
        const totalTaxable = invList.reduce((a, b) => a + Number(b.taxable_amount || 0), 0);
        const totalGst = invList.reduce((a, b) => a + Number(b.tax_amount || 0), 0);
        const totalGrand = invList.reduce((a, b) => a + Number(b.total_amount || 0), 0);

        exportData = {
          filename: `Tax_Invoices_GST_${today}`,
          title: 'Sales Tax Invoices & FBR Compliance',
          subtitle: 'Official sales tax invoices, customer NTN registry, and GST (17%) breakdown',
          shopName,
          headers: ['Invoice #', 'Customer Name', 'Customer NTN', 'Taxable Amount (₨)', 'Rate %', 'GST Tax (₨)', 'Grand Total (₨)', 'Issue Date'],
          rows: invList.map(i => [
            i.invoice_number,
            i.customer_name,
            i.customer_ntn || '—',
            Number(i.taxable_amount).toLocaleString(),
            `${i.tax_rate}%`,
            Number(i.tax_amount).toLocaleString(),
            Number(i.total_amount).toLocaleString(),
            new Date(i.issued_at).toLocaleDateString(),
          ]),
          summaryStats: {
            'Total Invoices Issued': invList.length,
            'Total Taxable Sales': `₨ ${totalTaxable.toLocaleString()}`,
            'Total GST Output Tax (17%)': `₨ ${totalGst.toLocaleString()}`,
            'Gross Invoiced Amount': `₨ ${totalGrand.toLocaleString()}`,
          },
        };
      } else if (datasetKey === 'executive') {
        const [finance, reports] = await Promise.all([
          fetchFinanceOverview(),
          fetchReportsSummary(),
        ]);

        exportData = {
          filename: `Executive_Summary_${today}`,
          title: 'Karobit Enterprise Executive Audit & Financial Health',
          subtitle: 'High-level business overview: revenue, cash flow, production pipeline, liabilities',
          shopName,
          headers: ['Key Performance Indicator (KPI)', 'Reported Value', 'Categorization'],
          rows: [
            ['Money In (Total Revenue Received)', `₨ ${finance.total_money_in.toLocaleString()}`, 'Cash Flow'],
            ['Money Out (Disbursements & Payables)', `₨ ${finance.total_money_out.toLocaleString()}`, 'Cash Flow'],
            ['Net Cash Position', `₨ ${finance.net_cash_flow.toLocaleString()}`, 'Liquidity'],
            ['Total Receivables Portfolio (Customer Dues)', `₨ ${reports.total_customer_dues.toLocaleString()}`, 'Assets'],
            ['Total Payables Portfolio (Supplier Liabilities)', `₨ ${reports.total_supplier_dues.toLocaleString()}`, 'Liabilities'],
            ['Today Sales Volume', `₨ ${reports.sales_today.toLocaleString()}`, 'Wholesale Performance'],
            ['Weekly Sales Volume', `₨ ${reports.sales_this_week.toLocaleString()}`, 'Wholesale Performance'],
            ['Total Pipeline Garments Active', `${reports.total_pieces_in_pipeline.toLocaleString()} pcs`, 'Factory Floor Output'],
          ],
          summaryStats: {
            'Audit Date': today,
            'Net Financial Posture': finance.net_cash_flow >= 0 ? 'Surplus Positive' : 'Deficit',
            'Factory Active Capacity': `${reports.total_pieces_in_pipeline} pieces currently in production stages`,
          },
        };
      }

      if (exportData) {
        exportDataset(format, exportData);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      alert('Failed to export dataset: ' + (err?.message || 'Unknown error'));
    } finally {
      setExportingId(null);
    }
  }

  const DATASETS = [
    {
      key: 'executive',
      title: 'Executive Financial & Operational Audit',
      icon: '📊',
      desc: 'Complete overview: Money In vs Out, cash flow balance, receivables, supplier liabilities, and throughput.',
    },
    {
      key: 'customers',
      title: 'Customer Sales & Ledger Accounts',
      icon: '📒',
      desc: 'All customer profiles, order history, payments logged, credit limits, and running balance dues.',
    },
    {
      key: 'suppliers',
      title: 'Fabric Suppliers & Procurement Ledger',
      icon: '🧵',
      desc: 'Raw fabric purchases, meterage received, unit costs, payments settled, and current payables.',
    },
    {
      key: 'tax',
      title: 'Tax Invoices & FBR GST Report',
      icon: '🏛️',
      desc: 'Sales tax records, customer NTN numbers, 17% GST output tax calculations, and invoice registry.',
    },
    {
      key: 'expenses',
      title: 'Operational Overhead Expenses',
      icon: '💵',
      desc: 'Itemized factory rent, electricity bills, transport fuel, maintenance, and workshop miscellaneous.',
    },
    {
      key: 'production',
      title: 'Production Orders & Pipeline',
      icon: '⚙️',
      desc: 'Factory orders, garment classifications, batch quantities, urgency flags, and current status.',
    },
    {
      key: 'employees',
      title: 'Staff Roster & Payroll Registry',
      icon: '👷',
      desc: 'Production workforce list, station specialties, piece-rate wages, and active/inactive status.',
    },
  ];

  return (
    <div className="export-center-page">
      <header className="export-header">
        <h1 className="export-title">📥 Data Export Center</h1>
        <p className="export-sub">
          Export your complete enterprise records into formatted <strong>Microsoft Excel (.xlsx)</strong>, <strong>Microsoft Word (.doc)</strong>, and <strong>PDF</strong> documents.
        </p>
      </header>

      <div className="export-cards-grid">
        {DATASETS.map((ds) => {
          const isExportingExcel = exportingId === `${ds.key}-excel`;
          const isExportingWord = exportingId === `${ds.key}-word`;
          const isExportingPdf = exportingId === `${ds.key}-pdf`;
          const isBusy = Boolean(exportingId?.startsWith(`${ds.key}-`));

          return (
            <div key={ds.key} className="export-card">
              <div>
                <div className="export-card-top">
                  <span className="export-card-icon" aria-hidden="true">{ds.icon}</span>
                  <div>
                    <h3 className="export-card-title">{ds.title}</h3>
                    <p className="export-card-desc">{ds.desc}</p>
                  </div>
                </div>
              </div>

              <div className="export-actions-row">
                <button
                  className="export-format-btn btn-excel"
                  onClick={() => handleExport(ds.key, 'excel')}
                  disabled={isBusy}
                  title="Download as Excel spreadsheet"
                >
                  {isExportingExcel ? 'Generating…' : '📊 Excel'}
                </button>
                <button
                  className="export-format-btn btn-word"
                  onClick={() => handleExport(ds.key, 'word')}
                  disabled={isBusy}
                  title="Download as Microsoft Word document"
                >
                  {isExportingWord ? 'Generating…' : '📄 Word'}
                </button>
                <button
                  className="export-format-btn btn-pdf"
                  onClick={() => handleExport(ds.key, 'pdf')}
                  disabled={isBusy}
                  title="Download as printable PDF report"
                >
                  {isExportingPdf ? 'Generating…' : '📑 PDF'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
