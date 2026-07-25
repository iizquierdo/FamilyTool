
import React, { useState } from 'react';
import { ChatThread } from '../types';
import { useTranslation } from 'react-i18next';

const MOCK_CHATS: ChatThread[] = [
  {
    id: '1',
    name: 'Melody Macy',
    email: 'melody@altbox.com',
    status: 'Active',
    lastMessageTime: '3 hrs',
    messages: [
      { id: 'm1', sender: 'Melody Macy', text: 'Hello! Are we still on for the review?', time: '3 hrs' }
    ]
  },
  {
    id: '2',
    name: 'Max Smith',
    email: 'max@kt.com',
    status: 'Active',
    lastMessageTime: '1 day',
    unreadCount: 5,
    avatar: 'https://picsum.photos/seed/max/100/100',
    messages: [
      { id: 'm2', sender: 'Max Smith', text: 'The repository is ready.', time: '1 day' }
    ]
  },
  {
    id: '3',
    name: 'Sean Bean',
    email: 'sean@dellito.com',
    status: 'Offline',
    lastMessageTime: '5 hrs',
    unreadCount: 5,
    avatar: 'https://picsum.photos/seed/sean/100/100',
    messages: []
  },
  {
    id: '4',
    name: 'Brian Cox',
    email: 'brian@exchange.com',
    status: 'Active',
    lastMessageTime: '5 hrs',
    avatar: 'https://picsum.photos/seed/brian/100/100',
    messages: [
      { id: 'm4', sender: 'Brian Cox', text: 'How likely are you to recommend our company to your friends and family?', time: '2 mins' },
      { id: 'm5', sender: 'You', text: 'Hey there, we\'re just writing to let you know that you\'ve been subscribed to a repository on GitHub.', time: '5 mins' },
      { id: 'm6', sender: 'Brian Cox', text: 'Check the latest updates in the docs.', time: '1 hour' }
    ]
  },
  {
    id: '5',
    name: 'Mikaela Collins',
    email: 'mik@pex.com',
    status: 'Active',
    lastMessageTime: '1 day',
    unreadCount: 5,
    messages: []
  },
  {
    id: '6',
    name: 'Francis Mitcham',
    email: 'f.mit@kpmg.com',
    status: 'Active',
    lastMessageTime: '1 week',
    unreadCount: 9,
    avatar: 'https://picsum.photos/seed/francis/100/100',
    messages: []
  },
  {
    id: '7',
    name: 'Olivia Wild',
    email: 'olivia@wild.com',
    status: 'Offline',
    lastMessageTime: '1 week',
    messages: []
  }
];

const ChatModule: React.FC = () => {
  const { t } = useTranslation();
  const [selectedChatId, setSelectedChatId] = useState<string>('4');
  const [newMessage, setNewMessage] = useState('');

  const activeChat = MOCK_CHATS.find(c => c.id === selectedChatId) || MOCK_CHATS[0];

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-160px)] animate-in fade-in duration-500">
      {/* Sidebar List */}
      <div className="w-full lg:w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input
              type="text"
              placeholder={t('chat.search')}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {MOCK_CHATS.map(chat => (
            <button
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-all text-left ${selectedChatId === chat.id ? 'bg-slate-50' : ''}`}
            >
              <div className="relative">
                {chat.avatar ? (
                  <img src={chat.avatar} className="w-10 h-10 rounded-xl" alt="" />
                ) : (
                  <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center font-bold text-xs">
                    {chat.name.charAt(0)}
                  </div>
                )}
                <span className={`absolute bottom-[-2px] right-[-2px] w-3 h-3 border-2 border-white rounded-full ${chat.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-sm font-bold text-slate-900 truncate">{chat.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{chat.lastMessageTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-slate-400 truncate font-medium">{chat.email}</p>
                  {chat.unreadCount ? (
                    <span className="bg-rose-50 text-rose-500 px-1.5 py-0.5 rounded-lg text-[10px] font-bold">{chat.unreadCount}</span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedChatId === 'group' ? (
              <div className="flex -space-x-2">
                {MOCK_CHATS.slice(0, 5).map((c, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-full h-full object-cover" alt="" />
                  </div>
                ))}
                <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">+42</div>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-bold text-slate-900">{activeChat.name}</h3>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${activeChat.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  {activeChat.status}
                </div>
              </div>
            )}
          </div>
          <button className="p-2 text-slate-300 hover:text-indigo-600 bg-slate-50 rounded-lg"><i className="fa-solid fa-ellipsis"></i></button>
        </div>

        {/* Message Flow */}
        <div className="flex-1 p-6 space-y-8 overflow-y-auto bg-slate-50/10">
          {activeChat.messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.sender === 'You' ? 'flex-row-reverse' : ''}`}>
              <img
                src={msg.sender === 'You' ? 'https://picsum.photos/seed/admin/100/100' : (activeChat.avatar || `https://ui-avatars.com/api/?name=${activeChat.name}`)}
                className="w-10 h-10 rounded-xl"
                alt=""
              />
              <div className={`max-w-[70%] ${msg.sender === 'You' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold text-slate-400">{msg.time}</span>
                  <span className="text-sm font-bold text-slate-900">{msg.sender}</span>
                </div>
                <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed ${msg.sender === 'You' ? 'bg-indigo-50 text-slate-700' : 'bg-slate-50 text-slate-700 border border-slate-100'}`}>
                  {msg.text}
                </div>
              </div>
            </div>
          ))}

          {/* Mock extra Brian Cox bubble as per screenshot */}
          {selectedChatId === '4' && (
            <div className="flex gap-4">
              <img src={activeChat.avatar} className="w-10 h-10 rounded-xl" alt="" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-slate-900">Brian Cox</span>
                  <span className="text-[11px] font-bold text-slate-400">1 Hour</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-6 border-t border-slate-50">
          <div className="flex items-end gap-4">
            <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t('chat.typeMessage')}
                className="w-full bg-transparent border-none outline-none text-sm p-3 min-h-[44px] max-h-32 resize-none"
              ></textarea>
              <div className="flex items-center gap-2 px-3 pb-1 pt-1">
                <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-paperclip"></i></button>
                <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-cloud-arrow-up"></i></button>
                <div className="ml-auto flex items-center gap-1 opacity-20 hover:opacity-100 transition-opacity">
                  <i className="fa-solid fa-chevron-up text-[8px] text-slate-400"></i>
                  <i className="fa-solid fa-chevron-down text-[8px] text-slate-400"></i>
                  <i className="fa-solid fa-signature text-xs text-slate-400 ml-1"></i>
                </div>
              </div>
            </div>
            <button className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">{t('chat.send')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatModule;
