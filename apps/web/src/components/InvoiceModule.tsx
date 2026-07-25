
import React, { useState } from 'react';
import { Invoice, InvoiceItem, ViewType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_INVOICES: Invoice[] = [
  { id: '1', invoiceId: '#SPK12032901', clientName: 'Json Taylor', clientEmail: 'jsontaylor2416@gmail.com', issuedDate: '25, Nov 2022', dueDate: '25, Dec 2022', amount: 212.45, status: 'Paid', items: [], clientAvatar: 'https://picsum.photos/seed/json/100/100' },
  { id: '2', invoiceId: '#SPK12032912', clientName: 'Suzika Stallone', clientEmail: 'suzikastallone3214@gmail.com', issuedDate: '13, Nov 2022', dueDate: '13, Dec 2022', amount: 512.99, status: 'Pending', items: [], clientAvatar: 'https://picsum.photos/seed/suzika/100/100' },
  { id: '3', invoiceId: '#SPK12032945', clientName: 'Roman Killon', clientEmail: 'romankillon143@gmail.com', issuedDate: '30, Nov 2022', dueDate: '30, Dec 2022', amount: 2199.49, status: 'Overdue', items: [], clientAvatar: 'https://picsum.photos/seed/roman/100/100' },
  { id: '4', invoiceId: '#SPK12032922', clientName: 'Charlie Davieson', clientEmail: 'charliedavieson@gmail.com', issuedDate: '18, Nov 2022', dueDate: '18, Dec 2022', amount: 1569.99, status: 'Paid', items: [], clientAvatar: 'https://picsum.photos/seed/charlie/100/100' },
  { id: '5', invoiceId: '#SPK12032932', clientName: 'Selena Deoyl', clientEmail: 'selenadeoyl114@gmail.com', issuedDate: '18, Nov 2022', dueDate: '18, Dec 2022', amount: 4873.99, status: 'Due By 1 Day', items: [], clientAvatar: 'https://picsum.photos/seed/selena/100/100' },
];

const CHART_DATA = [
  { name: 'Jul', paid: 80, pending: 40, overdue: 20 },
  { name: 'Aug', paid: 100, pending: 50, overdue: 15 },
  { name: 'Sep', paid: 90, pending: 60, overdue: 25 },
  { name: 'Oct', paid: 110, pending: 45, overdue: 10 },
  { name: 'Nov', paid: 120, pending: 55, overdue: 30 },
  { name: 'Dec', paid: 130, pending: 50, overdue: 20 },
];

interface InvoiceModuleProps {
  view: 'list' | 'create' | 'detail';
  setView: (view: ViewType) => void;
}

const InvoiceModule: React.FC<InvoiceModuleProps> = ({ view, setView }) => {
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', name: 'Dapzem & Co (Sweatshirt)', description: 'Branded hoodie ethnic style', quantity: 2, price: 60, total: 120 },
  ]);

  const totalAmount = items.reduce((acc, item) => acc + item.total, 0);

  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), name: '', description: '', quantity: 1, price: 0, total: 0 }]);
  };

  const renderList = () => (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in duration-500">
      {/* Table Section */}
      <div className="xl:col-span-9 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Manage Invoices</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setView('CreateInvoice')}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90"
              >
                <i className="fa-solid fa-plus"></i> Create Invoice
              </button>
              <button className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><i className="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-table-header">
                <tr className="border-b border-foreground/10 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">
                  <th className="px-6 py-4">Client</th>
                  <th className="px-6 py-4">Invoice ID</th>
                  <th className="px-6 py-4">Issued Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Due Date</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_INVOICES.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setView('InvoiceDetail')}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={invoice.clientAvatar} className="w-9 h-9 rounded-full object-cover" alt="" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{invoice.clientName}</p>
                          <p className="text-[11px] text-slate-400 font-medium truncate">{invoice.clientEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-indigo-600 hover:underline">{invoice.invoiceId}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{invoice.issuedDate}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-900">${invoice.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                        invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' :
                        invoice.status === 'Pending' ? 'bg-amber-50 text-amber-600' :
                        invoice.status === 'Overdue' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{invoice.dueDate}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button className="p-2 bg-indigo-50 text-indigo-400 rounded-lg hover:text-indigo-600"><i className="fa-solid fa-print text-xs"></i></button>
                        <button className="p-2 bg-rose-50 text-rose-400 rounded-lg hover:text-rose-600"><i className="fa-solid fa-trash-can text-xs"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sidebar Section */}
      <div className="xl:col-span-3 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          {[
            { label: 'Total Invoices Amount', value: '$193.87K', change: '+3.25%', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'fa-file-invoice-dollar', count: 12345 },
            { label: 'Total Paid Invoices', value: '$68K', change: '-1.16%', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'fa-file-circle-check', count: 4176 },
            { label: 'Pending Invoices', value: '$81K', change: '+0.25%', color: 'text-amber-600', bg: 'bg-amber-50', icon: 'fa-clock-rotate-left', count: 7064 },
            { label: 'Overdue Invoices', value: '$33K', change: '-0.46%', color: 'text-rose-600', bg: 'bg-rose-50', icon: 'fa-circle-exclamation', count: 1105 },
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-4 group">
              <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform`}>
                <i className={`fa-solid ${stat.icon}`}></i>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight truncate">{stat.label}</p>
                  <span className={`${stat.bg} ${stat.color} px-1.5 py-0.5 rounded text-[9px] font-bold`}>{stat.count}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{stat.value}</h3>
                <p className={`text-[10px] font-bold ${stat.change.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stat.change} <span className="text-slate-400 font-medium">this month</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-bold text-slate-900">Invoice Status <span className="text-slate-400 font-medium">(Last 6 months)</span></h4>
            <button className="text-slate-300 hover:text-slate-600"><i className="fa-solid fa-ellipsis"></i></button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CHART_DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="paid" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={12} />
                <Bar dataKey="pending" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} barSize={12} />
                <Bar dataKey="overdue" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCreate = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 p-10 shadow-sm space-y-12">
        {/* Header Inputs */}
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 text-2xl">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
           </div>
           <div className="flex-1 flex gap-4">
              <input type="text" placeholder="INV TITLE" className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              <div className="text-slate-300 py-2">:</div>
              <input type="text" placeholder="INV ID" className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
           </div>
           <div className="flex gap-2">
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700">Save As PDF <i className="fa-solid fa-save ml-2"></i></button>
              <button className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><i className="fa-solid fa-plus"></i></button>
              <button className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><i className="fa-solid fa-download"></i></button>
           </div>
        </div>

        {/* Billing Section */}
        <div className="grid grid-cols-2 gap-20">
           <div className="space-y-4">
              <label className="text-xs font-bold text-slate-400 uppercase">Billing From :</label>
              <input type="text" defaultValue="SPRUKO TECHNOLOGIES" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none font-bold" />
              <textarea placeholder="Enter Address" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none min-h-[100px] resize-none"></textarea>
              <input type="text" placeholder="Company Email" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              <input type="text" placeholder="Phone Number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
           </div>
           <div className="space-y-4">
              <label className="text-xs font-bold text-slate-400 uppercase">Billing To :</label>
              <input type="text" defaultValue="Json Taylor" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none font-bold" />
              <textarea placeholder="Enter Address" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none min-h-[100px] resize-none"></textarea>
              <input type="text" placeholder="Customer Email" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              <input type="text" placeholder="Phone Number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              <div className="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="Zip Code" className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
                 <select className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none text-slate-400">
                    <option>Select Currency</option>
                 </select>
              </div>
           </div>
        </div>

        {/* Date Section */}
        <div className="grid grid-cols-4 gap-4">
           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-900 uppercase">Invoice ID</label>
              <input type="text" defaultValue="#SPK120219890" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none font-bold text-slate-500" />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-900 uppercase">Date Issued</label>
              <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none text-slate-400" />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-900 uppercase">Due Date</label>
              <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none text-slate-400" />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-900 uppercase">Due Amount</label>
              <input type="text" defaultValue="$12,983.78" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none font-bold text-slate-900" />
           </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-foreground/10 bg-table-header text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">
                <th className="py-4">Product Name</th>
                <th className="py-4">Description</th>
                <th className="py-4 w-24">Quantity</th>
                <th className="py-4 w-32">Price Per Unit</th>
                <th className="py-4 w-32">Total</th>
                <th className="py-4 w-12 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item, idx) => (
                <tr key={item.id} className="group">
                  <td className="py-4 pr-4">
                     <input type="text" placeholder="Enter Product Name" defaultValue={item.name} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
                  </td>
                  <td className="py-4 pr-4">
                     <input type="text" placeholder="Enter Description" defaultValue={item.description} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none" />
                  </td>
                  <td className="py-4 pr-4">
                     <div className="flex items-center gap-2">
                        <button className="w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">-</button>
                        <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                        <button className="w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">+</button>
                     </div>
                  </td>
                  <td className="py-4 pr-4">
                     <input type="text" defaultValue={`$${item.price.toFixed(2)}`} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none font-bold text-slate-600" />
                  </td>
                  <td className="py-4 pr-4">
                     <input type="text" defaultValue={`$${item.total.toFixed(2)}`} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none font-bold text-slate-900" />
                  </td>
                  <td className="py-4">
                     <button className="w-8 h-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-100 transition-colors"><i className="fa-solid fa-trash-can text-xs"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addItem} className="mt-6 text-xs font-bold text-indigo-600 hover:underline flex items-center gap-2">
             <i className="fa-solid fa-plus-circle"></i> Add More Item
          </button>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
         <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-8">
            <div>
               <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                  Mode Of Payment
               </h4>
            </div>
            
            <div className="flex p-1 bg-slate-50 rounded-xl">
               <button className="flex-1 py-2 text-[10px] font-bold rounded-lg text-slate-600">UPI</button>
               <button className="flex-1 py-2 text-[10px] font-bold rounded-lg bg-white text-slate-900 shadow-sm border border-slate-200">Credit/Debit Card</button>
            </div>

            <div className="space-y-4">
               <input type="text" placeholder="Card Holder Name" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none" />
               <div className="space-y-1">
                  <input type="text" defaultValue="1234 5678 9087 XXXX" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none font-bold text-slate-500" />
                  <p className="text-[9px] font-bold text-rose-500">*Enter valid card number*</p>
               </div>
               <input type="text" placeholder="Enter OTP" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none" />
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
               <p className="text-[10px] font-bold text-emerald-600 leading-relaxed">
                  Please Make sure to pay the invoice bill within 30 days.
               </p>
            </div>
         </div>
      </div>
    </div>
  );

  const renderDetail = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 pb-12">
      <div className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 p-10 shadow-sm space-y-12">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 text-2xl">
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <h2 className="text-xl font-bold text-slate-900 uppercase">Shopping Invoice : <span className="text-indigo-600">#8140-2099</span></h2>
           </div>
           <div className="flex gap-2">
              <button className="bg-indigo-400 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-indigo-500 flex items-center gap-2">Print <i className="fa-solid fa-print"></i></button>
              <button className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 flex items-center gap-2">Save As PDF <i className="fa-solid fa-save"></i></button>
           </div>
        </div>

        <div className="grid grid-cols-2 gap-20">
           <div className="space-y-4">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Billing From :</p>
              <div>
                 <h4 className="font-bold text-slate-900">SPRUKO TECHNOLOGIES</h4>
                 <p className="text-xs text-slate-400 font-medium leading-relaxed">
                   Mig-1-11, Manroe street<br/>
                   Georgetown, Washington D.C, USA, 200071<br/>
                   sprukotrust.ynex@gmail.com<br/>
                   (555) 555-1234
                 </p>
                 <p className="text-[10px] font-bold text-indigo-600 mt-2 hover:underline cursor-pointer">For more information check for GSTIN Details.</p>
              </div>
           </div>
           <div className="space-y-4">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Billing To :</p>
              <div>
                 <h4 className="font-bold text-slate-900">Json Taylor</h4>
                 <p className="text-xs text-slate-400 font-medium leading-relaxed">
                   Lig-22-1,20 Covington Place<br/>
                   New Castle, de, United States, 19320<br/>
                   jsontaylor2134@gmail.com<br/>
                   +1 202-918-2132
                 </p>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-4 gap-4 pb-8 border-b border-slate-50">
           <div className="space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Invoice ID :</p>
              <p className="text-sm font-bold text-slate-900">#SPK120219890</p>
           </div>
           <div className="space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Date Issued :</p>
              <p className="text-sm font-bold text-slate-900">29, Nov 2022 - <span className="text-slate-400">12:42PM</span></p>
           </div>
           <div className="space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Due Date :</p>
              <p className="text-sm font-bold text-slate-900">29, Dec 2022</p>
           </div>
           <div className="space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Due Amount :</p>
              <p className="text-2xl font-bold text-slate-900">$2,570.42</p>
           </div>
        </div>

        <div className="overflow-x-auto">
           <table className="w-full text-left">
              <thead>
                 <tr className="border-b border-foreground/10 bg-table-header text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">
                    <th className="py-4">Brand Name</th>
                    <th className="py-4">Description</th>
                    <th className="py-4">Quantity</th>
                    <th className="py-4">Price Per Unit</th>
                    <th className="py-4">Total</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {[
                   { name: 'Dapzem & Co (Sweatshirt)', desc: 'Branded hoodie ethnic style', qty: 2, price: 60, total: 120 },
                   { name: 'Denim Winjo (Jacket)', desc: 'Vintage pure leather jacket', qty: 1, price: 249, total: 249 },
                   { name: 'Jimmy Lolfiger (Winter Coat)', desc: 'Unisex jacket for men & women', qty: 1, price: 499, total: 499 },
                   { name: 'Blueberry & Co', desc: 'Light colored sweater from blueberry', qty: 3, price: 299, total: 897 },
                   { name: 'Denim Corporation', desc: 'Flap pockets denim jackets for men', qty: 1, price: 599, total: 599 },
                 ].map((item, i) => (
                   <tr key={i}>
                      <td className="py-5 text-sm font-bold text-slate-800">{item.name}</td>
                      <td className="py-5 text-xs text-slate-400 font-medium italic">{item.desc}</td>
                      <td className="py-5 text-sm font-bold text-slate-800">{item.qty}</td>
                      <td className="py-5 text-sm font-bold text-slate-800">${item.price}</td>
                      <td className="py-5 text-sm font-bold text-slate-800">${item.total}</td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
         <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-8">
            <div>
               <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-indigo-500 rounded-full"></span>
                  Mode Of Payment
               </h4>
            </div>
            
            <div className="space-y-6">
               <h5 className="text-sm font-bold text-slate-900">Credit/Debit Card</h5>
               <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-bold text-slate-400">Name On Card :</span>
                     <span className="font-bold text-slate-800">Json Taylor</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-bold text-slate-400">Card Number :</span>
                     <span className="font-bold text-slate-800">1234 5678 9087 XXXX</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-bold text-slate-400">Total Amount :</span>
                     <span className="font-bold text-emerald-600">$2570.42</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-bold text-slate-400">Due Date :</span>
                     <span className="font-bold text-slate-800">29, Dec 2022 - <span className="text-rose-500">30 days due</span></span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-bold text-slate-400">Invoice Status :</span>
                     <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-bold">Pending</span>
                  </div>
               </div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
               <p className="text-[10px] font-bold text-emerald-600 leading-relaxed">
                  Please Make sure to pay the invoice bill within 30 days.
               </p>
            </div>
         </div>
         <button onClick={() => setView('Invoices')} className="w-full py-3 bg-indigo-50 text-indigo-600 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-all">Back to List</button>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500">
       <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 capitalize">{view === 'list' ? 'Invoices' : view === 'create' ? 'Create Invoice' : 'Invoice Details'}</h1>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mt-1">
             <span className="text-indigo-600 cursor-pointer">Finance</span>
             <span className="text-slate-300">/</span>
             <span>{view}</span>
          </div>
       </div>

       {view === 'list' && renderList()}
       {view === 'create' && renderCreate()}
       {view === 'detail' && renderDetail()}
    </div>
  );
};

export default InvoiceModule;
