
import React, { useState } from 'react';
import { Message } from '../types';

const MOCK_MESSAGES: Message[] = [
  { id: '1', sender: 'Melody Macy', subject: 'Digital PPV Customer Confirmation', preview: 'By Keenthemes to save tons and more to time money...', time: '8:30 PM', tags: ['inbox', 'task'], isRead: false },
  { id: '2', sender: 'Max Smith', subject: 'Your iBuy.com grocery shopping confirmation', preview: 'Please check your receipt attached below...', time: 'day ago', tags: [], isRead: true, avatar: 'https://picsum.photos/seed/max/100/100' },
  { id: '3', sender: 'Sean Bean', subject: 'Your Order #224820998666029 has been Confirmed', preview: 'Thank you for your purchase. Your order is processing...', time: '11:20 PM', tags: [], isRead: true, avatar: 'https://picsum.photos/seed/sean/100/100' },
  { id: '4', sender: 'Brian Cox', subject: 'Payment Notification DLOP2329KD', preview: 'Your payment was received successfully.', time: '2 days ago', tags: ['new'], isRead: false, avatar: 'https://picsum.photos/seed/brian/100/100' },
  { id: '5', sender: 'Mikaela Collins', subject: 'Congratulations on your iRun Coach subscription', preview: 'Welcome to the team! Here is how to get started.', time: 'July 25', tags: [], isRead: true },
  { id: '6', sender: 'Emma Smith', subject: 'Trip Reminder. Thank you for flying with us!', preview: 'Hi Bob, With respect, i must disagree with Mr.Zinsser. We all know the most part of important part of any article is the title.', time: '1 day ago', tags: ['inbox', 'important'], isRead: true, avatar: 'https://picsum.photos/seed/emma/100/100', content: "Hi Bob,\n\nWith respect, i must disagree with Mr.Zinsser. We all know the most part of important part of any article is the title. Without a compelling title, your reader won't even get to the first sentence. After the title, however, the first few sentences of your article are certainly the most important part.\n\nJournalists call this critical, introductory section the \"Lede,\" and when bridge properly executed, it's the that carries your reader from an headline try at attention-grabbing to the body of your blog post.\n\nBest regards,\nJason Muller" },
];

