
import React, { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    title: 'General Questions',
    items: [
      { question: 'What is your return policy?', answer: 'Our return policy allows for returns within 30 days of purchase with a valid receipt. Items must be in their original condition and packaging.' },
      { question: 'How long does shipping take?', answer: 'Shipping typically takes 3-5 business days for standard delivery and 1-2 business days for expedited shipping within the continental US.' },
      { question: 'Do you offer customer support?', answer: 'Yes, we offer 24/7 customer support via email and live chat. You can also reach us by phone during regular business hours.' },
    ]
  },
  {
    title: 'Manage Account',
    items: [
      { question: 'How do I update my account information?', answer: 'To update your account information, log in to your account and go to the "Settings" or "Profile" section. From there, you can edit your personal details, password, and preferences.' },
      { question: 'How can I delete my account?', answer: 'Account deletion can be requested through the security settings page or by contacting our support team directly for assistance.' },
    ]
  }
];

const FAQModule: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<string | null>('General Questions-0');

  const toggleAccordion = (id: string) => {
    setOpenIndex(openIndex === id ? null : id);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      {/* Page Header Breadcrumbs */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">FAQ</h2>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mt-1">
          <span className="text-indigo-600 cursor-pointer">Dashboard</span>
          <span className="text-slate-300">/</span>
          <span>FAQ</span>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-12 md:p-20 text-center shadow-xl shadow-blue-100">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 L100 0 L100 100 Z" fill="white" />
            <path d="M0 0 L100 100 L0 100 Z" fill="rgba(255,255,255,0.1)" />
          </svg>
        </div>
        
        <div className="relative z-10 space-y-4">
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">Have a question? We’re ready to help?</h1>
          <p className="text-blue-100 text-sm md:text-lg font-medium">Or choose a section to find what you need in seconds.</p>
          
          <div className="max-w-2xl mx-auto mt-10 relative">
            <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input 
              type="text" 
              placeholder="Search articles..." 
              className="w-full pl-12 pr-6 py-4 bg-white rounded-2xl shadow-lg border-none outline-none text-slate-600 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Accordion Section */}
        <div className="lg:col-span-8 space-y-10">
          {FAQ_DATA.map((category) => (
            <div key={category.title} className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 px-2">{category.title}</h3>
              <div className="space-y-3">
                {category.items.map((item, idx) => {
                  const id = `${category.title}-${idx}`;
                  const isOpen = openIndex === id;
                  return (
                    <div key={idx} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                      <button 
                        onClick={() => toggleAccordion(id)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-sm font-semibold text-slate-700">{item.question}</span>
                        <i className={`fa-solid fa-chevron-down text-xs text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
                      </button>
                      <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-40 border-t border-slate-50 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="p-6 text-sm text-slate-500 leading-relaxed">
                          {item.answer}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Form */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-8 sticky top-24">
            <div>
              <h4 className="text-lg font-bold text-slate-900">Have More Questions?</h4>
              <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">Send us your question, and we will get back to you shortly.</p>
            </div>
            
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name</label>
                  <input type="text" placeholder="Enter your name" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</label>
                  <input type="email" placeholder="Enter your email" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subject</label>
                <input type="text" placeholder="Enter your subject" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Message</label>
                <textarea placeholder="Type your message here..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none min-h-[120px] resize-none focus:ring-2 focus:ring-indigo-500/10 transition-all"></textarea>
              </div>

              <button className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all">
                Send Message
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FAQModule;
