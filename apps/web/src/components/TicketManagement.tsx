
import React, { useState } from 'react';
import { Ticket } from '../types';

const MOCK_TICKETS: Ticket[] = [
  { id: '1', title: 'What admin theme does?', description: 'By Keenthemes to save tons and more to time money projects are listed and outstanding Check Out', status: 'Open', priority: 'High', category: 'React', date: '3 days ago' },
  { id: '2', title: 'How Extended Licese works?', description: 'Understanding the scope of usage for multiple projects and end-users.', status: 'In Progress', priority: 'Medium', category: 'Laravel', date: '5 days ago' },
  { id: '3', title: 'Payment gateway integration error', description: 'SSL handshake failing on production environment.', status: 'Open', priority: 'High', category: 'Security', date: 'Today' },
];

const TicketManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Hero Search Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-10 md:p-16 relative overflow-hidden shadow-sm">
        <div className="relative z-10 max-w-xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">How Can We Help You?</h2>
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500"></i>
            <input 
              type="text" 
              placeholder="Ask a question" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
            />
          </div>
        </div>
        
        {/* Abstract Illustration Placeholder */}
        <div className="absolute right-10 bottom-0 top-0 hidden lg:flex items-center">
           <img 
             src="https://preview.keenthemes.com/metronic8/demo1/assets/media/illustrations/sigma-1/17.png" 
             alt="Support" 
             className="h-64 md:h-80 object-contain opacity-90"
           />
        </div>
      </div>

      {/* Navigation Sub-header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-col md:flex-row items-center justify-between shadow-sm">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar w-full md:w-auto">
          {['OVERVIEW', 'TICKETS', 'TUTORIALS', 'FAQ', 'LICENSES', 'CONTACT US'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all whitespace-nowrap ${activeTab === tab ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
            >
              {tab}
            </button>
          ))}
        </nav>
        <button className="mt-2 w-full rounded-xl bg-primary px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 md:mt-0 md:w-auto">
          Create Ticket
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Popular Tickets */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold text-slate-900">Popular Tickets</h3>
            <button className="text-indigo-600 text-sm font-bold flex items-center gap-2 hover:underline">
              Support <i className="fa-solid fa-arrow-right text-xs"></i>
            </button>
          </div>
          
          <div className="space-y-8">
            {MOCK_TICKETS.map(ticket => (
              <div key={ticket.id} className="group cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-indigo-500 group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-chevron-down text-sm"></i>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{ticket.title}</h4>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[9px] font-bold rounded uppercase tracking-wider">{ticket.category}</span>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed mb-3">{ticket.description}</p>
                    <div className="flex items-center gap-2 text-indigo-600 text-[10px] font-bold hover:underline">
                      Check Out
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold text-slate-900">FAQ</h3>
            <button className="text-indigo-600 text-sm font-bold flex items-center gap-2 hover:underline">
              Full FAQ <i className="fa-solid fa-arrow-right text-xs"></i>
            </button>
          </div>

          <div className="space-y-8">
            {[
              { q: 'What admin theme does?', a: 'By Keenthemes to save tons and more to time money projects are listed and outstanding' },
              { q: 'How Extended Licese works?', a: 'Detailed documentation on license usage for corporate environments.' },
              { q: 'Can I reuse the assets in other projects?', a: 'Assets are restricted to the primary project unless extended license is acquired.' }
            ].map((faq, idx) => (
              <div key={idx} className="group cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-indigo-500 group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-chevron-right text-sm"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-2">{faq.q}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketManagement;
