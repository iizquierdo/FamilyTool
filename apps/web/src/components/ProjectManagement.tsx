
import React, { useState } from 'react';
import { Project } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_PROJECTS: Project[] = [
  { id: '1', name: 'CRM Dashboard', status: 'In Progress', dueDate: '29 Jan, 2026', openTasks: 75, budgetSpent: '$15,000', category: 'Web App', description: '#1 Tool to get started with Web Apps any Kind & size' },
  { id: '2', name: 'Mobile App Redesign', status: 'Yet to start', dueDate: '15 Feb, 2026', openTasks: 12, budgetSpent: '$2,400', category: 'Mobile', description: 'Complete UI overhaul for the consumer facing app.' },
  { id: '3', name: 'E-commerce API', status: 'Completed', dueDate: '10 Jan, 2026', openTasks: 0, budgetSpent: '$8,900', category: 'Backend', description: 'Scalable node.js backend for retail platform.' },
];

const TASK_HISTORY = [
  { name: '2020', complete: 55, incomplete: 70 },
  { name: '2021', complete: 58, incomplete: 70 },
  { name: '2022', complete: 62, incomplete: 80 },
  { name: '2023', complete: 60, incomplete: 75 },
  { name: '2024', complete: 65, incomplete: 75 },
];

const ProjectManagement: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');

  const selectedProject = MOCK_PROJECTS.find(p => p.id === selectedProjectId);

  if (!selectedProjectId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900">Projects</h2>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all">
            + New Project
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {MOCK_PROJECTS.map(project => (
            <div 
              key={project.id} 
              onClick={() => setSelectedProjectId(project.id)}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md cursor-pointer transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {project.name.charAt(0)}
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                  project.status === 'In Progress' ? 'bg-indigo-50 text-indigo-600' : 
                  project.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {project.status}
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mb-1">{project.name}</h3>
              <p className="text-xs text-slate-500 mb-6 line-clamp-2">{project.description}</p>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-4">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Due Date</p>
                  <p className="text-sm font-bold text-slate-700">{project.dueDate}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Budget</p>
                  <p className="text-sm font-bold text-slate-700">{project.budgetSpent}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      {/* Detail Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <button 
            onClick={() => setSelectedProjectId(null)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all"
          >
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          
          <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
             <div className="w-16 h-16 bg-gradient-to-tr from-orange-400 to-rose-500 rounded-full flex items-center justify-center text-white text-3xl font-bold">
               {selectedProject?.name.charAt(0)}
             </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedProject?.name}</h2>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase">In Progress</span>
                </div>
                <p className="text-sm text-slate-400 font-medium mt-1">{selectedProject?.description}</p>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-slate-50 text-slate-700 font-bold text-xs rounded-lg border border-slate-200">Add User</button>
                <button className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg shadow-lg shadow-indigo-100">Add Target</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <div className="border border-dashed border-slate-200 rounded-2xl p-4 min-w-[140px]">
                <p className="text-sm font-bold text-slate-900 mb-1">{selectedProject?.dueDate}</p>
                <p className="text-xs text-slate-400 font-medium">Due Date</p>
              </div>
              <div className="border border-dashed border-slate-200 rounded-2xl p-4 min-w-[140px]">
                <p className="text-sm font-bold text-rose-600 mb-1 flex items-center gap-2">
                  <i className="fa-solid fa-arrow-down text-[10px]"></i> {selectedProject?.openTasks}
                </p>
                <p className="text-xs text-slate-400 font-medium">Open Tasks</p>
              </div>
              <div className="border border-dashed border-slate-200 rounded-2xl p-4 min-w-[140px]">
                <p className="text-sm font-bold text-emerald-600 mb-1 flex items-center gap-2">
                  <i className="fa-solid fa-arrow-up text-[10px]"></i> {selectedProject?.budgetSpent}
                </p>
                <p className="text-xs text-slate-400 font-medium">Budget Spent</p>
              </div>
              
              <div className="flex -space-x-3 ml-auto items-center">
                 {[1,2,3,4,5].map(i => (
                   <img key={i} src={`https://picsum.photos/seed/${i+10}/40/40`} className="w-10 h-10 rounded-full border-4 border-white object-cover" />
                 ))}
                 <div className="w-10 h-10 rounded-full border-4 border-white bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">+42</div>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex gap-8 mt-10 border-t border-slate-100 pt-6">
          {['Overview', 'Targets', 'Budget', 'Users', 'Files', 'Activity', 'Settings'].map((tab) => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === tab ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Detail Content (Overview Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-slate-900">Tasks Summary</h3>
              <p className="text-xs text-rose-500 font-bold">24 Overdue Tasks</p>
            </div>
            <button className="px-3 py-1.5 bg-slate-50 text-slate-500 text-xs font-bold rounded-lg border border-slate-200">View Tasks</button>
          </div>
          
          <div className="flex items-center gap-12">
            <div className="relative w-48 h-48">
               <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-indigo-500" strokeWidth="3" strokeDasharray="60, 100" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-emerald-500" strokeWidth="3" strokeDasharray="30, 100" strokeDashoffset="-60" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-bold text-slate-900">237</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Total Tasks</p>
               </div>
            </div>
            <div className="flex-1 space-y-4">
              {[
                { label: 'Active', val: 30, color: 'bg-indigo-500' },
                { label: 'Completed', val: 45, color: 'bg-emerald-500' },
                { label: 'Overdue', val: 0, color: 'bg-rose-500' },
                { label: 'Yet to start', val: 25, color: 'bg-slate-200' },
              ].map(stat => (
                <div key={stat.label} className="flex items-center justify-between text-xs font-bold">
                  <div className="flex items-center gap-3 text-slate-400">
                    <span className={`w-2 h-2 rounded-full ${stat.color}`}></span>
                    {stat.label}
                  </div>
                  <span className="text-slate-900">{stat.val}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 p-4 bg-indigo-50/50 border border-dashed border-indigo-200 rounded-xl text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-indigo-600">Invite New .NET Collaborators</span> to create great outstanding business to business .jsp modutr class scripts
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-slate-900">Tasks Over Time</h3>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Complete
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Incomplete
                </div>
              </div>
            </div>
            <select className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1 outline-none font-bold text-slate-600">
              <option>2020 ... 2024</option>
            </select>
          </div>
          <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TASK_HISTORY}>
                  <defs>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                  <Tooltip />
                  <Area type="monotone" dataKey="incomplete" stroke="#4f46e5" strokeWidth={3} fill="url(#colorInc)" />
                  <Area type="monotone" dataKey="complete" stroke="#10b981" strokeWidth={3} fill="url(#colorComp)" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectManagement;