const InboxModule: React.FC = () => {
  const [view, setView] = useState<'list' | 'compose' | 'detail'>('list');
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  const selectedMsg = MOCK_MESSAGES.find(m => m.id === selectedMsgId) || MOCK_MESSAGES[5];

  const renderSidebar = () => (
    <div className="w-full lg:w-72 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <button 
          onClick={() => setView('compose')}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 transition-all mb-8"
        >
          New Message
        </button>

        <nav className="space-y-1">
          {[
            { label: 'Inbox', icon: 'fa-envelope-open', count: 3, active: view === 'list' },
            { label: 'Marked', icon: 'fa-star', count: 0 },
            { label: 'Draft', icon: 'fa-file-lines', count: 5 },
            { label: 'Sent', icon: 'fa-paper-plane' },
            { label: 'Trash', icon: 'fa-trash-can' },
          ].map(item => (
            <button 
              key={item.label}
              onClick={() => { setView('list'); setSelectedMsgId(null); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${item.active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3">
                <i className={`fa-solid ${item.icon} w-5 opacity-70`}></i>
                {item.label}
              </div>
              {item.count ? <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg text-[10px]">{item.count}</span> : null}
            </button>
          ))}
        </nav>

        <div className="mt-10 pt-6 border-t border-slate-100">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 ml-4">LABELS</p>
           <nav className="space-y-1">
             {[
               { label: 'Custom Work', color: 'text-rose-500', count: 6 },
               { label: 'Partnership', color: 'text-emerald-500' },
               { label: 'In Progress', color: 'text-indigo-500' },
             ].map(label => (
                <button key={label.label} className="w-full flex items-center justify-between px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ring-2 ring-white border-2 border-current ${label.color}`}></span>
                    {label.label}
                  </div>
                  {label.count ? <span className="bg-rose-50 text-rose-500 px-2 py-0.5 rounded-lg text-[10px]">{label.count}</span> : null}
                </button>
             ))}
             <button className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-slate-400 hover:text-indigo-600">
               <i className="fa-solid fa-plus text-xs"></i> Add Label
             </button>
           </nav>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500 pb-12">
      {renderSidebar()}

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {view === 'list' && (
          <>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
               <div className="flex items-center gap-1">
                  <input type="checkbox" className="rounded border-slate-300 mr-2 ml-2" />
                  <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-rotate"></i></button>
                  <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-box-archive"></i></button>
                  <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-trash-can"></i></button>
                  <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-chevron-down text-xs"></i></button>
                  <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-ellipsis text-sm"></i></button>
               </div>
               <div className="relative w-64">
                 <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                 <input type="text" placeholder="Search inbox" className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/10" />
               </div>
            </div>
            <div className="divide-y divide-slate-50 overflow-y-auto">
              {MOCK_MESSAGES.map(msg => (
                <div 
                  key={msg.id} 
                  onClick={() => { setSelectedMsgId(msg.id); setView('detail'); }}
                  className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-all cursor-pointer group ${!msg.isRead ? 'bg-indigo-50/10' : ''}`}
                >
                  <input type="checkbox" className="rounded border-slate-300" onClick={e => e.stopPropagation()} />
                  <div className="flex flex-col items-center gap-1 text-slate-300">
                    <button className="hover:text-amber-400"><i className="fa-solid fa-star text-sm"></i></button>
                    <button className="hover:text-indigo-500"><i className="fa-solid fa-bookmark text-[10px]"></i></button>
                  </div>
                  <div className="flex items-center gap-3 w-40 min-w-[160px]">
                    {msg.avatar ? (
                      <img src={msg.avatar} className="w-9 h-9 rounded-xl" alt="" />
                    ) : (
                      <div className="w-9 h-9 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center font-bold text-xs">
                        {msg.sender.charAt(0)}
                      </div>
                    )}
                    <span className={`text-sm ${!msg.isRead ? 'font-bold text-slate-900' : 'text-slate-600 font-medium'}`}>{msg.sender}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm truncate ${!msg.isRead ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{msg.subject}</span>
                      {msg.tags.map(tag => (
                        <span key={tag} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${tag === 'inbox' ? 'bg-indigo-50 text-indigo-600' : tag === 'task' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-500'}`}>{tag}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 truncate font-medium">{msg.preview}</p>
                  </div>
                  <div className="text-xs font-bold text-slate-400 whitespace-nowrap">{msg.time}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'compose' && (
          <div className="flex flex-col h-full animate-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-slate-100">
               <h3 className="text-lg font-bold text-slate-900">Compose Message</h3>
             </div>
             <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                   <div className="flex items-center gap-3 flex-1">
                      <span className="text-sm font-bold text-slate-900">To:</span>
                      <input type="text" className="flex-1 border-none outline-none text-sm font-medium" />
                   </div>
                   <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                     <button className="hover:text-indigo-600">Cc</button>
                     <button className="hover:text-indigo-600">Bcc</button>
                   </div>
                </div>
                <div className="py-2 border-b border-slate-100">
                   <input type="text" placeholder="Subject" className="w-full border-none outline-none text-sm font-medium text-slate-400" />
                </div>
                <div className="bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
                   <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-100 bg-white">
                      <select className="text-xs font-bold text-slate-500 outline-none border-none bg-transparent">
                        <option>Normal</option>
                      </select>
                      <div className="w-[1px] h-4 bg-slate-200"></div>
                      <button className="text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-bold text-xs"></i></button>
                      <button className="text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-italic text-xs"></i></button>
                      <button className="text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-underline text-xs"></i></button>
                      <div className="w-[1px] h-4 bg-slate-200"></div>
                      <button className="text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-image text-xs"></i></button>
                      <button className="text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-code text-xs"></i></button>
                   </div>
                   <textarea placeholder="Type your text here..." className="w-full min-h-[300px] p-6 border-none outline-none bg-transparent text-sm text-slate-600 resize-none"></textarea>
                </div>
             </div>
             <div className="p-6 bg-slate-50/30 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex overflow-hidden rounded-xl shadow-lg shadow-indigo-100">
                    <button className="bg-indigo-600 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-indigo-700">Send</button>
                    <button className="bg-indigo-600 text-white px-3 py-2.5 border-l border-indigo-500/50 hover:bg-indigo-700"><i className="fa-solid fa-chevron-down text-[10px]"></i></button>
                  </div>
                  <button className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"><i className="fa-solid fa-paperclip"></i></button>
                  <button className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"><i className="fa-solid fa-location-dot"></i></button>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2.5 text-slate-300 hover:text-indigo-600 rounded-xl"><i className="fa-solid fa-gear"></i></button>
                  <button className="p-2.5 text-slate-300 hover:text-rose-500 rounded-xl"><i className="fa-solid fa-trash-can"></i></button>
                </div>
             </div>
          </div>
        )}

        {view === 'detail' && selectedMsg && (
          <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
             <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1">
                   <button onClick={() => setView('list')} className="p-2 text-slate-400 hover:text-indigo-600 mr-2"><i className="fa-solid fa-arrow-left"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-box-archive text-sm"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-circle-exclamation text-sm"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-trash-can text-sm"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-folder-open text-sm"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-arrow-right text-sm"></i></button>
                </div>
                <div className="flex items-center gap-3">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">1 - 50 of 235</span>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-chevron-left text-xs"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-chevron-right text-xs"></i></button>
                   <button className="p-2 text-slate-400 hover:text-indigo-600"><i className="fa-solid fa-ellipsis text-sm"></i></button>
                </div>
             </div>
             
             <div className="p-10 flex-1 overflow-y-auto">
                <div className="flex items-start justify-between mb-10">
                   <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-2xl font-bold text-slate-900">{selectedMsg.subject}</h2>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase">inbox</span>
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-500 text-[10px] font-bold rounded uppercase">important</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-3">
                      <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-arrows-up-down text-sm"></i></button>
                      <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-print text-sm"></i></button>
                   </div>
                </div>

                <div className="space-y-12">
                   {/* Main Message */}
                   <div className="flex gap-6 group">
                      <img src={selectedMsg.avatar || `https://ui-avatars.com/api/?name=${selectedMsg.sender}&background=random`} className="w-14 h-14 rounded-2xl shadow-sm" alt="" />
                      <div className="flex-1">
                         <div className="flex items-center justify-between mb-4">
                            <div>
                               <p className="text-sm font-bold text-slate-900">{selectedMsg.sender} <span className="mx-2 w-2 h-2 rounded-full bg-emerald-500 inline-block ring-4 ring-emerald-50"></span> <span className="text-slate-400 font-medium">1 day ago</span></p>
                               <button className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">to me <i className="fa-solid fa-chevron-down text-[8px]"></i></button>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button className="p-2 text-slate-300 hover:text-amber-400"><i className="fa-solid fa-star"></i></button>
                               <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-reply"></i></button>
                               <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-pen"></i></button>
                               <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-ellipsis"></i></button>
                            </div>
                         </div>
                         <div className="text-sm text-slate-600 leading-relaxed space-y-4">
                            {selectedMsg.content ? selectedMsg.content.split('\n\n').map((p, i) => <p key={i}>{p}</p>) : <p>{selectedMsg.preview}</p>}
                         </div>
                      </div>
                   </div>

                   {/* Thread Replies Placeholder */}
                   {[
                     { sender: 'Max Smith', avatar: 'https://picsum.photos/seed/max/100/100', text: 'Jornalists call this critical, introductory section the "Lede," and when bridge properly executed....' },
                     { sender: 'Sean Bean', avatar: 'https://picsum.photos/seed/sean/100/100', text: 'Jornalists call this critical, introductory section the "Lede," and when bridge properly executed....' }
                   ].map((reply, i) => (
                      <div key={i} className="flex gap-6 group opacity-70 hover:opacity-100 transition-all border-t border-slate-50 pt-8">
                        <img src={reply.avatar} className="w-12 h-12 rounded-xl object-cover" alt="" />
                        <div className="flex-1">
                           <div className="flex items-center justify-between mb-2">
                             <p className="text-sm font-bold text-slate-900">{reply.sender} <span className="mx-2 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> <span className="text-slate-400 font-medium">{i+2} days ago</span></p>
                             <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button className="p-2 text-slate-300 hover:text-amber-400"><i className="fa-solid fa-star text-xs"></i></button>
                               <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-reply text-xs"></i></button>
                               <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-ellipsis text-xs"></i></button>
                             </div>
                           </div>
                           <p className="text-xs text-slate-500 truncate italic">{reply.text}</p>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 whitespace-nowrap pt-1">10 Nov 2026, 9:23 pm</div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxModule;
