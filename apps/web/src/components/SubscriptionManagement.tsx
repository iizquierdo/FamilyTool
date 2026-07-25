
import React, { useState } from 'react';
import { Subscription } from '../types';

const MOCK_SUBSCRIPTIONS: Subscription[] = [
  { id: '1', customerName: 'Emma Smith', email: 'smith@kpmg.com', status: 'Active', billing: 'Auto-debit', product: 'Basic', createdDate: 'Aug 19, 2026', avatar: 'https://picsum.photos/seed/emma/100/100' },
  { id: '2', customerName: 'Melody Macy', email: 'melody@altbox.com', status: 'Active', billing: 'Manual - Credit Card', product: 'Basic', createdDate: 'Mar 10, 2026' },
  { id: '3', customerName: 'Max Smith', email: 'max@kt.com', status: 'Active', billing: 'Manual - Cash', product: 'Teams Bundle', createdDate: 'Feb 21, 2026', avatar: 'https://picsum.photos/seed/max/100/100' },
  { id: '4', customerName: 'Sean Bean', email: 'sean@dellito.com', status: 'Expiring', billing: 'Manual - Paypal', product: 'Enterprise', createdDate: 'Apr 15, 2026', avatar: 'https://picsum.photos/seed/sean/100/100' },
  { id: '5', customerName: 'Brian Cox', email: 'brian@exchange.com', status: 'Expiring', billing: 'Auto-debit', product: 'Basic', createdDate: 'Dec 20, 2026', avatar: 'https://picsum.photos/seed/brian/100/100' },
  { id: '6', customerName: 'Mikaela Collins', email: 'mik@pex.com', status: 'Active', billing: 'Auto-debit', product: 'Enterprise Bundle', createdDate: 'Dec 20, 2026' },
  { id: '7', customerName: 'Olivia Wild', email: 'olivia@wild.com', status: 'Suspended', billing: '--', product: 'Enterprise', createdDate: 'Sep 22, 2026' },
];

const SubscriptionManagement: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSub = MOCK_SUBSCRIPTIONS.find(s => s.id === selectedId);

  if (selectedId && selectedSub) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-right-4 duration-500 pb-12">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
            <div className="relative inline-block mb-4">
              <img src={selectedSub.avatar || `https://ui-avatars.com/api/?name=${selectedSub.customerName}&background=random`} className="w-32 h-32 rounded-2xl object-cover" alt="" />
              <span className="absolute bottom-2 right-2 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">{selectedSub.customerName}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Software Engineer</p>

            <div className="grid grid-cols-3 gap-2 mt-8 py-4 border-y border-slate-50">
              <div>
                <div className="text-emerald-600 font-bold text-sm">6,900 <i className="fa-solid fa-arrow-up text-[10px]"></i></div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Earnings</div>
              </div>
              <div>
                <div className="text-rose-500 font-bold text-sm">130 <i className="fa-solid fa-arrow-down text-[10px]"></i></div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Tasks</div>
              </div>
              <div>
                <div className="text-emerald-600 font-bold text-sm">500 <i className="fa-solid fa-arrow-up text-[10px]"></i></div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Hours</div>
              </div>
            </div>

            <div className="mt-8 text-left space-y-6">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-900">Details</h4>
                <button className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Edit</button>
              </div>
              <div className="space-y-4">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded">Premium user</span>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Account ID</p>
                  <p className="text-xs font-bold text-slate-700">ID-45453423</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Billing Email</p>
                  <p className="text-xs font-bold text-slate-700 truncate">{selectedSub.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Billing Address</p>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">101 Collin Street, Melbourne 3000 VIC, Australia</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-2 flex items-center justify-between shadow-sm">
            <nav className="flex gap-1">
              {['Overview', 'Events & Logs', 'Statements'].map(tab => (
                <button key={tab} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${tab === 'Overview' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>{tab}</button>
              ))}
            </nav>
            <div className="flex gap-2 p-1">
               <button onClick={() => setSelectedId(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-indigo-600">Back</button>
               <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">Actions <i className="fa-solid fa-chevron-down text-[10px]"></i></button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-lg font-bold text-slate-900">Payment Records</h3>
               <button className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-all">Add payment</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-foreground/10 bg-table-header text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">
                    <th className="py-4">Invoice No.</th>
                    <th className="py-4">Status</th>
                    <th className="py-4">Amount</th>
                    <th className="py-4">Date</th>
                    <th className="py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { no: '6377-2513', status: 'Successful', amount: '$1,200.00', date: '14 Dec 2020, 8:43 pm' },
                    { no: '6038-7163', status: 'Successful', amount: '$79.00', date: '01 Dec 2020, 10:12 am' },
                    { no: '3437-5841', status: 'Successful', amount: '$5,500.00', date: '12 Nov 2020, 2:01 pm' },
                    { no: '3381-6157', status: 'Pending', amount: '$880.00', date: '21 Oct 2020, 5:54 pm' },
                  ].map((row, i) => (
                    <tr key={i} className="group">
                      <td className="py-4 text-xs font-bold text-slate-500">{row.no}</td>
                      <td className="py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${row.status === 'Successful' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>{row.status}</span>
                      </td>
                      <td className="py-4 text-xs font-bold text-slate-700">{row.amount}</td>
                      <td className="py-4 text-xs font-bold text-slate-400">{row.date}</td>
                      <td className="py-4 text-right">
                         <button className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-[10px] font-bold group-hover:bg-slate-100 transition-all">Actions <i className="fa-solid fa-chevron-down text-[8px] ml-1"></i></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between shadow-sm gap-4">
        <div className="relative w-full md:w-80">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" placeholder="Search Subscriptions" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10" />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button className="px-6 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-filter"></i> Filter</button>
          <button className="px-6 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-upload"></i> Export</button>
          <button className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90">
            <i className="fa-solid fa-plus"></i> Add Subscription
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="border-b border-foreground/10 bg-table-header">
            <tr>
              <th className="w-12 px-6 py-4">
                <input type="checkbox" className="rounded border-slate-300 text-indigo-600" />
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Customer</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Billing</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Product</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Created Date</th>
              <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_SUBSCRIPTIONS.map(sub => (
              <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedId(sub.id)}>
                <td className="px-6 py-5"><input type="checkbox" className="rounded text-indigo-600 border-slate-300" onClick={e => e.stopPropagation()} /></td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <img src={sub.avatar || `https://ui-avatars.com/api/?name=${sub.customerName}&background=random`} className="w-10 h-10 rounded-xl" alt="" />
                    <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{sub.customerName}</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${sub.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : sub.status === 'Expiring' ? 'bg-orange-50 text-orange-600' : 'bg-rose-50 text-rose-600'}`}>{sub.status}</span>
                </td>
                <td className="px-6 py-5 text-xs font-bold text-slate-500">{sub.billing}</td>
                <td className="px-6 py-5 text-xs font-bold text-slate-400">{sub.product}</td>
                <td className="px-6 py-5 text-xs font-bold text-slate-400">{sub.createdDate}</td>
                <td className="px-6 py-5 text-right">
                   <button className="bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 ml-auto" onClick={e => e.stopPropagation()}>Actions <i className="fa-solid fa-chevron-down text-[8px]"></i></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SubscriptionManagement;
