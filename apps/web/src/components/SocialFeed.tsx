
import React from 'react';

const SocialFeed: React.FC = () => {
  const suggestions = [
    { name: 'Jacob Jones', company: 'Barone LLC.', id: 'jacob' },
    { name: 'Annette Black', company: 'Binford Ltd.', id: 'annette' },
    { name: 'Devon Lane', company: 'Acme Co.', id: 'devon' },
    { name: 'Kristin Watson', company: 'Biffco Enterprises Ltd.', id: 'kristin' },
    { name: 'Eleanor Pena', company: 'Abstergo Ltd.', id: 'eleanor' },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in duration-500 pb-12">
      {/* Left Column: Profile Card & Timeline */}
      <div className="xl:col-span-3 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
          <img src="https://picsum.photos/seed/jerry/200/200" className="w-32 h-32 rounded-2xl mx-auto mb-4 object-cover" alt="Jerry Kane" />
          <h3 className="font-bold text-lg text-slate-900">Jerry Kane</h3>
          <p className="text-xs text-slate-400 font-medium mb-6">Grade 8, AE3 Student</p>
          
          <div className="grid grid-cols-3 gap-2 mb-8 border-y border-slate-50 py-4">
            <div>
              <p className="font-bold text-slate-900 text-sm">642</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Posts</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">24 K</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Followers</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">12 K</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Following</p>
            </div>
          </div>

          <div className="space-y-1">
            {[
              { label: 'Feeds', icon: 'fa-rectangle-list', active: true },
              { label: 'Activity', icon: 'fa-chart-line', active: false },
              { label: 'Followers', icon: 'fa-user', active: false },
              { label: 'Settings', icon: 'fa-gear', active: false },
            ].map(item => (
              <button key={item.label} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${item.active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
                <i className={`fa-solid ${item.icon} w-5`}></i>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-slate-900">Timeline</h4>
            <button className="text-slate-300 hover:text-slate-600"><i className="fa-solid fa-ellipsis"></i></button>
          </div>
          <div className="space-y-6">
             <div className="flex gap-4">
                <div className="text-[10px] font-bold text-slate-400 w-10 mt-1">08:42</div>
                <div className="flex-1 relative pl-6 border-l-2 border-indigo-100 pb-2">
                  <div className="absolute top-0 -left-[9px] w-4 h-4 rounded-full border-4 border-white bg-indigo-500"></div>
                  <p className="text-sm text-slate-600 leading-relaxed">Outlines keep you honest. Indulging in poorly driving and keep you focused.</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Middle Column: Feed */}
      <div className="xl:col-span-6 space-y-6">
        {/* Composer */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex gap-4">
            <img src="https://picsum.photos/seed/jerry/50/50" className="w-10 h-10 rounded-xl" alt="" />
            <textarea 
              placeholder="What's on your mind, Jerry?" 
              className="flex-1 bg-transparent border-none resize-none outline-none text-slate-600 pt-2 min-h-[100px]"
            ></textarea>
          </div>
          <div className="flex justify-end mt-4">
            <button className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Post</button>
          </div>
        </div>

        {/* Post Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <img src="https://picsum.photos/seed/grace/100/100" className="w-12 h-12 rounded-xl" alt="" />
              <div>
                <p className="font-bold text-slate-900">Grace Logan</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Yesterday at 5:06 PM</p>
              </div>
            </div>
            <button className="text-slate-300 hover:text-slate-600"><i className="fa-solid fa-ellipsis"></i></button>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            There are two main approaches you can take to writing amazing blog post headlines. You can either decide on your final headline before outstanding you write the most of the rest of your creative post.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <img src="https://picsum.photos/seed/modern1/600/800" className="w-full h-80 object-cover rounded-2xl" alt="" />
            <div className="space-y-4">
              <img src="https://picsum.photos/seed/modern2/600/400" className="w-full h-[152px] object-cover rounded-2xl" alt="" />
              <div className="relative group cursor-pointer">
                <img src="https://picsum.photos/seed/modern3/600/400" className="w-full h-[152px] object-cover rounded-2xl" alt="" />
                <div className="absolute inset-0 bg-indigo-600/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white font-bold">+ 12 more</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Suggestions & Trending */}
      <div className="xl:col-span-3 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="font-bold text-slate-900">Suggestions for you</h4>
              <p className="text-[10px] text-slate-400 font-bold">8k social visitors</p>
            </div>
            <button className="text-slate-300 hover:text-slate-600"><i className="fa-solid fa-ellipsis"></i></button>
          </div>
          <div className="space-y-5">
            {suggestions.map(person => (
              <div key={person.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={`https://picsum.photos/seed/${person.id}/50/50`} className="w-10 h-10 rounded-xl" alt="" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{person.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{person.company}</p>
                  </div>
                </div>
                <button className="px-3 py-1.5 bg-slate-50 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all">Follow</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="font-bold text-slate-900">Trending Feeds</h4>
              <p className="text-[10px] text-slate-400 font-bold">8k social visitors</p>
            </div>
            <button className="text-xs font-bold text-indigo-600 hover:underline">View All</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src="https://picsum.photos/seed/trend1/300/300" className="w-full aspect-square object-cover rounded-xl" alt="" />
            <img src="https://picsum.photos/seed/trend2/300/300" className="w-full aspect-square object-cover rounded-xl" alt="" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialFeed;
